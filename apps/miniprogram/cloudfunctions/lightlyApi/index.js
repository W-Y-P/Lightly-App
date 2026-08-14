const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const MIN_DAILY_INTAKE_KCAL = 1200
const MAX_PHOTO_BYTES = 1024 * 1024
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'other', 'drink'])
const COMPLETE_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner'])
const COMPLETE_MEAL_STATUSES = new Set(['recorded', 'fasting'])
const TREND_MAX_DAYS = 90
const QUERY_PAGE_SIZE = 100
const DAILY_ACTIVITY_BASELINE_MULTIPLIER = 1.2
const EXERCISE_CREDIT_RATIO = 0.7
const AI_REQUEST_TIMEOUT_MS = 24000
const AI_TEXT_DAILY_LIMIT = 30
const PHOTO_RESERVATION_TIMEOUT_MS = 60000
const DAILY_PLAN_SNAPSHOT_COLLECTION = 'dailyPlanSnapshots'
const ACCOUNT_COLLECTIONS = Object.freeze([
  'plans',
  DAILY_PLAN_SNAPSHOT_COLLECTION,
  'meals',
  'exercises',
  'weights',
  'pointsLedger',
  'photoUsage',
  'aiTextUsage',
  'feedback',
  'users',
])

const EXERCISE_MET_BY_TYPE = Object.freeze({
  '快走': 4.3,
  walking: 4.3,
  walk: 4.3,
  '慢跑': 7,
  jogging: 7,
  running: 8,
  run: 8,
  '游泳': 6,
  swimming: 6,
  swim: 6,
  '骑行': 6.8,
  cycling: 6.8,
  bicycle: 6.8,
  '跳绳': 11.8,
  jumprope: 11.8,
  '瑜伽': 2.5,
  yoga: 2.5,
  '力量训练': 5,
  strength: 5,
  weighttraining: 5,
  hiit: 8,
  '舞蹈': 5,
  dancing: 5,
  dance: 5,
  '椭圆机': 5,
  elliptical: 5,
  '爬楼梯': 8.8,
  stairs: 8.8,
  stairclimbing: 8.8,
  '其它': 4,
  other: 4,
})

function getOpenid() {
  const ctx = cloud.getWXContext()
  return (ctx && ctx.OPENID) || ''
}

function getBeijingDate(dateStr) {
  if (dateStr) return dateStr
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function previousDate(dateStr, offsetDays) {
  const date = new Date(`${dateStr}T00:00:00+08:00`)
  date.setDate(date.getDate() - offsetDays)
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key)
}

function isDateString(value) {
  const normalized = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false
  const parsed = new Date(`${normalized}T00:00:00+08:00`)
  return Number.isFinite(parsed.getTime())
    && new Date(parsed.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10) === normalized
}

function isWritableRecordDate(value, today = getBeijingDate()) {
  return isDateString(value) && value <= today
}

function isMorningContext(value) {
  return /morning|早|晨|空腹/i.test(String(value || ''))
}

function selectCalibrationWeight(weights, today = getBeijingDate()) {
  const eligible = (weights || []).filter((weight) => isWritableRecordDate(weight.date, today))
  return eligible.find((weight) => isMorningContext(weight.weighingContext)) || eligible[0] || null
}

function stableDocumentId(...parts) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32)
}

function normalizeClientRequestId(value) {
  if (value == null) return null
  const normalized = String(value).trim().slice(0, 120)
  return normalized || null
}

function idempotentDocumentId(resource, openid, clientRequestId) {
  const normalized = normalizeClientRequestId(clientRequestId)
  return normalized ? stableDocumentId(resource, openid, normalized) : null
}

function canonicalizeFingerprintValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeFingerprintValue)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = canonicalizeFingerprintValue(value[key])
      return result
    }, {})
  }
  return value
}

function createRequestFingerprint(resource, value) {
  const canonical = JSON.stringify(canonicalizeFingerprintValue(value))
  return crypto.createHash('sha256').update(`v1:${resource}:${canonical}`).digest('hex')
}

function unwrapTransactionResult(result) {
  return result && hasOwn(result, 'result') ? result.result : result
}

function isDocumentNotFoundError(err) {
  const text = `${err && err.errMsg ? err.errMsg : ''} ${err && err.message ? err.message : ''} ${String(err || '')}`.toLowerCase()
  return text.includes('does not exist') || text.includes('not exist') || text.includes('not found') || text.includes('document_not_exist')
}

async function getTransactionDocument(transaction, collectionName, id) {
  try {
    const result = await transaction.collection(collectionName).doc(id).get()
    return result && result.data
  } catch (err) {
    if (isDocumentNotFoundError(err)) return null
    throw err
  }
}

function resolveExistingIdempotentDocument(documentId, existing, requestFingerprint) {
  if (!existing) return null
  if (!existing.requestFingerprint || existing.requestFingerprint !== requestFingerprint) {
    return { document: { _id: documentId, ...existing }, deduplicated: false, conflict: true }
  }
  return { document: { _id: documentId, ...existing }, deduplicated: true, conflict: false }
}

async function createDocumentIdempotently(collectionName, resource, openid, clientRequestId, data, fingerprintInput = data) {
  const normalizedRequestId = normalizeClientRequestId(clientRequestId)
  if (!normalizedRequestId) {
    const result = await db.collection(collectionName).add({ data })
    return { document: { _id: result._id, ...data }, deduplicated: false, conflict: false }
  }

  const documentId = idempotentDocumentId(resource, openid, normalizedRequestId)
  const requestFingerprint = createRequestFingerprint(resource, fingerprintInput)
  const document = { ...data, clientRequestId: normalizedRequestId, requestFingerprint }
  if (typeof db.runTransaction === 'function') {
    const result = await db.runTransaction(async (transaction) => {
      const existing = await getTransactionDocument(transaction, collectionName, documentId)
      const existingResult = resolveExistingIdempotentDocument(documentId, existing, requestFingerprint)
      if (existingResult) return existingResult
      await transaction.collection(collectionName).doc(documentId).set({ data: document })
      return { document: { _id: documentId, ...document }, deduplicated: false, conflict: false }
    })
    return unwrapTransactionResult(result)
  }

  try {
    const existing = await db.collection(collectionName).doc(documentId).get()
    if (existing && existing.data) {
      return resolveExistingIdempotentDocument(documentId, existing.data, requestFingerprint)
    }
  } catch (err) {
    if (!isDocumentNotFoundError(err)) throw err
  }
  await db.collection(collectionName).doc(documentId).set({ data: document })
  return { document: { _id: documentId, ...document }, deduplicated: false, conflict: false }
}

function calcBMR(sex, age, heightCm, weightKg) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'female' ? base - 161 : base + 5
}

function calcTDEE(bmr, activityMultiplier) {
  const multiplier = Number(activityMultiplier)
  return Math.round(bmr * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : DAILY_ACTIVITY_BASELINE_MULTIPLIER))
}

function calcMacros(recommendedIntakeKcal, weightKg) {
  const proteinG = Math.round(clamp(weightKg * 1.6, 60, 220))
  const fatG = Math.round(clamp((recommendedIntakeKcal * 0.25) / 9, 35, 120))
  const remainKcal = Math.max(recommendedIntakeKcal - proteinG * 4 - fatG * 9, 400)
  const carbG = Math.round(remainKcal / 4)
  return {
    proteinMinG: Math.round(proteinG * 0.9),
    proteinMaxG: Math.round(proteinG * 1.1),
    fatMinG: Math.round(fatG * 0.9),
    fatMaxG: Math.round(fatG * 1.1),
    carbMinG: Math.round(carbG * 0.9),
    carbMaxG: Math.round(carbG * 1.1),
  }
}

function calculateEnergyTargets(tdeeKcal, requestedDeficitKcal) {
  const normalizedTdee = Math.max(0, Math.round(Number(tdeeKcal) || 0))
  const requestedDailyDeficitTargetKcal = Math.max(0, Math.round(Number(requestedDeficitKcal) || 0))
  const recommendedIntakeKcal = Math.max(MIN_DAILY_INTAKE_KCAL, normalizedTdee - requestedDailyDeficitTargetKcal)
  const dailyDeficitTargetKcal = Math.max(0, normalizedTdee - recommendedIntakeKcal)
  return {
    requestedDailyDeficitTargetKcal,
    dailyDeficitTargetKcal,
    recommendedIntakeKcal,
  }
}

function calculatePlanMetrics(plan, currentWeightKg) {
  const bmrKcal = Math.round(calcBMR(plan.sex, Number(plan.age), Number(plan.heightCm), currentWeightKg))
  const tdeeKcal = calcTDEE(bmrKcal, plan.activityLevel || plan.activityMultiplier)
  let dailyDeficitTargetKcal = 0
  if (plan.weeklyLossKg != null) {
    dailyDeficitTargetKcal = Math.round((Number(plan.weeklyLossKg) * 7700) / 7)
  } else if (plan.targetDate) {
    const days = Math.max(1, Math.ceil((new Date(`${plan.targetDate}T00:00:00+08:00`).getTime() - Date.now()) / 86400000))
    dailyDeficitTargetKcal = Math.max(0, Math.round(((currentWeightKg - Number(plan.targetWeightKg)) * 7700) / days))
  }
  const energyTargets = calculateEnergyTargets(tdeeKcal, dailyDeficitTargetKcal)
  return {
    currentWeightKg,
    bmrKcal,
    tdeeKcal,
    ...energyTargets,
    ...calcMacros(energyTargets.recommendedIntakeKcal, currentWeightKg),
  }
}

function energyMetricsOnly(metrics) {
  return {
    currentWeightKg: metrics.currentWeightKg,
    bmrKcal: metrics.bmrKcal,
    tdeeKcal: metrics.tdeeKcal,
    requestedDailyDeficitTargetKcal: metrics.requestedDailyDeficitTargetKcal,
    dailyDeficitTargetKcal: metrics.dailyDeficitTargetKcal,
    recommendedIntakeKcal: metrics.recommendedIntakeKcal,
  }
}

function getEffectivePlanEnergy(plan) {
  const storedTdee = Math.max(0, Math.round(Number(plan && plan.tdeeKcal) || 0))
  const bmrKcal = Number(plan && plan.bmrKcal)
  const tdeeKcal = Number.isFinite(bmrKcal) && bmrKcal > 0
    ? calcTDEE(bmrKcal, plan.activityLevel || plan.activityMultiplier)
    : storedTdee
  const requestedTarget = Number(plan && plan.requestedDailyDeficitTargetKcal)
  const storedTarget = Number(plan && plan.dailyDeficitTargetKcal)
  const energyTargets = calculateEnergyTargets(
    tdeeKcal,
    Number.isFinite(requestedTarget) ? requestedTarget : storedTarget
  )
  return {
    tdeeKcal,
    recommendedIntakeKcal: energyTargets.recommendedIntakeKcal,
    targetDeficitKcal: energyTargets.dailyDeficitTargetKcal,
  }
}

function buildDailyPlanSnapshot(plan) {
  if (!plan) return null
  const energy = getEffectivePlanEnergy(plan)
  return {
    planId: plan._id || plan.id || null,
    tdeeKcal: energy.tdeeKcal,
    recommendedIntakeKcal: energy.recommendedIntakeKcal,
    dailyDeficitTargetKcal: energy.targetDeficitKcal,
  }
}

function timestampToBeijingDate(value) {
  if (!value) return null
  const milliseconds = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(milliseconds)) return null
  return new Date(milliseconds + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function getPlanEffectiveDate(plan) {
  if (isDateString(plan && plan.effectiveFromDate)) return plan.effectiveFromDate
  return timestampToBeijingDate(plan && plan.createdAt)
}

function selectEffectivePlanForDate(plans, date) {
  const candidates = (plans || []).map((plan, index) => ({
    plan,
    index,
    effectiveDate: getPlanEffectiveDate(plan),
  }))
  const dated = candidates
    .filter((item) => item.effectiveDate && item.effectiveDate <= date)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.index - b.index)
  if (dated.length) return dated[dated.length - 1].plan
  const legacy = candidates.filter((item) => !item.effectiveDate)
  return legacy.length ? legacy[legacy.length - 1].plan : null
}

function resolvePlanEnergyForDate(date, snapshots, plans) {
  const snapshot = (snapshots || []).find((item) => item && item.date === date)
  return snapshot || buildDailyPlanSnapshot(selectEffectivePlanForDate(plans, date))
}

function getMissingPlanSnapshotDates(meals, exercises, snapshots, today = getBeijingDate()) {
  const capturedDates = new Set((snapshots || []).map((snapshot) => snapshot.date))
  return [...new Set([
    ...(meals || []).map((meal) => meal.date),
    ...(exercises || []).map((exercise) => exercise.date),
  ])].filter((date) => isWritableRecordDate(date, today) && !capturedDates.has(date))
}

function isValidMealType(value) {
  return typeof value === 'string' && MEAL_TYPES.has(value)
}

function countCompleteMealSlots(meals) {
  return new Set((meals || [])
    .filter((meal) => COMPLETE_MEAL_STATUSES.has(meal.status || 'recorded') && COMPLETE_MEAL_TYPES.has(meal.mealSlot))
    .map((meal) => meal.mealSlot)).size
}

function calculateDailySummaryMetrics(plan, intakeKcal, exerciseKcal, isRecordComplete) {
  const energy = getEffectivePlanEnergy(plan)
  const normalizedIntake = Math.round(Number(intakeKcal) || 0)
  const normalizedExerciseKcal = Math.round(Number(exerciseKcal) || 0)
  const effectiveExerciseKcal = Math.round(normalizedExerciseKcal * EXERCISE_CREDIT_RATIO)
  const dynamicRecommendedIntakeKcal = energy.recommendedIntakeKcal + effectiveExerciseKcal
  const actualDeficitKcal = isRecordComplete
    ? Math.round(energy.tdeeKcal + normalizedExerciseKcal - normalizedIntake)
    : 0
  const remainingIntakeKcal = Math.round(dynamicRecommendedIntakeKcal - normalizedIntake)
  const achievementRate = isRecordComplete && energy.targetDeficitKcal > 0
    ? Math.max(0, Math.round((actualDeficitKcal / energy.targetDeficitKcal) * 100) / 100)
    : 0
  return {
    ...energy,
    actualDeficitKcal,
    remainingIntakeKcal,
    achievementRate,
    effectiveExerciseKcal,
    dynamicRecommendedIntakeKcal,
  }
}

function ensureUser(openid) {
  return db.collection('users').where({ openid }).limit(1).get().then((res) => {
    if (res.data.length) return res.data[0]
    const doc = {
      openid,
      createdAt: db.serverDate(),
      pointBalance: 0,
      photoQuota: {
        freeDaily: 1,
        lastDate: '',
        freeUsedToday: 0,
      },
    }
    const userId = stableDocumentId('user', openid)
    return db.collection('users').doc(userId).set({ data: doc }).then(() => ({ _id: userId, ...doc }))
  })
}

function formatEntitlementResponse(user, today, committedTotalToday = 0) {
  const quota = user.photoQuota || { freeDaily: 1, lastDate: '', freeUsedToday: 0 }
  const sameDay = quota.lastDate === today
  const freeUsedToday = sameDay ? (quota.freeUsedToday || 0) : 0
  const configuredDaily = Number(quota.freeDaily)
  const freeDaily = Number.isFinite(configuredDaily) && configuredDaily >= 0 ? Math.floor(configuredDaily) : 1
  return {
    code: 0,
    data: {
      pointBalance: user.pointBalance || 0,
      photoQuota: {
        freeRemaining: Math.max(0, freeDaily - freeUsedToday),
        freeUsed: freeUsedToday,
        totalToday: Math.max(0, Math.floor(Number(committedTotalToday) || 0)),
        freeDaily,
      },
    },
    message: 'ok',
  }
}

async function getEntitlement(payload, openid) {
  const today = getBeijingDate(payload && payload.date)
  let user = await ensureUser(openid)
  await recoverExpiredPhotoReservations(user._id, openid)
  user = await ensureUser(openid)
  const countResult = await db.collection('photoUsage').where({ openid, date: today, status: 'committed' }).count()
  return formatEntitlementResponse(user, today, countResult.total)
}

async function awardDailyStarIfEligible(openid, date, actualDeficitKcal, targetDeficitKcal) {
  const today = date || getBeijingDate()
  if (!isWritableRecordDate(today)) {
    return {
      awarded: false,
      isRecordComplete: false,
      recordedMealSlots: 0,
      pointAwarded: false,
      warnings: ['future_date_not_eligible'],
    }
  }
  const ledgerId = stableDocumentId('daily_star', openid, today)
  const [mealRes, ledgerRes] = await Promise.all([
    db.collection('meals').where({ openid, date: today }).get(),
    db.collection('pointsLedger').where({ openid, date: today, reason: 'daily_star' }).get(),
  ])
  const meals = mealRes.data || []
  const recordedMealSlots = countCompleteMealSlots(meals)
  const isRecordComplete = recordedMealSlots >= 2
  const reachedTarget = targetDeficitKcal > 0 && actualDeficitKcal >= targetDeficitKcal * 0.8
  const alreadyAwarded = (ledgerRes.data || []).length > 0
  if (alreadyAwarded || !isRecordComplete || !reachedTarget) {
    return {
      awarded: alreadyAwarded,
      isRecordComplete,
      recordedMealSlots,
      pointAwarded: false,
      warnings: [],
    }
  }

  const user = await ensureUser(openid)
  const ledgerDoc = {
    openid,
    date: today,
    reason: 'daily_star',
    points: 1,
    createdAt: db.serverDate(),
  }
  let pointAwarded = false
  if (typeof db.runTransaction === 'function' && user._id) {
    const txResult = await db.runTransaction(async (transaction) => {
      const existing = await getTransactionDocument(transaction, 'pointsLedger', ledgerId)
      if (existing) return false
      await transaction.collection('pointsLedger').doc(ledgerId).set({ data: ledgerDoc })
      await transaction.collection('users').doc(user._id).update({ data: { pointBalance: _.inc(1) } })
      return true
    })
    pointAwarded = Boolean(unwrapTransactionResult(txResult))
  } else {
    const setResult = await db.collection('pointsLedger').doc(ledgerId).set({ data: ledgerDoc })
    const created = Boolean(setResult && setResult.stats && setResult.stats.created === 1)
    if (created) {
      await db.collection('users').where({ openid }).update({ data: { pointBalance: _.inc(1) } })
      pointAwarded = true
    }
  }
  return {
    awarded: true,
    isRecordComplete: true,
    recordedMealSlots,
    pointAwarded,
    warnings: [],
  }
}

function authWechat(payload, openid) {
  if (!payload || !payload.code) {
    return { code: 400, data: null, message: 'code required' }
  }
  const userId = `wx_${openid || payload.code.slice(0, 16)}`
  return {
    code: 0,
    data: { token: `cloud_${userId}`, userId, isNew: false },
    message: 'ok',
  }
}

function authGuest(payload, openid) {
  const fallbackOpenid = openid || `guest_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const userId = `guest_${fallbackOpenid.slice(0, 16)}`
  return {
    code: 0,
    data: { token: `cloud_${userId}`, userId, isNew: true },
    message: 'ok',
  }
}

async function createPlan(payload, openid) {
  if (!payload || typeof payload !== 'object') {
    return { code: 400, data: null, message: 'plan payload required' }
  }
  const required = ['sex', 'age', 'heightCm', 'currentWeightKg', 'targetWeightKg', 'activityMultiplier']
  for (const key of required) {
    if (payload[key] == null) {
      return { code: 400, data: null, message: `${key} required` }
    }
  }
  const age = Number(payload.age)
  const heightCm = Number(payload.heightCm)
  const currentWeightKg = Number(payload.currentWeightKg)
  const targetWeightKg = Number(payload.targetWeightKg)
  const activityMultiplier = Number(payload.activityMultiplier)
  const hasWeeklyLoss = payload.weeklyLossKg != null
  const hasTargetDate = Boolean(payload.targetDate)
  const weeklyLossKg = hasWeeklyLoss ? Number(payload.weeklyLossKg) : null
  const targetDate = hasTargetDate ? String(payload.targetDate) : null
  if (!['male', 'female'].includes(payload.sex)) {
    return { code: 400, data: null, message: 'invalid sex' }
  }
  if (!Number.isInteger(age) || age < 6 || age > 100) {
    return { code: 400, data: null, message: 'invalid age' }
  }
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230) {
    return { code: 400, data: null, message: 'invalid heightCm' }
  }
  if (!Number.isFinite(currentWeightKg) || currentWeightKg < 20 || currentWeightKg > 250) {
    return { code: 400, data: null, message: 'invalid currentWeightKg' }
  }
  if (!Number.isFinite(targetWeightKg) || targetWeightKg < 20 || targetWeightKg >= currentWeightKg) {
    return { code: 400, data: null, message: 'invalid targetWeightKg' }
  }
  if (!Number.isFinite(activityMultiplier) || activityMultiplier < 1.2 || activityMultiplier > 2) {
    return { code: 400, data: null, message: 'invalid activityMultiplier' }
  }
  if (weeklyLossKg != null && (!Number.isFinite(weeklyLossKg) || weeklyLossKg < 0.1 || weeklyLossKg > 2)) {
    return { code: 400, data: null, message: 'invalid weeklyLossKg' }
  }
  if (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || new Date(`${targetDate}T23:59:59+08:00`).getTime() <= Date.now())) {
    return { code: 400, data: null, message: 'invalid targetDate' }
  }
  if (hasWeeklyLoss === hasTargetDate) {
    return { code: 400, data: null, message: 'weeklyLossKg or targetDate required' }
  }
  const bmrKcal = Math.round(calcBMR(payload.sex, age, heightCm, currentWeightKg))
  const tdeeKcal = calcTDEE(bmrKcal, activityMultiplier)
  const daysToTarget = targetDate
    ? Math.max(1, Math.ceil((new Date(`${targetDate}T00:00:00+08:00`).getTime() - Date.now()) / 86400000))
    : null
  const dailyDeficitTargetKcal = weeklyLossKg
    ? Math.round((weeklyLossKg * 7700) / 7)
    : Math.round(((currentWeightKg - targetWeightKg) * 7700) / daysToTarget)
  const energyTargets = calculateEnergyTargets(tdeeKcal, dailyDeficitTargetKcal)
  const macros = calcMacros(energyTargets.recommendedIntakeKcal, currentWeightKg)
  const warnings = []
  const estimatedWeeklyLoss = weeklyLossKg || ((currentWeightKg - targetWeightKg) / daysToTarget) * 7
  if (age < 18) warnings.push('未成年人应优先保证生长发育所需营养，并建议由监护人或专业人员共同关注。')
  if (estimatedWeeklyLoss > 0.75 || estimatedWeeklyLoss / currentWeightKg > 0.01) warnings.push('当前减重速度偏快，请关注疲劳、饥饿与恢复情况。')
  const planDoc = {
    openid,
    currentWeightKg,
    initialWeightKg: currentWeightKg,
    targetWeightKg,
    targetDate,
    weeklyLossKg,
    heightCm,
    age,
    sex: payload.sex,
    activityLevel: activityMultiplier,
    effectiveFromDate: getBeijingDate(),
    bmrKcal,
    tdeeKcal,
    ...energyTargets,
    ...macros,
    createdAt: db.serverDate(),
  }
  const fingerprintInput = {
    sex: payload.sex,
    age,
    heightCm,
    currentWeightKg,
    targetWeightKg,
    activityMultiplier,
    weeklyLossKg,
    targetDate,
  }
  const created = await createDocumentIdempotently('plans', 'plan', openid, payload.clientRequestId, planDoc, fingerprintInput)
  if (created.conflict) {
    return { code: 409, data: { conflict: true, resource: 'plan' }, message: 'idempotency_conflict' }
  }
  const publicPlan = { ...created.document }
  delete publicPlan.openid
  return {
    code: 0,
    data: { plan: publicPlan, warnings, deduplicated: created.deduplicated },
    message: 'ok',
  }
}

function getCurrentPlan(payload, openid) {
  return db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get().then((res) => {
    const plan = res.data && res.data[0]
    if (!plan) return { code: 0, data: { plan: null }, message: 'ok' }
    const effectiveEnergy = getEffectivePlanEnergy(plan)
    plan.tdeeKcal = effectiveEnergy.tdeeKcal
    plan.dailyDeficitTargetKcal = effectiveEnergy.targetDeficitKcal
    plan.recommendedIntakeKcal = effectiveEnergy.recommendedIntakeKcal
    delete plan.openid
    return { code: 0, data: { plan }, message: 'ok' }
  })
}

async function refreshCurrentDailyPlanSnapshot(openid, plan) {
  const date = getBeijingDate()
  const snapshot = buildDailyPlanSnapshot(plan)
  if (!snapshot) return
  const snapshotId = stableDocumentId('daily_plan_snapshot', openid, date)
  await db.collection(DAILY_PLAN_SNAPSHOT_COLLECTION).doc(snapshotId).set({
    data: {
      openid,
      date,
      ...snapshot,
      capturedAt: db.serverDate(),
    },
  })
}

function updatePlanGoal(payload, openid) {
  const mode = payload && payload.mode
  const hasTargetWeight = hasOwn(payload, 'targetWeightKg') && payload.targetWeightKg != null
  const hasWeeklyLoss = hasOwn(payload, 'weeklyLossKg') && payload.weeklyLossKg != null
  const hasTargetDate = hasOwn(payload, 'targetDate') && payload.targetDate != null && payload.targetDate !== ''
  const targetWeightKg = hasTargetWeight ? Number(payload.targetWeightKg) : null
  const weeklyLossKg = hasWeeklyLoss ? Number(payload.weeklyLossKg) : null
  const targetDate = hasTargetDate ? String(payload.targetDate) : null

  if (mode != null && !['weekly', 'date'].includes(mode)) {
    return Promise.resolve({ code: 400, data: null, message: 'invalid goal mode' })
  }
  if (!mode && hasWeeklyLoss && hasTargetDate) {
    return Promise.resolve({ code: 400, data: null, message: 'goal mode required when both weeklyLossKg and targetDate are provided' })
  }

  if (targetWeightKg != null && (!Number.isFinite(targetWeightKg) || targetWeightKg < 20 || targetWeightKg > 250)) {
    return Promise.resolve({ code: 400, data: null, message: 'invalid targetWeightKg' })
  }
  if (weeklyLossKg != null && (!Number.isFinite(weeklyLossKg) || weeklyLossKg < 0.1 || weeklyLossKg > 2)) {
    return Promise.resolve({ code: 400, data: null, message: 'invalid weeklyLossKg' })
  }
  if (targetDate != null && (!isDateString(targetDate) || new Date(`${targetDate}T23:59:59+08:00`).getTime() <= Date.now())) {
    return Promise.resolve({ code: 400, data: null, message: 'invalid targetDate' })
  }

  return db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get().then((res) => {
    const plan = res.data && res.data[0]
    if (!plan) return { code: 404, data: null, message: 'no_active_plan' }

    const nextTargetWeight = targetWeightKg ?? plan.targetWeightKg
    if (nextTargetWeight >= plan.currentWeightKg) {
      return { code: 400, data: null, message: 'targetWeightKg must be lower than currentWeightKg' }
    }
    const inferredMode = mode || (hasWeeklyLoss ? 'weekly' : (hasTargetDate ? 'date' : (plan.targetDate ? 'date' : 'weekly')))
    const nextWeeklyLoss = inferredMode === 'weekly' ? (weeklyLossKg ?? plan.weeklyLossKg) : null
    const nextTargetDate = inferredMode === 'date' ? (targetDate ?? plan.targetDate) : null
    if (inferredMode === 'weekly' && nextWeeklyLoss == null) {
      return { code: 400, data: null, message: 'weeklyLossKg required for weekly mode' }
    }
    if (inferredMode === 'date' && !nextTargetDate) {
      return { code: 400, data: null, message: 'targetDate required for date mode' }
    }
    if (nextTargetDate && new Date(`${nextTargetDate}T23:59:59+08:00`).getTime() <= Date.now()) {
      return { code: 400, data: null, message: 'invalid targetDate' }
    }

    const metrics = calculatePlanMetrics({
      ...plan,
      targetWeightKg: nextTargetWeight,
      weeklyLossKg: nextWeeklyLoss,
      targetDate: nextTargetDate,
    }, plan.currentWeightKg)
    const updates = {
      targetWeightKg: nextTargetWeight,
      weeklyLossKg: nextWeeklyLoss,
      targetDate: nextTargetDate,
      ...energyMetricsOnly(metrics),
      updatedAt: db.serverDate(),
    }

    return db.collection('plans').doc(plan._id).update({ data: updates }).then(async () => {
      const updated = { ...plan, ...updates, id: plan._id }
      await refreshCurrentDailyPlanSnapshot(openid, updated)
      delete updated.openid
      delete updated._id
      return { code: 0, data: { plan: updated }, message: 'ok' }
    })
  })
}

function updatePlanMacros(payload, openid) {
  const keys = ['proteinMinG', 'proteinMaxG', 'carbMinG', 'carbMaxG', 'fatMinG', 'fatMaxG']
  const updates = {}
  for (const key of keys) {
    if (payload[key] == null) continue
    const value = Number(payload[key])
    if (!Number.isInteger(value) || value < 0 || value > 1000) {
      return Promise.resolve({ code: 400, data: null, message: `invalid ${key}` })
    }
    updates[key] = value
  }
  if (!Object.keys(updates).length) {
    return Promise.resolve({ code: 400, data: null, message: 'macro target required' })
  }

  return db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get().then((res) => {
    const plan = res.data && res.data[0]
    if (!plan) return { code: 404, data: null, message: 'no_active_plan' }
    const merged = { ...plan, ...updates }
    if (merged.proteinMinG > merged.proteinMaxG || merged.carbMinG > merged.carbMaxG || merged.fatMinG > merged.fatMaxG) {
      return { code: 400, data: null, message: 'macro min must not exceed max' }
    }

    const data = { ...updates, updatedAt: db.serverDate() }
    return db.collection('plans').doc(plan._id).update({ data }).then(() => {
      const updated = { ...plan, ...data, id: plan._id }
      delete updated.openid
      delete updated._id
      return { code: 0, data: { plan: updated }, message: 'ok' }
    })
  })
}

function updatePlanActivity(payload, openid) {
  const activityLevel = Number(payload && payload.activityLevel)
  if (!Number.isFinite(activityLevel) || activityLevel < 1.2 || activityLevel > 1.75) {
    return Promise.resolve({ code: 400, data: null, message: 'invalid activityLevel' })
  }

  return db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get().then((res) => {
    const plan = res.data && res.data[0]
    if (!plan) return { code: 404, data: null, message: 'no_active_plan' }

    const metrics = calculatePlanMetrics({ ...plan, activityLevel }, plan.currentWeightKg)
    const updates = {
      activityLevel,
      ...energyMetricsOnly(metrics),
      updatedAt: db.serverDate(),
    }
    return db.collection('plans').doc(plan._id).update({ data: updates }).then(async () => {
      const updated = { ...plan, ...updates, id: plan._id }
      await refreshCurrentDailyPlanSnapshot(openid, updated)
      delete updated.openid
      delete updated._id
      return { code: 0, data: { plan: updated }, message: 'ok' }
    })
  })
}

async function getDatabaseDocument(collectionName, id) {
  try {
    const result = await db.collection(collectionName).doc(id).get()
    return result && result.data
  } catch (err) {
    if (isDocumentNotFoundError(err)) return null
    throw err
  }
}

async function ensureDailyPlanSnapshot(openid, date, suppliedPlan) {
  if (!isWritableRecordDate(date)) return null
  let plan = suppliedPlan
  if (plan === undefined) {
    const plans = await fetchPaginated(() => db.collection('plans').where({ openid }).orderBy('createdAt', 'asc'))
    plan = selectEffectivePlanForDate(plans, date)
  }
  const snapshot = buildDailyPlanSnapshot(plan)
  if (!snapshot) return null
  const snapshotId = stableDocumentId('daily_plan_snapshot', openid, date)
  const document = {
    openid,
    date,
    ...snapshot,
    capturedAt: db.serverDate(),
  }
  if (typeof db.runTransaction === 'function') {
    const result = await db.runTransaction(async (transaction) => {
      const existing = await getTransactionDocument(transaction, DAILY_PLAN_SNAPSHOT_COLLECTION, snapshotId)
      if (existing) return existing
      await transaction.collection(DAILY_PLAN_SNAPSHOT_COLLECTION).doc(snapshotId).set({ data: document })
      return { _id: snapshotId, ...document }
    })
    return unwrapTransactionResult(result)
  }
  const existing = await getDatabaseDocument(DAILY_PLAN_SNAPSHOT_COLLECTION, snapshotId)
  if (existing) return existing
  await db.collection(DAILY_PLAN_SNAPSHOT_COLLECTION).doc(snapshotId).set({ data: document })
  return { _id: snapshotId, ...document }
}

async function getDailySummary(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  const snapshotId = stableDocumentId('daily_plan_snapshot', openid, date)
  const [plans, storedSnapshot, mealRes, exerciseRes] = await Promise.all([
    fetchPaginated(() => db.collection('plans').where({ openid }).orderBy('createdAt', 'asc')),
    getDatabaseDocument(DAILY_PLAN_SNAPSHOT_COLLECTION, snapshotId),
    db.collection('meals').where({ openid, date }).get(),
    db.collection('exercises').where({ openid, date }).get(),
  ])
  const meals = mealRes.data || []
  const exercises = exerciseRes.data || []
  let planSnapshot = storedSnapshot || resolvePlanEnergyForDate(date, [], plans)
  if (!storedSnapshot && planSnapshot && (meals.length || exercises.length)) {
    const effectivePlan = selectEffectivePlanForDate(plans, date)
    planSnapshot = await ensureDailyPlanSnapshot(openid, date, effectivePlan) || planSnapshot
  }
  const intake = {
    totalKcal: Math.round(meals.reduce((s, m) => s + (m.totalKcal || 0), 0)),
    carbG: Math.round(meals.reduce((s, m) => s + (m.carbG || (m.items || []).reduce((x, i) => x + (i.carbG || 0), 0)), 0)),
    proteinG: Math.round(meals.reduce((s, m) => s + (m.proteinG || (m.items || []).reduce((x, i) => x + (i.proteinG || 0), 0)), 0)),
    fatG: Math.round(meals.reduce((s, m) => s + (m.fatG || (m.items || []).reduce((x, i) => x + (i.fatG || 0), 0)), 0)),
  }
  const exercise = {
    totalKcal: Math.round(exercises.reduce((s, e) => s + (e.confirmedKcal || 0), 0)),
    count: exercises.length,
  }
  const hasPlan = !!planSnapshot
  const planEnergy = hasPlan ? getEffectivePlanEnergy(planSnapshot) : null
  const recordedMealSlots = countCompleteMealSlots(meals)
  const isRecordComplete = recordedMealSlots >= 2
  const summaryMetrics = hasPlan
    ? calculateDailySummaryMetrics(planSnapshot, intake.totalKcal, exercise.totalKcal, isRecordComplete)
    : {
        actualDeficitKcal: 0,
        remainingIntakeKcal: 0,
        achievementRate: 0,
        effectiveExerciseKcal: 0,
        dynamicRecommendedIntakeKcal: 0,
      }
  const planView = hasPlan ? {
    tdeeKcal: planEnergy.tdeeKcal,
    targetDeficitKcal: planEnergy.targetDeficitKcal,
    recommendedIntakeKcal: summaryMetrics.dynamicRecommendedIntakeKcal,
  } : null
  const star = await awardDailyStarIfEligible(
    openid,
    date,
    summaryMetrics.actualDeficitKcal,
    hasPlan ? planEnergy.targetDeficitKcal : 0
  )
  const [user, ledgerRes] = await Promise.all([
    ensureUser(openid),
    db.collection('pointsLedger').where({ openid, reason: 'daily_star' }).orderBy('date', 'desc').limit(400).get(),
  ])
  const awardedDates = [...new Set((ledgerRes.data || []).map((entry) => entry.date))]
  const awardedSet = new Set(awardedDates)
  const streakStart = awardedSet.has(date) ? date : previousDate(date, 1)
  let consecutiveDays = 0
  while (awardedSet.has(previousDate(streakStart, consecutiveDays))) consecutiveDays += 1
  return {
    code: 0,
    data: {
      date,
      hasPlan,
      message: hasPlan ? undefined : '未找到计划',
      plan: planView,
      intake,
      exercise,
      summary: {
        actualDeficitKcal: summaryMetrics.actualDeficitKcal,
        remainingIntakeKcal: summaryMetrics.remainingIntakeKcal,
        achievementRate: summaryMetrics.achievementRate,
        effectiveExerciseKcal: summaryMetrics.effectiveExerciseKcal,
        dynamicRecommendedIntakeKcal: summaryMetrics.dynamicRecommendedIntakeKcal,
      },
      star: { ...star, consecutiveDays, cumulativeStars: awardedDates.length },
      pointBalance: user.pointBalance || 0,
    },
    message: 'ok',
  }
}

function publicMeal(meal) {
  return {
    id: meal._id || meal.id,
    date: meal.date,
    mealSlot: meal.mealSlot,
    status: meal.status || 'recorded',
    totalKcal: meal.totalKcal || 0,
    carbG: meal.carbG || 0,
    proteinG: meal.proteinG || 0,
    fatG: meal.fatG || 0,
    items: meal.items || [],
    createdAt: meal.createdAt,
    updatedAt: meal.updatedAt,
    clientRequestId: meal.clientRequestId || undefined,
  }
}

function normalizeMeal(payload, existing) {
  const status = hasOwn(payload, 'status') ? payload.status : ((existing && existing.status) || 'recorded')
  if (!['recorded', 'skipped', 'fasting'].includes(status)) {
    return { error: 'invalid meal status' }
  }
  const sourceItems = status === 'recorded'
    ? (hasOwn(payload, 'items') ? payload.items : ((existing && existing.items) || []))
    : []
  if (!Array.isArray(sourceItems)) return { error: 'items must be an array' }
  const items = sourceItems.map((it) => ({
    foodName: String((it && it.foodName) || '').trim().slice(0, 80),
    quantityG: Number((it && it.quantityG) || 0),
    kcal: Number((it && it.kcal) || 0),
    carbG: Number((it && it.carbG) || 0),
    proteinG: Number((it && it.proteinG) || 0),
    fatG: Number((it && it.fatG) || 0),
  }))
  if (status === 'recorded') {
    if (!items.length || items.some((item) => !item.foodName)) return { error: 'recorded meal requires food items' }
    if (items.some((item) => !Number.isFinite(item.kcal) || item.kcal < 0)) return { error: 'recorded meal item kcal must be non-negative' }
    if (items.some((item) => !Number.isFinite(item.quantityG) || item.quantityG < 0
      || !Number.isFinite(item.carbG) || item.carbG < 0
      || !Number.isFinite(item.proteinG) || item.proteinG < 0
      || !Number.isFinite(item.fatG) || item.fatG < 0)) {
      return { error: 'invalid meal item nutrition' }
    }
  }
  const totals = {
    totalKcal: Math.round(items.reduce((sum, item) => sum + item.kcal, 0)),
    carbG: Math.round(items.reduce((sum, item) => sum + item.carbG, 0) * 10) / 10,
    proteinG: Math.round(items.reduce((sum, item) => sum + item.proteinG, 0) * 10) / 10,
    fatG: Math.round(items.reduce((sum, item) => sum + item.fatG, 0) * 10) / 10,
  }
  return { status, items, ...totals }
}

function getOwnedDocument(collectionName, id, openid) {
  if (!id || typeof id !== 'string') return Promise.resolve(null)
  return db.collection(collectionName).doc(id).get().then((res) => {
    const doc = res && res.data
    return doc && doc.openid === openid ? doc : null
  }).catch(() => null)
}

async function createMeal(payload, openid) {
  if (!payload || !isWritableRecordDate(payload.date) || !isValidMealType(payload.mealSlot)) {
    return Promise.resolve({ code: 400, data: null, message: 'non-future date and valid mealSlot required' })
  }
  const normalized = normalizeMeal(payload)
  if (normalized.error) return Promise.resolve({ code: 400, data: null, message: normalized.error })
  const mealDoc = {
    openid,
    date: payload.date,
    mealSlot: payload.mealSlot,
    ...normalized,
    createdAt: db.serverDate(),
  }
  const fingerprintInput = { date: payload.date, mealSlot: payload.mealSlot, ...normalized }
  const created = await createDocumentIdempotently('meals', 'meal', openid, payload.clientRequestId, mealDoc, fingerprintInput)
  if (created.conflict) {
    return { code: 409, data: { conflict: true, resource: 'meal' }, message: 'idempotency_conflict' }
  }
  await ensureDailyPlanSnapshot(openid, payload.date)
  return {
    code: 0,
    data: { meal: publicMeal(created.document), deduplicated: created.deduplicated },
    message: 'ok',
  }
}

async function updateMeal(payload, openid) {
  const meal = await getOwnedDocument('meals', payload && payload.id, openid)
  if (!meal) return { code: 404, data: null, message: 'meal_not_found' }
  const date = hasOwn(payload, 'date') ? payload.date : meal.date
  const mealSlot = hasOwn(payload, 'mealSlot') ? payload.mealSlot : meal.mealSlot
  if (!isWritableRecordDate(date) || !isValidMealType(mealSlot)) return { code: 400, data: null, message: 'non-future date and valid mealSlot required' }
  const normalized = normalizeMeal(payload, meal)
  if (normalized.error) return { code: 400, data: null, message: normalized.error }
  const updates = { date, mealSlot, ...normalized, updatedAt: db.serverDate() }
  await db.collection('meals').doc(meal._id).update({ data: updates })
  return { code: 0, data: { meal: publicMeal({ ...meal, ...updates }) }, message: 'ok' }
}

async function deleteMeal(payload, openid) {
  const meal = await getOwnedDocument('meals', payload && payload.id, openid)
  if (!meal) return { code: 404, data: null, message: 'meal_not_found' }
  await db.collection('meals').doc(meal._id).remove()
  return { code: 0, data: { deleted: true, meal: publicMeal(meal) }, message: 'ok' }
}

function getMeals(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  return db.collection('meals').where({ openid, date }).orderBy('createdAt', 'asc').limit(100).get().then((res) => {
    const meals = (res.data || []).map(publicMeal)
    const totals = {
      totalKcal: Math.round(meals.reduce((s, m) => s + (m.totalKcal || 0), 0)),
      carbG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.carbG || 0), 0), 0)),
      proteinG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.proteinG || 0), 0), 0)),
      fatG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.fatG || 0), 0), 0)),
    }
    return { code: 0, data: { meals, totals }, message: 'ok' }
  })
}

function normalizeExerciseTypeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function getExerciseMet(exerciseType) {
  const key = normalizeExerciseTypeKey(exerciseType)
  return EXERCISE_MET_BY_TYPE[key] || EXERCISE_MET_BY_TYPE.other
}

function estimateExerciseKcal(exerciseType, weightKg, durationMin) {
  const met = getExerciseMet(exerciseType)
  return Math.round((met * 3.5 * Number(weightKg) * Number(durationMin)) / 200)
}

function calculateExerciseEnergy(exerciseType, weightKg, durationMin, confirmedKcal) {
  const met = getExerciseMet(exerciseType)
  const estimatedKcal = estimateExerciseKcal(exerciseType, weightKg, durationMin)
  const override = Number(confirmedKcal)
  const isManual = Number.isFinite(override) && override > 0
  return {
    met,
    estimateWeightKg: weightKg,
    estimatedKcal,
    confirmedKcal: isManual ? Math.round(override) : estimatedKcal,
    calorieSource: isManual ? 'manual' : 'met',
  }
}

async function resolveExerciseWeight(openid, suppliedWeightKg, existingWeightKg) {
  const supplied = Number(suppliedWeightKg)
  if (Number.isFinite(supplied) && supplied >= 20 && supplied <= 250) return supplied
  const existing = Number(existingWeightKg)
  if (Number.isFinite(existing) && existing >= 20 && existing <= 250) return existing
  const [weightRes, planRes] = await Promise.all([
    db.collection('weights').where({ openid, date: _.lte(getBeijingDate()) }).orderBy('date', 'desc').limit(1).get(),
    db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get(),
  ])
  const latestWeight = Number(weightRes.data && weightRes.data[0] && weightRes.data[0].weightKg)
  if (Number.isFinite(latestWeight) && latestWeight >= 20 && latestWeight <= 250) return latestWeight
  const planWeight = Number(planRes.data && planRes.data[0] && planRes.data[0].currentWeightKg)
  return Number.isFinite(planWeight) && planWeight >= 20 && planWeight <= 250 ? planWeight : 70
}

async function createExercise(payload, openid) {
  if (!payload || !payload.date || !payload.exerciseType || payload.durationMin == null) {
    return { code: 400, data: null, message: 'date, exerciseType, durationMin required' }
  }
  const durationMin = Number(payload.durationMin)
  if (!isWritableRecordDate(payload.date) || !Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440) {
    return { code: 400, data: null, message: 'invalid exercise date or durationMin' }
  }
  const exerciseType = String(payload.exerciseType).trim().slice(0, 80)
  if (!exerciseType) return { code: 400, data: null, message: 'invalid exerciseType' }
  const weightKg = await resolveExerciseWeight(openid, payload.weightKg)
  const energy = calculateExerciseEnergy(exerciseType, weightKg, durationMin, payload.confirmedKcal)
  const doc = {
    openid,
    date: payload.date,
    exerciseType,
    durationMin,
    ...energy,
    createdAt: db.serverDate(),
  }
  const suppliedWeightKg = Number(payload.weightKg)
  const suppliedConfirmedKcal = Number(payload.confirmedKcal)
  const fingerprintInput = {
    date: payload.date,
    exerciseType,
    durationMin,
    weightKg: Number.isFinite(suppliedWeightKg) ? suppliedWeightKg : null,
    confirmedKcal: Number.isFinite(suppliedConfirmedKcal) && suppliedConfirmedKcal > 0 ? suppliedConfirmedKcal : null,
  }
  const created = await createDocumentIdempotently(
    'exercises',
    'exercise',
    openid,
    payload.clientRequestId,
    doc,
    fingerprintInput
  )
  if (created.conflict) {
    return { code: 409, data: { conflict: true, resource: 'exercise' }, message: 'idempotency_conflict' }
  }
  await ensureDailyPlanSnapshot(openid, payload.date)
  return {
    code: 0,
    data: { exercise: publicExercise(created.document), deduplicated: created.deduplicated },
    message: 'ok',
  }
}

function publicExercise(exercise) {
  return {
    id: exercise._id || exercise.id,
    date: exercise.date,
    exerciseType: exercise.exerciseType,
    durationMin: exercise.durationMin,
    met: exercise.met,
    estimateWeightKg: exercise.estimateWeightKg,
    estimatedKcal: exercise.estimatedKcal,
    confirmedKcal: exercise.confirmedKcal,
    calorieSource: exercise.calorieSource || (exercise.estimatedKcal === exercise.confirmedKcal ? 'met' : 'manual'),
    clientRequestId: exercise.clientRequestId || undefined,
  }
}

async function normalizeExerciseUpdate(payload, exercise, openid) {
  const date = hasOwn(payload, 'date') ? payload.date : exercise.date
  const exerciseType = hasOwn(payload, 'exerciseType') ? String(payload.exerciseType || '').trim().slice(0, 80) : exercise.exerciseType
  const durationMin = hasOwn(payload, 'durationMin') ? Number(payload.durationMin) : Number(exercise.durationMin)
  if (!isWritableRecordDate(date) || !exerciseType || !Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 1440) {
    return { error: 'invalid exercise fields' }
  }
  const needsRecalculation = hasOwn(payload, 'exerciseType') || hasOwn(payload, 'durationMin') || hasOwn(payload, 'weightKg')
  const hasEnergyMetadata = Number.isFinite(Number(exercise.met))
    && Number.isFinite(Number(exercise.estimateWeightKg))
    && Number.isFinite(Number(exercise.estimatedKcal))
  let energy = {
    met: exercise.met || getExerciseMet(exerciseType),
    estimateWeightKg: exercise.estimateWeightKg,
    estimatedKcal: exercise.estimatedKcal,
    confirmedKcal: Number(exercise.confirmedKcal),
    calorieSource: exercise.calorieSource || 'manual',
  }
  if (hasOwn(payload, 'confirmedKcal')) {
    const confirmedKcal = Number(payload.confirmedKcal)
    if (!Number.isFinite(confirmedKcal) || confirmedKcal <= 0) return { error: 'invalid confirmedKcal' }
    const weightKg = await resolveExerciseWeight(openid, payload.weightKg, exercise.estimateWeightKg)
    energy = calculateExerciseEnergy(exerciseType, weightKg, durationMin, confirmedKcal)
  } else if (needsRecalculation) {
    const weightKg = await resolveExerciseWeight(openid, payload.weightKg, exercise.estimateWeightKg)
    energy = calculateExerciseEnergy(exerciseType, weightKg, durationMin)
  } else if (!hasEnergyMetadata) {
    const weightKg = await resolveExerciseWeight(openid, undefined, exercise.estimateWeightKg)
    energy = calculateExerciseEnergy(exerciseType, weightKg, durationMin, exercise.confirmedKcal)
  }
  return { date, exerciseType, durationMin, ...energy }
}

async function updateExercise(payload, openid) {
  const exercise = await getOwnedDocument('exercises', payload && payload.id, openid)
  if (!exercise) return { code: 404, data: null, message: 'exercise_not_found' }
  const updates = await normalizeExerciseUpdate(payload, exercise, openid)
  if (updates.error) return { code: 400, data: null, message: updates.error }
  updates.updatedAt = db.serverDate()
  await db.collection('exercises').doc(exercise._id).update({ data: updates })
  return { code: 0, data: { exercise: publicExercise({ ...exercise, ...updates }) }, message: 'ok' }
}

async function deleteExercise(payload, openid) {
  const exercise = await getOwnedDocument('exercises', payload && payload.id, openid)
  if (!exercise) return { code: 404, data: null, message: 'exercise_not_found' }
  await db.collection('exercises').doc(exercise._id).remove()
  return { code: 0, data: { deleted: true, exercise: publicExercise(exercise) }, message: 'ok' }
}

function getExercises(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  return db.collection('exercises').where({ openid, date }).orderBy('createdAt', 'asc').limit(100).get().then((res) => {
    const exercises = (res.data || []).map(publicExercise)
    const totalKcal = Math.round(exercises.reduce((s, e) => s + (e.confirmedKcal || 0), 0))
    return { code: 0, data: { exercises, totalKcal }, message: 'ok' }
  })
}

function publicWeight(weight) {
  return {
    id: weight._id || weight.id,
    date: weight.date,
    weightKg: weight.weightKg,
    weighingContext: weight.weighingContext || 'morning',
    clientRequestId: weight.clientRequestId || undefined,
    createdAt: weight.createdAt || undefined,
  }
}

async function calibratePlanFromWeight(openid) {
  const [weightRes, planRes] = await Promise.all([
    db.collection('weights').where({ openid }).orderBy('date', 'desc').limit(200).get(),
    db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get(),
  ])
  const plan = planRes.data && planRes.data[0]
  const selected = selectCalibrationWeight(weightRes.data || [])
  if (!plan) {
    return {
      applied: false,
      standardizedWeightKg: selected ? selected.weightKg : null,
      source: selected ? (isMorningContext(selected.weighingContext) ? 'morning' : 'latest') : 'none',
      message: '体重记录已更新；尚无当前计划，因此未调整计划估算。',
    }
  }

  const baselineWeightKg = Number(plan.baselineWeightKg ?? plan.initialWeightKg ?? plan.currentWeightKg)
  const standardizedWeightKg = selected ? Number(selected.weightKg) : baselineWeightKg
  if (!Number.isFinite(standardizedWeightKg)) {
    return {
      applied: false,
      standardizedWeightKg: null,
      source: 'none',
      message: '暂无可用于重新校准计划的标准体重。',
    }
  }
  const metrics = calculatePlanMetrics(plan, standardizedWeightKg)
  const energyMetrics = energyMetricsOnly(metrics)
  const source = selected ? (isMorningContext(selected.weighingContext) ? 'morning' : 'latest') : 'baseline'
  const updates = {
    ...energyMetrics,
    baselineWeightKg,
    calibratedFromWeightId: selected ? selected._id : null,
    calibratedAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }
  await db.collection('plans').doc(plan._id).update({ data: updates })
  return {
    applied: true,
    standardizedWeightKg,
    standardizedDate: selected ? selected.date : null,
    source,
    plan: {
      id: plan._id,
      targetWeightKg: plan.targetWeightKg,
      targetDate: plan.targetDate || null,
      weeklyLossKg: plan.weeklyLossKg != null ? plan.weeklyLossKg : null,
      proteinMinG: plan.proteinMinG,
      proteinMaxG: plan.proteinMaxG,
      carbMinG: plan.carbMinG,
      carbMaxG: plan.carbMaxG,
      fatMinG: plan.fatMinG,
      fatMaxG: plan.fatMaxG,
      ...energyMetrics,
    },
    message: selected
      ? '已优先采用最近晨起体重更新当前计划的能量估算；宏量目标保持不变，结果仅供日常参考。'
      : '已回退到计划基线体重重新计算能量估算；宏量目标保持不变。',
  }
}

async function createWeight(payload, openid) {
  if (!payload || !payload.date || payload.weightKg == null) {
    return { code: 400, data: null, message: 'date and weightKg required' }
  }
  const weightKg = Number(payload.weightKg)
  if (!isWritableRecordDate(payload.date) || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 250) {
    return { code: 400, data: null, message: 'invalid date or weightKg' }
  }
  const doc = {
    openid,
    date: payload.date,
    weightKg,
    weighingContext: payload.weighingContext || 'morning',
    createdAt: db.serverDate(),
  }
  const fingerprintInput = {
    date: payload.date,
    weightKg,
    weighingContext: String(payload.weighingContext || 'morning'),
  }
  const created = await createDocumentIdempotently('weights', 'weight', openid, payload.clientRequestId, doc, fingerprintInput)
  if (created.conflict) {
    return { code: 409, data: { conflict: true, resource: 'weight' }, message: 'idempotency_conflict' }
  }
  const calibration = await calibratePlanFromWeight(openid)
  return {
    code: 0,
    data: { weight: publicWeight(created.document), calibration, deduplicated: created.deduplicated },
    message: 'ok',
  }
}

async function updateWeight(payload, openid) {
  const weight = await getOwnedDocument('weights', payload && payload.id, openid)
  if (!weight) return { code: 404, data: null, message: 'weight_not_found' }
  const date = hasOwn(payload, 'date') ? payload.date : weight.date
  const weightKg = hasOwn(payload, 'weightKg') ? Number(payload.weightKg) : Number(weight.weightKg)
  const weighingContext = hasOwn(payload, 'weighingContext') ? String(payload.weighingContext || 'morning') : (weight.weighingContext || 'morning')
  if (!isWritableRecordDate(date) || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 250) {
    return { code: 400, data: null, message: 'invalid date or weightKg' }
  }
  const updates = { date, weightKg, weighingContext, updatedAt: db.serverDate() }
  await db.collection('weights').doc(weight._id).update({ data: updates })
  const calibration = await calibratePlanFromWeight(openid)
  return { code: 0, data: { weight: publicWeight({ ...weight, ...updates }), calibration }, message: 'ok' }
}

async function deleteWeight(payload, openid) {
  const weight = await getOwnedDocument('weights', payload && payload.id, openid)
  if (!weight) return { code: 404, data: null, message: 'weight_not_found' }
  await db.collection('weights').doc(weight._id).remove()
  const calibration = await calibratePlanFromWeight(openid)
  return { code: 0, data: { deleted: true, weight: publicWeight(weight), calibration }, message: 'ok' }
}

function getWeights(payload, openid) {
  const from = payload && payload.from
  const to = payload && payload.to
  let query = db.collection('weights').where({ openid })
  if (from && to) {
    query = db.collection('weights').where({ openid, date: _.and(_.gte(from), _.lte(to)) })
  } else if (from) {
    query = db.collection('weights').where({ openid, date: _.gte(from) })
  } else if (to) {
    query = db.collection('weights').where({ openid, date: _.lte(to) })
  }
  return query.orderBy('date', 'asc').limit(200).get().then((res) => ({
    code: 0,
    data: { weights: (res.data || []).map(publicWeight) },
    message: 'ok',
  }))
}

function normalizeTrendDays(value) {
  const days = Math.floor(Number(value) || 30)
  return clamp(days, 1, TREND_MAX_DAYS)
}

async function fetchPaginated(buildQuery, pageSize = QUERY_PAGE_SIZE) {
  const rows = []
  let offset = 0
  while (true) {
    const result = await buildQuery().skip(offset).limit(pageSize).get()
    const page = result.data || []
    rows.push(...page)
    if (page.length < pageSize) return rows
    offset += page.length
  }
}

async function getWeightTrend(payload, openid) {
  const days = normalizeTrendDays(payload && payload.days)
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const today = now.toISOString().slice(0, 10)
  const startDate = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const weights = await fetchPaginated(() =>
    db.collection('weights').where({ openid, date: _.and(_.gte(startDate), _.lte(today)) }).orderBy('date', 'asc')
  )
  const byDate = new Map()
  weights.forEach((weight) => {
    const current = byDate.get(weight.date)
    const context = weight.weighingContext || 'morning'
    const isMorning = /morning|早|空腹/i.test(context)
    const createdAt = timestampMillis(weight.createdAt)
    const shouldReplace = !current
      || (isMorning && !current.isMorning)
      || (isMorning === current.isMorning && Number.isFinite(createdAt) && createdAt >= current.createdAt)
    if (shouldReplace) {
      byDate.set(weight.date, { date: weight.date, weightKg: weight.weightKg, weighingContext: context, isMorning, createdAt })
    }
  })
  const points = [...byDate.values()].map(({ isMorning, createdAt, ...point }) => point)
  return { code: 0, data: { points }, message: 'ok' }
}

async function getDeficitTrend(payload, openid) {
  const days = normalizeTrendDays(payload && payload.days)
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const today = now.toISOString().slice(0, 10)
  const startDate = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
  const [meals, exercises, snapshots, plans] = await Promise.all([
    fetchPaginated(() => db.collection('meals').where({ openid, date: _.and(_.gte(startDate), _.lte(today)) }).orderBy('date', 'asc')),
    fetchPaginated(() => db.collection('exercises').where({ openid, date: _.and(_.gte(startDate), _.lte(today)) }).orderBy('date', 'asc')),
    fetchPaginated(() => db.collection(DAILY_PLAN_SNAPSHOT_COLLECTION).where({
      openid,
      date: _.and(_.gte(startDate), _.lte(today)),
    }).orderBy('date', 'asc')),
    fetchPaginated(() => db.collection('plans').where({ openid }).orderBy('createdAt', 'asc')),
  ])
  const historicalDates = getMissingPlanSnapshotDates(meals, exercises, snapshots, today)
  for (const date of historicalDates) {
    const effectivePlan = selectEffectivePlanForDate(plans, date)
    const snapshot = await ensureDailyPlanSnapshot(openid, date, effectivePlan)
    if (snapshot) {
      snapshots.push(snapshot)
    }
  }
  const dateMap = {}
  const completeMealsByDate = {}
  meals.forEach((meal) => {
    if (!dateMap[meal.date]) dateMap[meal.date] = { date: meal.date, intakeKcal: 0, exerciseKcal: 0, actualDeficitKcal: 0 }
    dateMap[meal.date].intakeKcal += meal.totalKcal || 0
    if (!completeMealsByDate[meal.date]) completeMealsByDate[meal.date] = []
    completeMealsByDate[meal.date].push(meal)
  })
  exercises.forEach((exercise) => {
    if (!dateMap[exercise.date]) return
    dateMap[exercise.date].exerciseKcal += exercise.confirmedKcal || 0
  })
  Object.values(dateMap).forEach((day) => {
    day.intakeKcal = Math.round(day.intakeKcal)
    day.exerciseKcal = Math.round(day.exerciseKcal)
    const planSnapshot = resolvePlanEnergyForDate(day.date, snapshots, plans)
    day.actualDeficitKcal = planSnapshot
      ? calculateDailySummaryMetrics(planSnapshot, day.intakeKcal, day.exerciseKcal, true).actualDeficitKcal
      : 0
  })
  const data = Object.values(dateMap)
    .filter((item) => countCompleteMealSlots(completeMealsByDate[item.date]) >= 2)
    .sort((a, b) => a.date.localeCompare(b.date))
  return { code: 0, data: { data }, message: 'ok' }
}

function getAiConfig() {
  const baseUrl = (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/+$/, '')
  const apiKey = process.env.MIMO_API_KEY || ''
  const model = process.env.MIMO_MODEL || 'mimo-v2.5'
  return { provider: 'mimo', baseUrl, apiKey, model, enabled: Boolean(apiKey) }
}

function publicAiError(error) {
  const message = String((error && error.message) || error || '')
  if (/timeout|incomplete/i.test(message)) return { code: 504, message: 'ai_timeout' }
  if (/ai_http_429/.test(message)) return { code: 429, message: 'ai_rate_limited' }
  if (/invalid|empty|refused|too_large/i.test(message)) return { code: 502, message: 'ai_output_invalid' }
  return { code: 503, message: 'ai_unavailable' }
}

async function reserveAiTextUsage(openid, date) {
  if (typeof db.runTransaction !== 'function') return { allowed: false, unavailable: true }
  const id = idempotentDocumentId('ai-text-day', openid, date)
  return db.runTransaction(async (transaction) => {
    const existing = await getTransactionDocument(transaction, 'aiTextUsage', id)
    const count = Math.max(0, Math.floor(Number(existing && existing.count) || 0))
    if (count >= AI_TEXT_DAILY_LIMIT) return { allowed: false, remaining: 0 }
    const nextCount = count + 1
    await transaction.collection('aiTextUsage').doc(id).set({
      data: {
        openid,
        date,
        count: nextCount,
        limit: AI_TEXT_DAILY_LIMIT,
        updatedAt: db.serverDate(),
      },
    })
    return { allowed: true, remaining: AI_TEXT_DAILY_LIMIT - nextCount }
  })
}

function normalizeMealItems(rawItems) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => {
      const normalized = {
        foodName: String(item.foodName || '').trim().slice(0, 40),
        quantityG: Number(item.quantityG),
        kcal: Number(item.kcal),
        carbG: Number(item.carbG),
        proteinG: Number(item.proteinG),
        fatG: Number(item.fatG),
      }
      const numbers = [normalized.quantityG, normalized.kcal, normalized.carbG, normalized.proteinG, normalized.fatG]
      if (!normalized.foodName || numbers.some((value) => !Number.isFinite(value) || value < 0)) return null
      if (normalized.quantityG <= 0 || normalized.quantityG > 5000 || normalized.kcal > 10000
        || normalized.carbG > 2000 || normalized.proteinG > 1000 || normalized.fatG > 1000) return null
      if (normalized.kcal > 0 && normalized.carbG + normalized.proteinG + normalized.fatG <= 0) return null
      return {
        foodName: normalized.foodName,
        quantityG: Math.round(normalized.quantityG),
        kcal: Math.round(normalized.kcal),
        carbG: Math.round(normalized.carbG * 10) / 10,
        proteinG: Math.round(normalized.proteinG * 10) / 10,
        fatG: Math.round(normalized.fatG * 10) / 10,
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

function aggregateEstimate(items, confidence) {
  const safeItems = items
  return {
    foodName: safeItems.map((it) => it.foodName).join('+').slice(0, 40),
    kcal: Math.round(safeItems.reduce((s, it) => s + (it.kcal || 0), 0)),
    carbG: Math.round(safeItems.reduce((s, it) => s + (it.carbG || 0), 0) * 10) / 10,
    proteinG: Math.round(safeItems.reduce((s, it) => s + (it.proteinG || 0), 0) * 10) / 10,
    fatG: Math.round(safeItems.reduce((s, it) => s + (it.fatG || 0), 0) * 10) / 10,
    confidence,
  }
}

function buildMiMoChatBody({ description, imageBase64, mimeType }) {
  const config = getAiConfig()
  const userText = imageBase64
    ? '请识别图片中的每种可见食物，并估算可食用部分的克数、热量和三大营养素。'
    : `用户描述：${String(description || '').slice(0, 1200)}`
  const userContent = [{ type: 'text', text: userText }]
  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` },
    })
  }
  return {
    model: config.model,
    messages: [
      { role: 'system', content: buildMealPrompt(Boolean(imageBase64)) },
      { role: 'user', content: imageBase64 ? userContent : userText },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 1600,
    stream: false,
  }
}

function parseMiMoChatOutput(response) {
  if (!response || typeof response !== 'object') throw new Error('ai_invalid_response')
  if (response.error) throw new Error('ai_api_error')
  const choice = Array.isArray(response.choices) ? response.choices[0] : null
  if (!choice) throw new Error('ai_empty_output')
  if (choice.finish_reason === 'length') throw new Error('ai_incomplete_max_tokens')
  const text = String((choice.message && choice.message.content) || '')
  if (!text) throw new Error('ai_empty_output')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('ai_invalid_json')
  }
}

function callMiMoChat(requestBody) {
  const config = getAiConfig()
  if (!config.enabled) {
    return Promise.reject(new Error('ai_not_configured'))
  }

  const endpoint = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl}/chat/completions`
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') {
    return Promise.reject(new Error('ai_invalid_base_url'))
  }
  const transport = https
  const body = JSON.stringify(requestBody)

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    headers: {
      'api-key': config.apiKey,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  return new Promise((resolve, reject) => {
    let timeoutHandle
    const req = transport.request(options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
        if (Buffer.byteLength(data) > 1024 * 1024) req.destroy(new Error('ai_response_too_large'))
      })
      res.on('end', () => {
        clearTimeout(timeoutHandle)
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`ai_http_${res.statusCode}`))
          return
        }
        let json
        try {
          json = JSON.parse(data)
        } catch {
          reject(new Error('ai_invalid_response'))
          return
        }
        try {
          resolve(parseMiMoChatOutput(json))
        } catch (error) {
          reject(error)
        }
      })
    })
    timeoutHandle = setTimeout(() => {
      req.destroy(new Error('ai_timeout'))
    }, AI_REQUEST_TIMEOUT_MS)
    req.on('error', (err) => {
      clearTimeout(timeoutHandle)
      reject(err)
    })
    req.write(body)
    req.end()
  })
}

function buildMealPrompt(hasImage) {
  return [
    '你是减脂记录应用中的食物热量估算助手。',
    hasImage ? '根据图片拆分每种可见食物，并结合常见餐具估算份量。' : '根据自然语言描述拆分每种食物。',
    '数量按可食用部分估算；热量与碳水、蛋白质、脂肪必须对应同一份量。',
    '估算要保守、日常化，适合中国区饮食；不确定时给出合理近似值。',
    '提示语保持温和，不作医学诊断，不给绝对健康承诺，并提醒用户确认份量。',
    '只返回 JSON，不要附加解释、注释或 Markdown 代码块。',
    '返回格式：{"items":[{"foodName":"食物名称","quantityG":100,"kcal":100,"carbG":10,"proteinG":10,"fatG":5}],"message":"请确认份量"}。',
    'items 必须包含 1 至 12 项；每项六个字段都必须提供数值，未知营养素可保守估算为 0。',
  ].join('\n')
}

function estimateMealTextWithAi(description, openid) {
  return callMiMoChat(buildMiMoChatBody({ description, openid })).then((parsed) => {
    const items = normalizeMealItems(parsed.items)
    if (!items.length) throw new Error('ai_empty_items')
    return {
      items,
      estimate: aggregateEstimate(items, 0.72),
      message: parsed.message || '已根据描述生成估算，可继续手动调整。',
    }
  })
}

function estimateMealPhotoWithAi(imageBase64, mimeType, openid) {
  return callMiMoChat(buildMiMoChatBody({ imageBase64, mimeType, openid })).then((parsed) => {
    const items = normalizeMealItems(parsed.items)
    if (!items.length) throw new Error('ai_empty_items')
    return {
      items,
      estimate: aggregateEstimate(items, 0.68),
      message: parsed.message || '已根据图片生成估算，请确认后再入账。',
    }
  })
}

function detectImageMimeType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

function validatePhotoInput(payload) {
  const input = String((payload && payload.imageBase64) || '')
  if (!input) return { error: 'image required' }

  let imageBase64 = input
  let dataUrlMimeType = null
  if (/^data:/i.test(input)) {
    const match = input.match(/^data:([^;,]+);base64,([\s\S]*)$/i)
    if (!match) return { error: 'invalid image data URL' }
    dataUrlMimeType = match[1].trim().toLowerCase()
    imageBase64 = match[2]
  }

  const suppliedMimeType = payload && (payload.mimeType || payload.contentType)
  const mimeType = String(dataUrlMimeType || suppliedMimeType || 'image/jpeg').trim().toLowerCase()
  if (!PHOTO_MIME_TYPES.has(mimeType)) return { error: 'invalid image mimeType' }
  if (dataUrlMimeType && suppliedMimeType && String(suppliedMimeType).trim().toLowerCase() !== dataUrlMimeType) {
    return { error: 'image mimeType does not match data URL' }
  }

  const compact = imageBase64.replace(/\s/g, '')
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    return { error: 'invalid image base64' }
  }
  const bytes = Buffer.from(compact, 'base64')
  const canonical = bytes.toString('base64').replace(/=+$/, '')
  if (!bytes.length || canonical !== compact.replace(/=+$/, '')) {
    return { error: 'invalid image base64' }
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    return { error: 'image exceeds 1MB limit' }
  }
  const detectedMimeType = detectImageMimeType(bytes)
  if (!detectedMimeType) return { error: 'unrecognized image content' }
  if (detectedMimeType !== mimeType) return { error: 'image content does not match mimeType' }
  return { imageBase64: compact, mimeType, sizeBytes: bytes.length }
}

function planPhotoQuotaReservation(user, date, usePoint) {
  const quota = user.photoQuota || {}
  const configuredDaily = Number(quota.freeDaily)
  const freeDaily = Number.isFinite(configuredDaily) && configuredDaily >= 0 ? Math.floor(configuredDaily) : 1
  const freeUsedToday = quota.lastDate === date ? Math.max(0, Math.floor(Number(quota.freeUsedToday) || 0)) : 0
  const pointBalance = Math.max(0, Math.floor(Number(user.pointBalance) || 0))

  if (freeUsedToday < freeDaily) {
    const nextUsed = freeUsedToday + 1
    return {
      allowed: true,
      chargeMode: 'free',
      usedPoint: false,
      pointBalance,
      freeRemaining: Math.max(0, freeDaily - nextUsed),
      photoQuota: { freeDaily, lastDate: date, freeUsedToday: nextUsed },
    }
  }
  if (usePoint && pointBalance > 0) {
    return {
      allowed: true,
      chargeMode: 'point',
      usedPoint: true,
      pointBalance: pointBalance - 1,
      freeRemaining: 0,
      photoQuota: { freeDaily, lastDate: date, freeUsedToday },
    }
  }
  return {
    allowed: false,
    code: 402,
    reason: usePoint ? 'insufficient points' : 'no quota or points',
    pointBalance,
    freeRemaining: 0,
  }
}

function planPhotoQuotaRollback(user, date, chargeMode) {
  if (chargeMode === 'point') {
    return { pointBalance: Math.max(0, Math.floor(Number(user.pointBalance) || 0)) + 1 }
  }
  const quota = user.photoQuota || { freeDaily: 1, lastDate: date, freeUsedToday: 0 }
  if (quota.lastDate !== date) return {}
  return {
    photoQuota: {
      ...quota,
      freeUsedToday: Math.max(0, Math.floor(Number(quota.freeUsedToday) || 0) - 1),
    },
  }
}

function timestampMillis(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'string') return new Date(value).getTime()
  return NaN
}

function isPhotoReservationExpired(usage, nowMs = Date.now()) {
  if (!usage || usage.status !== 'reserved') return false
  const explicitExpiry = timestampMillis(usage.reservationExpiresAt)
  if (Number.isFinite(explicitExpiry)) return explicitExpiry <= nowMs
  const reservedAt = timestampMillis(usage.reservedAt || usage.createdAt)
  return Number.isFinite(reservedAt) && reservedAt + PHOTO_RESERVATION_TIMEOUT_MS <= nowMs
}

function planPhotoQuotaReservationWithRecovery(user, existingUsage, date, usePoint, nowMs = Date.now()) {
  const expired = isPhotoReservationExpired(existingUsage, nowMs)
  const rollbackUpdates = expired
    ? planPhotoQuotaRollback(user, existingUsage.date, existingUsage.chargeMode)
    : {}
  const reservableUser = { ...user, ...rollbackUpdates }
  return {
    expired,
    rollbackUpdates,
    reservation: planPhotoQuotaReservation(reservableUser, date, usePoint),
  }
}

async function reservePhotoQuota(user, openid, request) {
  if (typeof db.runTransaction !== 'function') {
    return { state: 'unavailable' }
  }
  const nowMs = Number.isFinite(request.nowMs) ? request.nowMs : Date.now()
  const result = await db.runTransaction(async (transaction) => {
    const existing = await getTransactionDocument(transaction, 'photoUsage', request.usageId)
    if (existing && existing.requestFingerprint !== request.requestFingerprint) {
      return { state: 'conflict' }
    }
    if (existing && existing.status === 'committed') {
      return { state: 'committed', responseData: existing.responseData }
    }
    if (existing && existing.status === 'reserved' && !isPhotoReservationExpired(existing, nowMs)) {
      return { state: 'in_progress' }
    }

    const currentUser = await getTransactionDocument(transaction, 'users', user._id)
    if (!currentUser) throw new Error('photo quota user not found')
    const recoveryPlan = planPhotoQuotaReservationWithRecovery(
      currentUser,
      existing,
      request.date,
      request.usePoint,
      nowMs
    )
    const { reservation } = recoveryPlan
    if (!reservation.allowed) return { state: 'denied', ...reservation }

    await transaction.collection('users').doc(user._id).update({
      data: {
        pointBalance: reservation.pointBalance,
        photoQuota: reservation.photoQuota,
      },
    })
    await transaction.collection('photoUsage').doc(request.usageId).set({
      data: {
        openid,
        clientRequestId: request.clientRequestId,
        requestFingerprint: request.requestFingerprint,
        date: request.date,
        status: 'reserved',
        chargeMode: reservation.chargeMode,
        reservedAt: new Date(nowMs),
        reservationExpiresAt: new Date(nowMs + PHOTO_RESERVATION_TIMEOUT_MS),
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })
    return { state: 'reserved', recoveredExpiredReservation: recoveryPlan.expired, ...reservation }
  })
  return unwrapTransactionResult(result)
}

async function commitPhotoQuota(usageId, responseData) {
  const result = await db.runTransaction(async (transaction) => {
    const usage = await getTransactionDocument(transaction, 'photoUsage', usageId)
    if (!usage) throw new Error('photo quota reservation not found')
    if (usage.status === 'committed') return usage.responseData
    if (usage.status !== 'reserved') throw new Error(`photo quota reservation is ${usage.status || 'invalid'}`)
    await transaction.collection('photoUsage').doc(usageId).update({
      data: { status: 'committed', responseData, committedAt: db.serverDate(), updatedAt: db.serverDate() },
    })
    return responseData
  })
  return unwrapTransactionResult(result)
}

async function rollbackPhotoQuota(userId, usageId) {
  const result = await db.runTransaction(async (transaction) => {
    const usage = await getTransactionDocument(transaction, 'photoUsage', usageId)
    if (!usage || usage.status !== 'reserved') return false
    const user = await getTransactionDocument(transaction, 'users', userId)
    if (!user) throw new Error('photo quota rollback user not found')

    const updates = planPhotoQuotaRollback(user, usage.date, usage.chargeMode)
    if (Object.keys(updates).length) {
      await transaction.collection('users').doc(userId).update({ data: updates })
    }
    await transaction.collection('photoUsage').doc(usageId).update({
      data: { status: 'rolled_back', rolledBackAt: db.serverDate(), updatedAt: db.serverDate() },
    })
    return true
  })
  return Boolean(unwrapTransactionResult(result))
}

async function recoverExpiredPhotoReservations(userId, openid, nowMs = Date.now()) {
  if (!userId) return 0
  const reservations = await fetchPaginated(() =>
    db.collection('photoUsage').where({ openid, status: 'reserved' }).orderBy('createdAt', 'asc')
  )
  let recovered = 0
  for (const usage of reservations) {
    if (isPhotoReservationExpired(usage, nowMs) && await rollbackPhotoQuota(userId, usage._id)) {
      recovered += 1
    }
  }
  return recovered
}

async function aiTextEstimate(payload, openid) {
  if (!payload || !payload.description) {
    return { code: 400, data: null, message: 'description required' }
  }
  const desc = String(payload.description).trim()
  if (!desc) return { code: 400, data: null, message: 'description required' }
  if (desc.length > 500) return { code: 400, data: null, message: 'description too long' }

  const config = getAiConfig()
  if (!config.enabled) {
    return { code: 503, data: null, message: 'ai_not_configured' }
  }
  const usage = await reserveAiTextUsage(openid, getBeijingDate()).catch(() => ({ allowed: false, unavailable: true }))
  if (!usage.allowed) {
    return usage.unavailable
      ? { code: 503, data: null, message: 'ai_usage_tracking_unavailable' }
      : { code: 429, data: { remaining: 0 }, message: 'ai_daily_limit_reached' }
  }
  try {
    const data = await estimateMealTextWithAi(desc, openid)
    return {
      code: 0,
      data: { ...data, provider: config.provider, model: config.model, remainingToday: usage.remaining },
      message: 'ok',
    }
  } catch (error) {
    console.error('MiMo text estimate failed', error && error.message)
    const publicError = publicAiError(error)
    return { code: publicError.code, data: null, message: publicError.message }
  }
}

async function aiPhotoEstimate(payload, openid) {
  // Photo data is NOT persisted — only used for estimation in-memory
  const date = getBeijingDate()
  const photo = validatePhotoInput(payload)
  if (photo.error) return { code: 400, data: null, message: photo.error }
  const config = getAiConfig()
  if (!config.enabled) {
    return { code: 503, data: null, message: 'ai_not_configured' }
  }

  const clientRequestId = normalizeClientRequestId(payload && payload.clientRequestId) || `photo_${crypto.randomUUID()}`
  const usageId = idempotentDocumentId('photo', openid, clientRequestId)
  const requestFingerprint = crypto.createHash('sha256')
    .update(`${photo.mimeType}:${photo.imageBase64}:${Boolean(payload && payload.usePoint)}`)
    .digest('hex')
  let user = await ensureUser(openid)
  await recoverExpiredPhotoReservations(user._id, openid)
  user = await ensureUser(openid)
  const reservation = await reservePhotoQuota(user, openid, {
    usageId,
    clientRequestId,
    requestFingerprint,
    date,
    usePoint: Boolean(payload && payload.usePoint),
  })
  if (reservation.state === 'committed') {
    return { code: 0, data: reservation.responseData, message: 'ok' }
  }
  if (reservation.state === 'in_progress') {
    return { code: 409, data: null, message: 'photo request already in progress' }
  }
  if (reservation.state === 'conflict') {
    return { code: 409, data: null, message: 'clientRequestId already used for another photo' }
  }
  if (reservation.state === 'unavailable') {
    return { code: 503, data: null, message: 'atomic photo quota unavailable' }
  }
  if (reservation.state === 'denied') {
    return {
      code: reservation.code,
      data: { pointBalance: reservation.pointBalance, freeRemaining: reservation.freeRemaining },
      message: reservation.reason,
    }
  }

  try {
    const aiResult = await estimateMealPhotoWithAi(photo.imageBase64, photo.mimeType, openid)
    const responseData = {
      estimate: aiResult.estimate,
      items: aiResult.items,
      pointBalance: reservation.pointBalance,
      freeRemaining: reservation.freeRemaining,
      usedPoint: reservation.usedPoint,
      clientRequestId,
      message: aiResult.message,
      note: '照片仅用于本次识别，不保存原图。',
      image: { mimeType: photo.mimeType, sizeBytes: photo.sizeBytes },
      mimeType: photo.mimeType,
      imageSizeBytes: photo.sizeBytes,
      provider: config.provider,
      model: config.model,
    }
    const committed = await commitPhotoQuota(usageId, responseData)
    return { code: 0, data: committed, message: 'ok' }
  } catch (err) {
    try {
      await rollbackPhotoQuota(user._id, usageId)
    } catch (rollbackError) {
      console.error('MiMo photo estimate and quota rollback failed', err && err.message, rollbackError && rollbackError.message)
      return {
        code: 500,
        data: null,
        message: 'ai_quota_rollback_failed',
      }
    }
    console.error('MiMo photo estimate failed', err && err.message)
    const publicError = publicAiError(err)
    return { code: publicError.code, data: null, message: publicError.message }
  }
}

async function deleteCollectionForUser(collectionName, openid) {
  const documents = await fetchPaginated(() => db.collection(collectionName).where({ openid }).orderBy('_id', 'asc'))
  const result = { matched: documents.length, deleted: 0, failures: [] }
  for (const document of documents) {
    try {
      const removeResult = await db.collection(collectionName).doc(document._id).remove()
      if (removeResult && removeResult.stats && removeResult.stats.removed === 0) {
        throw new Error('document was not removed')
      }
      result.deleted += 1
    } catch (err) {
      result.failures.push({ id: document._id, message: err.message || 'remove failed' })
    }
  }
  return result
}

async function executeAccountDeletion(openid, deleteCollection = deleteCollectionForUser) {
  const deletedCounts = {}
  const collectionResults = {}
  const failures = []
  for (const collectionName of ACCOUNT_COLLECTIONS) {
    try {
      const result = await deleteCollection(collectionName, openid)
      collectionResults[collectionName] = result
      deletedCounts[collectionName] = result.deleted
      for (const failure of result.failures || []) {
        failures.push({ collection: collectionName, ...failure })
      }
    } catch (err) {
      deletedCounts[collectionName] = 0
      collectionResults[collectionName] = { matched: null, deleted: 0, failures: [{ message: err.message || 'query failed' }] }
      failures.push({ collection: collectionName, message: err.message || 'query failed' })
    }
  }
  const totalDeleted = Object.values(deletedCounts).reduce((sum, count) => sum + count, 0)
  if (failures.length) {
    return {
      code: 500,
      data: {
        deleted: false,
        partial: totalDeleted > 0,
        deletedCounts,
        collectionResults,
        failures,
      },
      message: 'account deletion partially failed',
    }
  }
  return {
    code: 0,
    data: { deleted: true, partial: false, deletedCounts, collectionResults, message: 'account deleted' },
    message: 'ok',
  }
}

async function deleteAccount(payload, openid) {
  return executeAccountDeletion(openid)
}

function normalizeFeedback(payload) {
  const content = String((payload && payload.content) || '').trim()
  if (content.length < 5 || content.length > 1000) return { error: 'feedback content must be 5-1000 characters' }
  return { content, category: String((payload && payload.category) || 'general').trim().slice(0, 30) || 'general' }
}

async function createFeedback(payload, openid) {
  const normalized = normalizeFeedback(payload)
  if (normalized.error) return { code: 400, data: null, message: normalized.error }
  const document = {
    openid,
    ...normalized,
    status: 'new',
    createdAt: db.serverDate(),
  }
  const created = await createDocumentIdempotently(
    'feedback',
    'feedback',
    openid,
    payload.clientRequestId,
    document,
    normalized,
  )
  if (created.conflict) return { code: 409, data: null, message: 'idempotency_conflict' }
  return { code: 0, data: { id: created.document._id, deduplicated: created.deduplicated }, message: 'ok' }
}

async function invokeWithTrustedOpenid(event = {}, openid = '') {
  try {
    const trustedOpenid = typeof openid === 'string' ? openid.trim() : ''
    if (!trustedOpenid) {
      return { code: 401, data: null, message: 'trusted openid required' }
    }
    const action = event.action
    const payload = event.payload || {}

    if (!action) {
      return { code: 400, data: null, message: 'action required' }
    }

    const handler = {
      authWechat,
      authGuest,
      getEntitlement,
      createPlan,
      getCurrentPlan,
      updatePlanGoal,
      updatePlanMacros,
      updatePlanActivity,
      getDailySummary,
      createMeal,
      updateMeal,
      deleteMeal,
      getMeals,
      createExercise,
      updateExercise,
      deleteExercise,
      getExercises,
      createWeight,
      updateWeight,
      deleteWeight,
      getWeights,
      getWeightTrend,
      getDeficitTrend,
      aiTextEstimate,
      aiPhotoEstimate,
      createFeedback,
      deleteAccount,
    }[action]

    if (!handler) {
      return { code: 404, data: null, message: `unknown action ${action}` }
    }

    const result = await handler(payload, trustedOpenid)
    return result
  } catch (err) {
    console.error('lightlyApi error', err)
    return { code: 500, data: null, message: err.message || 'cloud function error' }
  }
}

exports.main = async (event = {}) => {
  let openid = ''
  try {
    openid = getOpenid()
  } catch (err) {
    console.error('failed to resolve trusted openid', err)
  }
  return invokeWithTrustedOpenid(event, openid)
}

exports.__test = {
  ACCOUNT_COLLECTIONS,
  AI_REQUEST_TIMEOUT_MS,
  AI_TEXT_DAILY_LIMIT,
  DAILY_ACTIVITY_BASELINE_MULTIPLIER,
  PHOTO_RESERVATION_TIMEOUT_MS,
  awardDailyStarIfEligible,
  buildMiMoChatBody,
  buildDailyPlanSnapshot,
  calcTDEE,
  calculateDailySummaryMetrics,
  calculateEnergyTargets,
  calculateExerciseEnergy,
  calculatePlanMetrics,
  updatePlanActivity,
  canonicalizeFingerprintValue,
  countCompleteMealSlots,
  detectImageMimeType,
  createRequestFingerprint,
  energyMetricsOnly,
  executeAccountDeletion,
  formatEntitlementResponse,
  getExerciseMet,
  getAiConfig,
  getMissingPlanSnapshotDates,
  idempotentDocumentId,
  invokeWithTrustedOpenid,
  isPhotoReservationExpired,
  isWritableRecordDate,
  isValidMealType,
  normalizeClientRequestId,
  normalizeFeedback,
  normalizeMeal,
  normalizeTrendDays,
  planPhotoQuotaRollback,
  planPhotoQuotaReservation,
  planPhotoQuotaReservationWithRecovery,
  parseMiMoChatOutput,
  publicAiError,
  resolveExistingIdempotentDocument,
  resolvePlanEnergyForDate,
  selectCalibrationWeight,
  selectEffectivePlanForDate,
  validatePhotoInput,
}
