const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

function getOpenid() {
  const ctx = cloud.getWXContext()
  return ctx.OPENID || ctx.FROM_OPENID || ctx.CALLER_OPENID || ''
}

function getBeijingDate(dateStr) {
  if (dateStr) return dateStr
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  return now.toISOString().slice(0, 10)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function calcBMR(sex, age, heightCm, weightKg) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'female' ? base - 161 : base + 5
}

function calcTDEE(bmr, activityMultiplier) {
  return Math.round(bmr * (activityMultiplier || 1.2))
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
    return db.collection('users').add({ data: doc }).then(() => doc)
  })
}

function getEntitlement(payload, openid) {
  return ensureUser(openid).then((user) => {
    const today = getBeijingDate(payload && payload.date)
    const quota = user.photoQuota || { freeDaily: 1, lastDate: '', freeUsedToday: 0 }
    const sameDay = quota.lastDate === today
    const freeUsedToday = sameDay ? (quota.freeUsedToday || 0) : 0
    const freeRemaining = Math.max(0, (quota.freeDaily || 1) - freeUsedToday)
    return {
      pointBalance: user.pointBalance || 0,
      photoQuota: {
        freeRemaining,
        freeUsed: freeUsedToday,
        totalToday: freeUsedToday,
        freeDaily: quota.freeDaily || 1,
      },
    }
  })
}

function awardDailyStarIfEligible(openid, date, actualDeficitKcal, targetDeficitKcal) {
  const today = date || getBeijingDate()
  return Promise.all([
    db.collection('meals').where({ openid, date: today }).get(),
    db.collection('pointsLedger').where({ openid, date: today, reason: 'daily_star' }).get(),
  ]).then(([mealRes, ledgerRes]) => {
    const meals = mealRes.data || []
    const recordedSlots = meals
      .filter((m) => ['recorded', 'skipped', 'fasting'].includes(m.status || 'recorded'))
      .map((m) => m.mealSlot)
    const uniqueRecorded = [...new Set(recordedSlots)]
    const isRecordComplete = uniqueRecorded.length >= 2
    const reachedTarget = targetDeficitKcal > 0 && actualDeficitKcal >= targetDeficitKcal * 0.8
    const alreadyAwarded = (ledgerRes.data || []).length > 0
    if (!isRecordComplete || !reachedTarget || alreadyAwarded) {
      return {
        awarded: false,
        isRecordComplete,
        recordedMealSlots: uniqueRecorded.length,
        pointAwarded: false,
        warnings: [],
      }
    }
    return db.collection('pointsLedger').add({
      data: {
        openid,
        date: today,
        reason: 'daily_star',
        points: 1,
        createdAt: db.serverDate(),
      },
    }).then(() =>
      db.collection('users').where({ openid }).update({
        data: { pointBalance: _.inc(1) },
      })
    ).then(() => ({
      awarded: true,
      isRecordComplete: true,
      recordedMealSlots: uniqueRecorded.length,
      pointAwarded: true,
      warnings: [],
    }))
  })
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

function createPlan(payload, openid) {
  const required = ['sex', 'age', 'heightCm', 'currentWeightKg', 'targetWeightKg', 'activityMultiplier']
  for (const key of required) {
    if (payload[key] == null) {
      return Promise.resolve({ code: 400, data: null, message: `${key} required` })
    }
  }
  const age = Number(payload.age)
  const heightCm = Number(payload.heightCm)
  const currentWeightKg = Number(payload.currentWeightKg)
  const targetWeightKg = Number(payload.targetWeightKg)
  const activityMultiplier = Number(payload.activityMultiplier)
  const weeklyLossKg = payload.weeklyLossKg != null ? Number(payload.weeklyLossKg) : null
  const bmrKcal = Math.round(calcBMR(payload.sex, age, heightCm, currentWeightKg))
  const tdeeKcal = calcTDEE(bmrKcal, activityMultiplier)
  const dailyDeficitTargetKcal = weeklyLossKg ? Math.round((weeklyLossKg * 7700) / 7) : 500
  const recommendedIntakeKcal = Math.max(1200, tdeeKcal - dailyDeficitTargetKcal)
  const macros = calcMacros(recommendedIntakeKcal, currentWeightKg)
  const planDoc = {
    openid,
    currentWeightKg,
    targetWeightKg,
    targetDate: payload.targetDate || null,
    weeklyLossKg,
    heightCm,
    age,
    sex: payload.sex,
    activityLevel: activityMultiplier,
    bmrKcal,
    tdeeKcal,
    dailyDeficitTargetKcal,
    recommendedIntakeKcal,
    ...macros,
    createdAt: db.serverDate(),
  }
  return db.collection('plans').add({ data: planDoc }).then(() => ({
    code: 0,
    data: { plan: planDoc, warnings: [] },
    message: 'ok',
  }))
}

function getCurrentPlan(payload, openid) {
  return db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get().then((res) => {
    const plan = res.data && res.data[0]
    if (!plan) return { code: 0, data: { plan: null }, message: 'ok' }
    delete plan.openid
    return { code: 0, data: { plan }, message: 'ok' }
  })
}

function getDailySummary(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  return Promise.all([
    db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get(),
    db.collection('meals').where({ openid, date }).get(),
    db.collection('exercises').where({ openid, date }).get(),
  ]).then(([planRes, mealRes, exerciseRes]) => {
    const plan = planRes.data && planRes.data[0]
    const meals = mealRes.data || []
    const exercises = exerciseRes.data || []
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
    const hasPlan = !!plan
    const planView = hasPlan
      ? { tdeeKcal: plan.tdeeKcal, targetDeficitKcal: plan.dailyDeficitTargetKcal, recommendedIntakeKcal: plan.recommendedIntakeKcal }
      : null
    const effectiveExerciseKcal = Math.round(exercise.totalKcal * 0.7)
    const actualDeficitKcal = hasPlan ? Math.round(plan.tdeeKcal + exercise.totalKcal - intake.totalKcal) : 0
    const remainingIntakeKcal = hasPlan ? Math.round(plan.tdeeKcal + effectiveExerciseKcal - plan.dailyDeficitTargetKcal - intake.totalKcal) : 0
    const achievementRate = hasPlan && plan.dailyDeficitTargetKcal > 0 ? Math.max(0, Math.round((actualDeficitKcal / plan.dailyDeficitTargetKcal) * 100) / 100) : 0

    return awardDailyStarIfEligible(openid, date, actualDeficitKcal, hasPlan ? plan.dailyDeficitTargetKcal : 0).then((star) =>
      ensureUser(openid).then((user) => ({
        code: 0,
        data: {
          date,
          hasPlan,
          message: hasPlan ? undefined : '未找到计划',
          plan: planView,
          intake,
          exercise,
          summary: {
            actualDeficitKcal,
            remainingIntakeKcal,
            achievementRate,
            effectiveExerciseKcal,
          },
          star,
          pointBalance: user.pointBalance || 0,
        },
        message: 'ok',
      }))
    )
  })
}

function createMeal(payload, openid) {
  if (!payload || !payload.date || !payload.mealSlot) {
    return Promise.resolve({ code: 400, data: null, message: 'date and mealSlot required' })
  }
  const items = (payload.items || []).map((it) => ({
    foodName: it.foodName,
    quantityG: Number(it.quantityG || 0),
    kcal: Number(it.kcal || 0),
    carbG: Number(it.carbG || 0),
    proteinG: Number(it.proteinG || 0),
    fatG: Number(it.fatG || 0),
  }))
  const mealDoc = {
    openid,
    date: payload.date,
    mealSlot: payload.mealSlot,
    status: payload.status || 'recorded',
    totalKcal: Math.round(items.reduce((s, i) => s + (i.kcal || 0), 0)),
    carbG: Math.round(items.reduce((s, i) => s + (i.carbG || 0), 0)),
    proteinG: Math.round(items.reduce((s, i) => s + (i.proteinG || 0), 0)),
    fatG: Math.round(items.reduce((s, i) => s + (i.fatG || 0), 0)),
    items,
    createdAt: db.serverDate(),
  }
  return db.collection('meals').add({ data: mealDoc }).then((res) => ({
    code: 0,
    data: { meal: { id: res._id, ...mealDoc } },
    message: 'ok',
  }))
}

function getMeals(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  return db.collection('meals').where({ openid, date }).orderBy('createdAt', 'asc').limit(100).get().then((res) => {
    const meals = (res.data || []).map((m) => ({
      id: m._id,
      date: m.date,
      mealSlot: m.mealSlot,
      status: m.status,
      totalKcal: m.totalKcal,
      items: m.items || [],
    }))
    const totals = {
      totalKcal: Math.round(meals.reduce((s, m) => s + (m.totalKcal || 0), 0)),
      carbG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.carbG || 0), 0), 0)),
      proteinG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.proteinG || 0), 0), 0)),
      fatG: Math.round(meals.reduce((s, m) => s + (m.items || []).reduce((x, i) => x + (i.fatG || 0), 0), 0)),
    }
    return { code: 0, data: { meals, totals }, message: 'ok' }
  })
}

function createExercise(payload, openid) {
  if (!payload || !payload.date || !payload.exerciseType || payload.durationMin == null) {
    return Promise.resolve({ code: 400, data: null, message: 'date, exerciseType, durationMin required' })
  }
  const weightKg = payload.weightKg || 70
  const met = 6
  const autoKcal = Math.round(met * weightKg * (Number(payload.durationMin) / 60))
  // Use user-provided confirmedKcal if it is a valid positive number; otherwise MET estimate
  const overrideKcal = Number(payload.confirmedKcal)
  const confirmedKcal = (Number.isFinite(overrideKcal) && overrideKcal > 0) ? Math.round(overrideKcal) : autoKcal
  const doc = {
    openid,
    date: payload.date,
    exerciseType: payload.exerciseType,
    durationMin: Number(payload.durationMin),
    confirmedKcal,
    createdAt: db.serverDate(),
  }
  return db.collection('exercises').add({ data: doc }).then((res) => ({
    code: 0,
    data: { exercise: { id: res._id, ...doc } },
    message: 'ok',
  }))
}

function getExercises(payload, openid) {
  const date = getBeijingDate(payload && payload.date)
  return db.collection('exercises').where({ openid, date }).orderBy('createdAt', 'asc').limit(100).get().then((res) => {
    const exercises = (res.data || []).map((e) => ({
      id: e._id,
      date: e.date,
      exerciseType: e.exerciseType,
      durationMin: e.durationMin,
      confirmedKcal: e.confirmedKcal,
    }))
    const totalKcal = Math.round(exercises.reduce((s, e) => s + (e.confirmedKcal || 0), 0))
    return { code: 0, data: { exercises, totalKcal }, message: 'ok' }
  })
}

function createWeight(payload, openid) {
  if (!payload || !payload.date || payload.weightKg == null) {
    return Promise.resolve({ code: 400, data: null, message: 'date and weightKg required' })
  }
  const doc = {
    openid,
    date: payload.date,
    weightKg: Number(payload.weightKg),
    weighingContext: payload.weighingContext || 'morning',
    createdAt: db.serverDate(),
  }
  return db.collection('weights').add({ data: doc }).then((res) => ({
    code: 0,
    data: { weight: { id: res._id, ...doc } },
    message: 'ok',
  }))
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
    data: { weights: (res.data || []).map((w) => ({ id: w._id, date: w.date, weightKg: w.weightKg })) },
    message: 'ok',
  }))
}

function getWeightTrend(payload, openid) {
  const days = (payload && payload.days) || 30
  return db.collection('weights').where({ openid }).orderBy('date', 'desc').limit(days).get().then((res) => ({
    code: 0,
    data: { points: (res.data || []).map((w) => ({ date: w.date, weightKg: w.weightKg })).reverse() },
    message: 'ok',
  }))
}

function getDeficitTrend(payload, openid) {
  const days = (payload && payload.days) || 30
  const now = new Date(Date.now() + 8 * 3600 * 1000)
  const startDate = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
  return Promise.all([
    db.collection('meals').where({ openid, date: _.gte(startDate) }).get(),
    db.collection('exercises').where({ openid, date: _.gte(startDate) }).get(),
    db.collection('plans').where({ openid }).orderBy('createdAt', 'desc').limit(1).get(),
  ]).then(([mealRes, exerciseRes, planRes]) => {
    const plan = planRes.data && planRes.data[0]
    const tdee = plan ? plan.tdeeKcal : 0
    const meals = mealRes.data || []
    const exercises = exerciseRes.data || []
    const dateMap = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10)
      dateMap[d] = { date: d, intakeKcal: 0, exerciseKcal: 0, actualDeficitKcal: 0 }
    }
    meals.forEach((m) => {
      if (dateMap[m.date]) dateMap[m.date].intakeKcal += m.totalKcal || 0
    })
    exercises.forEach((e) => {
      if (dateMap[e.date]) dateMap[e.date].exerciseKcal += e.confirmedKcal || 0
    })
    Object.values(dateMap).forEach((d) => {
      d.intakeKcal = Math.round(d.intakeKcal)
      d.exerciseKcal = Math.round(d.exerciseKcal)
      d.actualDeficitKcal = Math.round(tdee + d.exerciseKcal - d.intakeKcal)
    })
    return { code: 0, data: { data: Object.values(dateMap) }, message: 'ok' }
  })
}

// ── Mock food database (kcal / carbG / proteinG / fatG per 100 g) ──
const MOCK_FOOD_DB = {
  '米饭': { kcal: 116, carbG: 25.6, proteinG: 2.6, fatG: 0.3, defaultG: 200 },
  '鸡胸肉': { kcal: 133, carbG: 0, proteinG: 31, fatG: 1.2, defaultG: 150 },
  '鸡蛋': { kcal: 144, carbG: 1.5, proteinG: 13.3, fatG: 9.5, defaultG: 100 },
  '牛奶': { kcal: 54, carbG: 3.4, proteinG: 3.1, fatG: 3.2, defaultG: 250 },
  '燕麦': { kcal: 367, carbG: 58.7, proteinG: 15, fatG: 6.7, defaultG: 50 },
  '苹果': { kcal: 53, carbG: 12.3, proteinG: 0.2, fatG: 0.2, defaultG: 200 },
  '咖啡': { kcal: 2, carbG: 0, proteinG: 0.1, fatG: 0, defaultG: 250 },
  '奶茶': { kcal: 88, carbG: 12, proteinG: 1.5, fatG: 3.5, defaultG: 500 },
  '沙拉': { kcal: 20, carbG: 3.6, proteinG: 1.3, fatG: 0.2, defaultG: 200 },
  '豆腐': { kcal: 73, carbG: 1.5, proteinG: 8.1, fatG: 3.7, defaultG: 150 },
  '西兰花': { kcal: 36, carbG: 5.2, proteinG: 3.5, fatG: 0.4, defaultG: 150 },
  '牛肉': { kcal: 190, carbG: 0, proteinG: 26, fatG: 9, defaultG: 150 },
  '三文鱼': { kcal: 208, carbG: 0, proteinG: 20, fatG: 13, defaultG: 120 },
  '面条': { kcal: 137, carbG: 25, proteinG: 4.5, fatG: 1.6, defaultG: 200 },
  '面包': { kcal: 265, carbG: 49, proteinG: 9, fatG: 3.3, defaultG: 80 },
  '酸奶': { kcal: 72, carbG: 9.3, proteinG: 3.6, fatG: 2.5, defaultG: 200 },
  '香蕉': { kcal: 93, carbG: 20.8, proteinG: 1.1, fatG: 0.2, defaultG: 120 },
  '番茄': { kcal: 18, carbG: 3.9, proteinG: 0.9, fatG: 0.2, defaultG: 150 },
  '白菜': { kcal: 17, carbG: 3.1, proteinG: 1.5, fatG: 0.2, defaultG: 150 },
}

function getAiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || process.env.MIMO_BASE_URL || '').replace(/\/+$/, '')
  const apiKey = process.env.AI_API_KEY || process.env.MIMO_API_KEY || ''
  const model = process.env.AI_MODEL || process.env.MIMO_MODEL || 'mimo-v2.5'
  return { baseUrl, apiKey, model, enabled: Boolean(baseUrl && apiKey) }
}

function safeJsonParse(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    const match = String(text).match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function normalizeMealItems(rawItems) {
  if (!Array.isArray(rawItems)) return []
  return rawItems
    .map((item) => ({
      foodName: String(item.foodName || item.name || item.food || '').slice(0, 40),
      quantityG: Math.max(0, Math.round(Number(item.quantityG || item.grams || item.weightG || 0))),
      kcal: Math.max(0, Math.round(Number(item.kcal || item.calories || item.energyKcal || 0))),
      carbG: Math.max(0, Math.round(Number(item.carbG || item.carbsG || item.carbohydrateG || 0) * 10) / 10),
      proteinG: Math.max(0, Math.round(Number(item.proteinG || item.protein || 0) * 10) / 10),
      fatG: Math.max(0, Math.round(Number(item.fatG || item.fat || 0) * 10) / 10),
    }))
    .filter((item) => item.foodName)
    .slice(0, 12)
}

function aggregateEstimate(items, confidence) {
  const safeItems = items.length ? items : _parseTextItems('')
  return {
    foodName: safeItems.map((it) => it.foodName).join('+').slice(0, 40),
    kcal: Math.round(safeItems.reduce((s, it) => s + (it.kcal || 0), 0)),
    carbG: Math.round(safeItems.reduce((s, it) => s + (it.carbG || 0), 0) * 10) / 10,
    proteinG: Math.round(safeItems.reduce((s, it) => s + (it.proteinG || 0), 0) * 10) / 10,
    fatG: Math.round(safeItems.reduce((s, it) => s + (it.fatG || 0), 0) * 10) / 10,
    confidence,
  }
}

function callOpenAICompatible(messages) {
  const config = getAiConfig()
  if (!config.enabled) {
    return Promise.reject(new Error('ai_not_configured'))
  }

  const endpoint = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl}/chat/completions`
  const url = new URL(endpoint)
  const transport = url.protocol === 'http:' ? http : https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return Promise.reject(new Error('ai_invalid_base_url'))
  }
  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: 0.1,
  })

  const options = {
    method: 'POST',
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`ai_http_${res.statusCode}`))
          return
        }
        const json = safeJsonParse(data)
        const message = json && json.choices && json.choices[0] && json.choices[0].message
        const rawContent = message && message.content
        const content = Array.isArray(rawContent)
          ? rawContent.map((part) => (typeof part === 'string' ? part : (part && part.text) || '')).join('')
          : rawContent
        const parsed = safeJsonParse(content)
        if (!parsed) {
          reject(new Error('ai_invalid_json'))
          return
        }
        resolve(parsed)
      })
    })
    req.setTimeout(20000, () => {
      req.destroy(new Error('ai_timeout'))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function buildMealJsonPrompt(extraInstruction) {
  return [
    '你是减脂记录应用中的食物热量估算助手。',
    '请只返回 JSON，不要 Markdown，不要解释。',
    'JSON 格式必须是：{"items":[{"foodName":"食物名","quantityG":克数,"kcal":千卡,"carbG":碳水克数,"proteinG":蛋白质克数,"fatG":脂肪克数}],"message":"一句温和提示"}。',
    '估算要保守、日常化，适合中国区饮食；无法确定时给出合理近似值，避免医学诊断或绝对健康承诺。',
    extraInstruction || '',
  ].join('\n')
}

function estimateMealTextWithAi(description) {
  return callOpenAICompatible([
    { role: 'system', content: buildMealJsonPrompt('根据用户自然语言描述拆分每种食物。') },
    { role: 'user', content: `用户描述：${description}` },
  ]).then((parsed) => {
    const items = normalizeMealItems(parsed.items)
    if (!items.length) throw new Error('ai_empty_items')
    return {
      items,
      estimate: aggregateEstimate(items, 0.72),
      message: parsed.message || '已根据描述生成估算，可继续手动调整。',
    }
  })
}

function estimateMealPhotoWithAi(imageBase64, mimeType) {
  return callOpenAICompatible([
    { role: 'system', content: buildMealJsonPrompt('根据图片识别可见食物和份量；只估算食物，不保存图片。') },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请识别这张餐食图片中的食物、克数、热量和三大营养素。' },
        { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
      ],
    },
  ]).then((parsed) => {
    const items = normalizeMealItems(parsed.items)
    if (!items.length) throw new Error('ai_empty_items')
    return {
      items,
      estimate: aggregateEstimate(items, 0.68),
      message: parsed.message || '已根据图片生成估算，请确认后再入账。',
    }
  })
}

function _parseTextItems(description) {
  const matched = []
  const desc = String(description)
  for (const [name, info] of Object.entries(MOCK_FOOD_DB)) {
    if (desc.includes(name)) {
      const quantityG = info.defaultG
      const ratio = quantityG / 100
      matched.push({
        foodName: name,
        quantityG,
        kcal: Math.round(info.kcal * ratio),
        carbG: Math.round(info.carbG * ratio * 10) / 10,
        proteinG: Math.round(info.proteinG * ratio * 10) / 10,
        fatG: Math.round(info.fatG * ratio * 10) / 10,
      })
    }
  }
  if (matched.length === 0) {
    matched.push({
      foodName: '手动补充食物',
      quantityG: 0,
      kcal: 0,
      carbG: 0,
      proteinG: 0,
      fatG: 0,
    })
  }
  return matched
}

function mockTextEstimate(description) {
  const items = _parseTextItems(description)
  const estimate = aggregateEstimate(items, items[0].foodName === '手动补充食物' ? 0.3 : 0.6)
  return { estimate, items, message: 'mock estimate from cloud' }
}

function mockPhotoEstimate() {
  const mockPool = ['米饭', '鸡胸肉', '鸡蛋', '西兰花', '沙拉', '豆腐', '苹果', '酸奶']
  const count = 2 + Math.floor(Math.random() * 2)
  const picked = []
  const available = [...mockPool]
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length)
    picked.push(available.splice(idx, 1)[0])
  }
  const items = picked.map((name) => {
    const info = MOCK_FOOD_DB[name]
    const quantityG = info.defaultG
    const ratio = quantityG / 100
    return {
      foodName: name,
      quantityG,
      kcal: Math.round(info.kcal * ratio),
      carbG: Math.round(info.carbG * ratio * 10) / 10,
      proteinG: Math.round(info.proteinG * ratio * 10) / 10,
      fatG: Math.round(info.fatG * ratio * 10) / 10,
    }
  })
  return {
    items,
    estimate: aggregateEstimate(items, 0.55),
    message: 'mock photo estimate from cloud',
  }
}

function aiTextEstimate(payload, openid) {
  if (!payload || !payload.description) {
    return Promise.resolve({ code: 400, data: null, message: 'description required' })
  }
  const desc = String(payload.description)

  const config = getAiConfig()
  const estimator = config.enabled ? estimateMealTextWithAi(desc) : Promise.resolve(mockTextEstimate(desc))
  return estimator.then((data) => ({
    code: 0,
    data: { ...data, provider: config.enabled ? 'mimo' : 'mock', model: config.enabled ? config.model : 'mock' },
    message: 'ok',
  })).catch((err) => {
    if (String(err.message || err) === 'ai_not_configured') {
      return { code: 0, data: { ...mockTextEstimate(desc), provider: 'mock', model: 'mock' }, message: 'ok' }
    }
    return { code: 503, data: null, message: `ai estimate failed: ${err.message || 'unknown'}` }
  })
}

function aiPhotoEstimate(payload, openid) {
  // Photo data is NOT persisted — only used for estimation in-memory
  const date = getBeijingDate()
  return ensureUser(openid).then((user) => {
    const quota = user.photoQuota || { freeDaily: 1, lastDate: '', freeUsedToday: 0 }
    const sameDay = quota.lastDate === date
    const freeUsedToday = sameDay ? (quota.freeUsedToday || 0) : 0
    const freeRemaining = Math.max(0, (quota.freeDaily || 1) - freeUsedToday)
    const usePoint = !!(payload && payload.usePoint)
    const pointBalance = user.pointBalance || 0

    let usedPoint = false
    const updateDoc = {}
    if (freeRemaining > 0) {
      updateDoc['photoQuota.lastDate'] = date
      updateDoc['photoQuota.freeUsedToday'] = freeUsedToday + 1
    } else if (usePoint && pointBalance > 0) {
      usedPoint = true
      updateDoc.pointBalance = _.inc(-1)
    } else {
      return {
        code: 402,
        data: null,
        message: 'no quota or points',
      }
    }

    const config = getAiConfig()
    const imageBase64 = payload && payload.imageBase64
    const mimeType = (payload && payload.mimeType) || 'image/jpeg'
    const estimator = config.enabled && imageBase64
      ? estimateMealPhotoWithAi(imageBase64, mimeType)
      : Promise.resolve(mockPhotoEstimate())

    return estimator.then((aiResult) => db.collection('users').where({ openid }).update({ data: updateDoc }).then(() => {
      const newFreeRemaining = usedPoint ? freeRemaining : Math.max(0, freeRemaining - 1)
      const newPointBalance = usedPoint ? Math.max(0, pointBalance - 1) : pointBalance
      return {
        code: 0,
        data: {
          estimate: aiResult.estimate,
          items: aiResult.items,
          pointBalance: newPointBalance,
          freeRemaining: newFreeRemaining,
          usedPoint,
          message: aiResult.message,
          note: config.enabled ? '照片仅用于本次识别，不保存原图。' : '未配置真实识别模型，仅演示额度与积分扣减。',
          provider: config.enabled ? 'mimo' : 'mock',
          model: config.enabled ? config.model : 'mock',
        },
        message: 'ok',
      }
    })).catch((err) => ({ code: 503, data: null, message: `ai photo estimate failed: ${err.message || 'unknown'}` }))
  })
}

function deleteAccount(payload, openid) {
  const tables = ['users', 'plans', 'meals', 'exercises', 'weights', 'pointsLedger', 'photoUsage']
  return Promise.all(
    tables.map((col) =>
      db
        .collection(col)
        .where({ openid })
        .limit(1000)
        .get()
        .then((res) =>
          Promise.all((res.data || []).map((doc) => db.collection(col).doc(doc._id).remove()))
        )
    )
  ).then(() => ({ code: 0, data: { deleted: true, message: 'account deleted' }, message: 'ok' }))
}

exports.main = async (event = {}, context = {}) => {
  try {
    const openid = getOpenid() || (event.userInfo && event.userInfo.openId) || ''
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
      getDailySummary,
      createMeal,
      getMeals,
      createExercise,
      getExercises,
      createWeight,
      getWeights,
      getWeightTrend,
      getDeficitTrend,
      aiTextEstimate,
      aiPhotoEstimate,
      deleteAccount,
    }[action]

    if (!handler) {
      return { code: 404, data: null, message: `unknown action ${action}` }
    }

    const result = await handler(payload, openid || payload.openid || '')
    return result
  } catch (err) {
    console.error('lightlyApi error', err)
    return { code: 500, data: null, message: err.message || 'cloud function error' }
  }
}
