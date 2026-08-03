const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const test = require('node:test')

const originalLoad = Module._load
Module._load = function mockWxServerSdk(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      getWXContext() { return {} },
      database() {
        return {
          command: { aggregate: {} },
          serverDate() { return 'SERVER_DATE' },
        }
      },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { main, __test: helpers } = require('./index.js')
Module._load = originalLoad

test('minimum intake clamp produces one effective deficit target', () => {
  assert.deepEqual(helpers.calculateEnergyTargets(1800, 900), {
    requestedDailyDeficitTargetKcal: 900,
    dailyDeficitTargetKcal: 600,
    recommendedIntakeKcal: 1200,
  })

  const summary = helpers.calculateDailySummaryMetrics({
    tdeeKcal: 2000,
    dailyDeficitTargetKcal: 1000,
    recommendedIntakeKcal: 1200,
  }, 1100, 200, true)
  assert.equal(summary.targetDeficitKcal, 800)
  assert.equal(summary.actualDeficitKcal, 1100)
  assert.equal(summary.remainingIntakeKcal, 240)
  assert.equal(summary.remainingIntakeKcal, summary.actualDeficitKcal - summary.targetDeficitKcal - 60)
})

test('only recorded and fasting meals with valid meal types count as complete', () => {
  const meals = [
    { mealSlot: 'breakfast', status: 'recorded' },
    { mealSlot: 'lunch', status: 'skipped' },
    { mealSlot: 'dinner', status: 'fasting' },
    { mealSlot: 'brunch', status: 'recorded' },
    { mealSlot: 'other', status: 'recorded' },
    { mealSlot: 'drink', status: 'recorded' },
    { mealSlot: 'breakfast', status: 'recorded' },
  ]
  assert.equal(helpers.countCompleteMealSlots(meals), 2)
  assert.equal(helpers.isValidMealType('drink'), true)
  assert.equal(helpers.isValidMealType('brunch'), false)
})

test('idempotency keys are stable per resource and user while old requests remain keyless', () => {
  const first = helpers.idempotentDocumentId('meal', 'user-a', 'request-123')
  assert.equal(first, helpers.idempotentDocumentId('meal', 'user-a', ' request-123 '))
  assert.notEqual(first, helpers.idempotentDocumentId('meal', 'user-b', 'request-123'))
  assert.notEqual(first, helpers.idempotentDocumentId('weight', 'user-a', 'request-123'))
  assert.equal(helpers.idempotentDocumentId('meal', 'user-a', undefined), null)
  assert.equal(helpers.normalizeClientRequestId('   '), null)
})

test('idempotent records fingerprint normalized content and reject key reuse with different content', () => {
  const first = helpers.createRequestFingerprint('meal', { date: '2026-07-16', items: [{ kcal: 300, name: 'rice' }] })
  const reordered = helpers.createRequestFingerprint('meal', { items: [{ name: 'rice', kcal: 300 }], date: '2026-07-16' })
  const changed = helpers.createRequestFingerprint('meal', { date: '2026-07-16', items: [{ kcal: 500, name: 'rice' }] })

  assert.equal(first, reordered)
  assert.notEqual(first, changed)
  assert.equal(helpers.resolveExistingIdempotentDocument('doc-1', { requestFingerprint: first }, first).deduplicated, true)
  assert.equal(helpers.resolveExistingIdempotentDocument('doc-1', { requestFingerprint: first }, changed).conflict, true)
  assert.equal(helpers.resolveExistingIdempotentDocument('doc-1', {}, first).conflict, true)
})

test('exercise MET mapping uses body weight and preserves manual kcal overrides', () => {
  const walking = helpers.calculateExerciseEnergy('快走', 70, 30)
  const jogging = helpers.calculateExerciseEnergy('慢跑', 70, 30)
  const heavierWalking = helpers.calculateExerciseEnergy('快走', 90, 30)
  const manual = helpers.calculateExerciseEnergy('慢跑', 70, 30, 321)

  assert.equal(helpers.getExerciseMet('HIIT'), 8)
  assert.equal(walking.calorieSource, 'met')
  assert.ok(jogging.confirmedKcal > walking.confirmedKcal)
  assert.ok(heavierWalking.confirmedKcal > walking.confirmedKcal)
  assert.equal(manual.estimatedKcal, jogging.estimatedKcal)
  assert.equal(manual.confirmedKcal, 321)
  assert.equal(manual.calorieSource, 'manual')
})

test('photo validation decodes actual bytes and only accepts jpeg, png, or webp', () => {
  const oneMiBBuffer = Buffer.alloc(1024 * 1024, 1)
  oneMiBBuffer.set([0xff, 0xd8, 0xff], 0)
  const oneMiB = oneMiBBuffer.toString('base64')
  const overOneMiBBuffer = Buffer.alloc(1024 * 1024 + 1, 1)
  overOneMiBBuffer.set([0xff, 0xd8, 0xff], 0)
  const overOneMiB = overOneMiBBuffer.toString('base64')
  const valid = helpers.validatePhotoInput({ imageBase64: oneMiB, mimeType: 'image/jpeg', imageSizeBytes: 1 })

  assert.equal(valid.sizeBytes, 1024 * 1024)
  assert.match(helpers.validatePhotoInput({ imageBase64: overOneMiB, mimeType: 'image/jpeg' }).error, /1MB/)
  assert.match(helpers.validatePhotoInput({ imageBase64: 'AA==', mimeType: 'image/gif' }).error, /mimeType/)
  assert.match(helpers.validatePhotoInput({ imageBase64: 'not%base64', mimeType: 'image/png' }).error, /base64/)

  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from('payload')])
  const dataUrl = `data:image/webp;base64,${webp.toString('base64')}`
  assert.equal(helpers.validatePhotoInput({ imageBase64: dataUrl }).mimeType, 'image/webp')
  assert.match(helpers.validatePhotoInput({ imageBase64: dataUrl, mimeType: 'image/png' }).error, /does not match/)
  assert.match(helpers.validatePhotoInput({ imageBase64: Buffer.from('not an image').toString('base64'), mimeType: 'image/jpeg' }).error, /unrecognized/)
})

test('OpenAI Responses request keeps the key server-side and uses strict structured vision input', () => {
  const previousKey = process.env.OPENAI_API_KEY
  const previousModel = process.env.OPENAI_MODEL
  process.env.OPENAI_API_KEY = 'server-only-test-key'
  process.env.OPENAI_MODEL = 'gpt-test'
  try {
    const request = helpers.buildOpenAIResponsesBody({
      imageBase64: '/9j/',
      mimeType: 'image/jpeg',
      openid: 'user-123',
    })
    assert.equal(request.model, 'gpt-test')
    assert.equal(request.store, false)
    assert.equal(request.text.format.type, 'json_schema')
    assert.equal(request.text.format.strict, true)
    assert.match(request.safety_identifier, /^wechat_[a-f0-9]{32}$/)
    assert.equal(request.input[1].content[1].type, 'input_image')
    assert.match(request.input[1].content[1].image_url, /^data:image\/jpeg;base64,/)
    assert.doesNotMatch(JSON.stringify(request), /server-only-test-key/)
  } finally {
    if (previousKey == null) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    if (previousModel == null) delete process.env.OPENAI_MODEL
    else process.env.OPENAI_MODEL = previousModel
  }
})

test('OpenAI Responses parser accepts output_text and rejects refusals or malformed JSON', () => {
  const parsed = helpers.parseOpenAIResponsesOutput({
    status: 'completed',
    output: [{ type: 'message', content: [{
      type: 'output_text',
      text: '{"items":[{"foodName":"米饭","quantityG":100,"kcal":116,"carbG":25.9,"proteinG":2.6,"fatG":0.3}],"message":"请确认份量"}',
    }] }],
  })
  assert.equal(parsed.items[0].foodName, '米饭')
  assert.throws(() => helpers.parseOpenAIResponsesOutput({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
  }), /ai_refused/)
  assert.throws(() => helpers.parseOpenAIResponsesOutput({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'not-json' }] }],
  }), /ai_invalid_json/)
})

test('photo quota reservation logic reserves free quota before points and resets daily', () => {
  const user = {
    pointBalance: 2,
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 0 },
  }
  const free = helpers.planPhotoQuotaReservation(user, '2026-07-16', true)
  assert.equal(free.chargeMode, 'free')
  assert.equal(free.pointBalance, 2)
  assert.equal(free.freeRemaining, 0)

  const point = helpers.planPhotoQuotaReservation({
    ...user,
    photoQuota: { ...user.photoQuota, freeUsedToday: 1 },
  }, '2026-07-16', true)
  assert.equal(point.chargeMode, 'point')
  assert.equal(point.pointBalance, 1)

  const denied = helpers.planPhotoQuotaReservation({
    pointBalance: 0,
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 1 },
  }, '2026-07-16', true)
  assert.equal(denied.allowed, false)
  assert.equal(denied.reason, 'insufficient points')

  const nextDay = helpers.planPhotoQuotaReservation(user, '2026-07-17', false)
  assert.equal(nextDay.chargeMode, 'free')
  assert.equal(nextDay.photoQuota.freeUsedToday, 1)

  assert.deepEqual(helpers.planPhotoQuotaRollback({ pointBalance: 1 }, '2026-07-16', 'point'), { pointBalance: 2 })
  assert.deepEqual(helpers.planPhotoQuotaRollback({
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 1 },
  }, '2026-07-16', 'free'), {
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 0 },
  })
})

test('expired photo reservations restore their charge before retrying the reservation', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  const staleFreeUsage = {
    status: 'reserved',
    date: '2026-07-16',
    chargeMode: 'free',
    reservationExpiresAt: new Date(now - 1),
  }
  const freeRecovery = helpers.planPhotoQuotaReservationWithRecovery({
    pointBalance: 0,
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 1 },
  }, staleFreeUsage, '2026-07-16', false, now)

  assert.equal(helpers.isPhotoReservationExpired(staleFreeUsage, now), true)
  assert.equal(freeRecovery.expired, true)
  assert.equal(freeRecovery.rollbackUpdates.photoQuota.freeUsedToday, 0)
  assert.equal(freeRecovery.reservation.allowed, true)
  assert.equal(freeRecovery.reservation.photoQuota.freeUsedToday, 1)

  const pointRecovery = helpers.planPhotoQuotaReservationWithRecovery({
    pointBalance: 0,
    photoQuota: { freeDaily: 0, lastDate: '2026-07-16', freeUsedToday: 0 },
  }, { ...staleFreeUsage, chargeMode: 'point' }, '2026-07-16', true, now)
  assert.equal(pointRecovery.rollbackUpdates.pointBalance, 1)
  assert.equal(pointRecovery.reservation.chargeMode, 'point')
  assert.equal(pointRecovery.reservation.pointBalance, 0)
})

test('entitlement follows the unified response envelope', () => {
  const response = helpers.formatEntitlementResponse({
    pointBalance: 3,
    photoQuota: { freeDaily: 1, lastDate: '2026-07-16', freeUsedToday: 1 },
  }, '2026-07-16', 4)

  assert.equal(response.code, 0)
  assert.equal(response.message, 'ok')
  assert.deepEqual(response.data, {
    pointBalance: 3,
    photoQuota: { freeRemaining: 0, freeUsed: 1, totalToday: 4, freeDaily: 1 },
  })
})

test('only trusted WX context identity is accepted; tests inject it explicitly outside payload', async () => {
  const untrusted = await main({ action: 'authGuest', payload: { openid: 'payload-user' }, userInfo: { openId: 'event-user' } })
  assert.equal(untrusted.code, 401)

  const injected = await helpers.invokeWithTrustedOpenid({ action: 'authGuest', payload: { openid: 'payload-user' } }, 'trusted-user')
  assert.equal(injected.code, 0)
  assert.match(injected.data.userId, /^guest_trusted-user/)
})

test('future record dates and rewards are rejected before any database access', async () => {
  assert.equal(helpers.isWritableRecordDate('2999-01-01', '2026-07-16'), false)
  assert.equal(helpers.isWritableRecordDate('2026-02-30', '2026-07-16'), false)
  assert.equal(helpers.isWritableRecordDate('2026-07-16', '2026-07-16'), true)

  const reward = await helpers.awardDailyStarIfEligible('trusted-user', '2999-01-01', 1000, 500)
  assert.equal(reward.pointAwarded, false)
  assert.deepEqual(reward.warnings, ['future_date_not_eligible'])
})

test('future weights are never selected for plan calibration, including preferred morning entries', () => {
  const selected = helpers.selectCalibrationWeight([
    { id: 'future', date: '2026-07-17', weightKg: 60, weighingContext: 'morning' },
    { id: 'today-evening', date: '2026-07-16', weightKg: 62, weighingContext: 'evening' },
    { id: 'past-morning', date: '2026-07-15', weightKg: 61, weighingContext: '晨起空腹' },
  ], '2026-07-16')

  assert.equal(selected.id, 'past-morning')
})

test('TDEE uses the non-exercise activity baseline; deficit credits 100 percent while intake balance credits 70 percent of exercise', () => {
  assert.equal(helpers.DAILY_ACTIVITY_BASELINE_MULTIPLIER, 1.2)
  assert.equal(helpers.calcTDEE(1500, 1.2), 1800)
  assert.equal(helpers.calcTDEE(1500, 2), 3000)

  const summary = helpers.calculateDailySummaryMetrics({
    tdeeKcal: 1800,
    recommendedIntakeKcal: 1400,
    dailyDeficitTargetKcal: 400,
  }, 1400, 200, true)
  assert.equal(summary.effectiveExerciseKcal, 140)
  assert.equal(summary.dynamicRecommendedIntakeKcal, 1540)
  assert.equal(summary.actualDeficitKcal, 600)
  assert.equal(summary.remainingIntakeKcal, 140)
})

test('goal recalculation exposes energy fields only and leaves custom macros untouched', () => {
  const plan = {
    sex: 'female',
    age: 30,
    heightCm: 165,
    currentWeightKg: 65,
    targetWeightKg: 58,
    weeklyLossKg: 0.5,
    proteinMinG: 111,
    proteinMaxG: 133,
    carbMinG: 144,
    carbMaxG: 166,
    fatMinG: 44,
    fatMaxG: 55,
  }
  const energyUpdates = helpers.energyMetricsOnly(helpers.calculatePlanMetrics(plan, plan.currentWeightKg))
  const updated = { ...plan, ...energyUpdates }

  for (const key of ['proteinMinG', 'proteinMaxG', 'carbMinG', 'carbMaxG', 'fatMinG', 'fatMaxG']) {
    assert.equal(Object.hasOwn(energyUpdates, key), false)
    assert.equal(updated[key], plan[key])
  }
})

test('historical summaries prefer the captured daily plan snapshot over the current plan', () => {
  const plans = [
    { id: 'old', effectiveFromDate: '2026-07-01', tdeeKcal: 1800, dailyDeficitTargetKcal: 400 },
    { id: 'new', effectiveFromDate: '2026-07-15', tdeeKcal: 2200, dailyDeficitTargetKcal: 600 },
  ]
  const snapshots = [{
    date: '2026-07-10',
    planId: 'old',
    tdeeKcal: 1800,
    recommendedIntakeKcal: 1400,
    dailyDeficitTargetKcal: 400,
  }]

  assert.equal(helpers.selectEffectivePlanForDate(plans, '2026-07-10').id, 'old')
  assert.equal(helpers.selectEffectivePlanForDate(plans, '2026-07-16').id, 'new')
  assert.equal(helpers.resolvePlanEnergyForDate('2026-07-10', snapshots, plans), snapshots[0])
})

test('historical records without snapshots are selected for one-time backfill', () => {
  const missing = helpers.getMissingPlanSnapshotDates(
    [{ date: '2026-07-10' }, { date: '2026-07-11' }],
    [{ date: '2026-07-11' }, { date: '2099-01-01' }],
    [{ date: '2026-07-10' }],
    '2026-07-16',
  )
  assert.deepEqual(missing, ['2026-07-11'])
})

test('account deletion visits every collection and accurately reports partial deletion', async () => {
  const visited = []
  const response = await helpers.executeAccountDeletion('trusted-user', async (collectionName) => {
    visited.push(collectionName)
    if (collectionName === 'meals') {
      return { matched: 2, deleted: 1, failures: [{ id: 'meal-2', message: 'remove failed' }] }
    }
    return { matched: 1, deleted: 1, failures: [] }
  })

  assert.deepEqual(visited, helpers.ACCOUNT_COLLECTIONS)
  assert.equal(response.code, 500)
  assert.equal(response.data.deleted, false)
  assert.equal(response.data.partial, true)
  assert.equal(response.data.deletedCounts.meals, 1)
  assert.equal(response.data.collectionResults.meals.matched, 2)
  assert.equal(response.data.failures[0].collection, 'meals')
})

test('cloud function timeout remains comfortably above the upstream AI timeout', () => {
  const config = JSON.parse(fs.readFileSync(new URL('./config.json', `file://${__filename}`), 'utf8'))
  assert.ok(config.timeout * 1000 >= helpers.AI_REQUEST_TIMEOUT_MS * 2)
})

test('trend lookback is explicitly capped at 90 days', () => {
  assert.equal(helpers.normalizeTrendDays(90), 90)
  assert.equal(helpers.normalizeTrendDays(365), 90)
  assert.equal(helpers.normalizeTrendDays(0), 30)
})

test('feedback requires useful bounded content', () => {
  assert.match(helpers.normalizeFeedback({ content: '短' }).error, /5-1000/)
  assert.match(helpers.normalizeFeedback({ content: 'x'.repeat(1001) }).error, /5-1000/)
  assert.deepEqual(helpers.normalizeFeedback({ content: '  希望趋势图支持自定义区间  ' }), {
    content: '希望趋势图支持自定义区间',
    category: 'general',
  })
})
