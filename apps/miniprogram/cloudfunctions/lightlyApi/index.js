const cloud = require('wx-server-sdk')

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
  return ensureUser(openid || userId).then(() => ({
    code: 0,
    data: { token: `cloud_${userId}`, userId, isNew: false },
    message: 'ok',
  }))
}

function authGuest(payload, openid) {
  const fallbackOpenid = openid || `guest_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const userId = `guest_${fallbackOpenid.slice(0, 16)}`
  return ensureUser(fallbackOpenid).then(() => ({
    code: 0,
    data: { token: `cloud_${userId}`, userId, isNew: true },
    message: 'ok',
  }))
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
  const confirmedKcal = Math.round(met * weightKg * (Number(payload.durationMin) / 60))
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

function aiTextEstimate(payload, openid) {
  if (!payload || !payload.description) {
    return Promise.resolve({ code: 400, data: null, message: 'description required' })
  }
  const desc = String(payload.description)
  const estimate = {
    foodName: desc.slice(0, 20),
    kcal: 350,
    carbG: 40,
    proteinG: 20,
    fatG: 12,
    confidence: 0.6,
  }
  return Promise.resolve({
    code: 0,
    data: { estimate, message: 'mock estimate from cloud' },
    message: 'ok',
  })
}

function aiPhotoEstimate(payload, openid) {
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

    return db.collection('users').where({ openid }).update({ data: updateDoc }).then(() => {
      const newFreeRemaining = usedPoint ? freeRemaining : Math.max(0, freeRemaining - 1)
      const newPointBalance = usedPoint ? Math.max(0, pointBalance - 1) : pointBalance
      return {
        code: 0,
        data: {
          estimate: {
            foodName: '识别结果（mock）',
            kcal: 420,
            carbG: 50,
            proteinG: 25,
            fatG: 14,
            confidence: 0.55,
          },
          pointBalance: newPointBalance,
          freeRemaining: newFreeRemaining,
          usedPoint,
          message: 'mock photo estimate from cloud',
          note: '未接入真实识别模型，仅演示额度与积分扣减',
        },
        message: 'ok',
      }
    })
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
