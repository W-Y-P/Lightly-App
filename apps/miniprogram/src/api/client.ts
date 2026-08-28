/**
 * 小程序 API client - 微信云优先，失败回退到 HTTP/local
 */
import Taro from '@tarojs/taro'
import { isCloudConfigured, useHttpFallback } from '../config/cloud'

const CLOUD_FUNCTION_NAME = 'lightlyApi'
const BASE_URL = 'http://127.0.0.1:8797'
const CLOUD_REQUEST_TIMEOUT_MS = 12_000
const AI_REQUEST_TIMEOUT_MS = 45_000
const RETRY_DELAY_MS = 350

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; data?: T }

interface BackendRequestOptions {
  timeoutMs?: number
  retryCloud?: boolean
}

interface ClientRequestBody {
  clientRequestId?: string
}

export type AuthMode = 'wechat' | 'guest' | null

export interface OnboardingStatus {
  needsOnboarding: boolean
  hasPlan: boolean
  skipped: boolean
}

type AuthResponse = { token: string; userId: string; isNew: boolean } & OnboardingStatus

let _token: string | null = null
let _authMode: AuthMode = null
let _cloudFailureCount = 0
let _cloudRetryAfter = 0
let _bootstrapOnboardingStatus: OnboardingStatus | null = null
const CLOUD_FAILURE_THRESHOLD = 3
const CLOUD_BREAKER_COOLDOWN_MS = 10_000

export function setToken(token: string | null) {
  _token = token
}

export function getToken() {
  return _token
}

export function getAuthMode(): AuthMode {
  return _authMode
}

function onboardingDismissalKey(): string {
  const userId = String(Taro.getStorageSync('userId') || 'anonymous')
  return `onboardingDismissed:${userId}`
}

export function dismissOnboardingLocally() {
  Taro.setStorageSync(onboardingDismissalKey(), true)
}

function onboardingDismissedLocally(): boolean {
  return Boolean(Taro.getStorageSync(onboardingDismissalKey()))
}

function clearOnboardingDismissal() {
  Taro.removeStorageSync(onboardingDismissalKey())
}

// ── Auth readiness singleton ──

let _authReadyPromise: Promise<boolean> | null = null

/**
 * Ensure authentication is complete before making API calls.
 * Returns a Promise<boolean> that resolves to true if authenticated,
 * false if all login attempts failed (pages should render an explicit offline state).
 *
 * - Only initializes once; subsequent calls reuse the same Promise.
 * - Can be awaited by pages to avoid race conditions with token writes.
 * - Called eagerly from app.ts on launch for non-blocking startup.
 */
export function ensureAuthReady(): Promise<boolean> {
  if (!_authReadyPromise) {
    _authReadyPromise = _doInitAuth().then((ready) => {
      if (!ready) _authReadyPromise = null
      return ready
    }, (error) => {
      _authReadyPromise = null
      throw error
    })
  }
  return _authReadyPromise
}

/** Reset auth state (used on logout / account delete). */
export function resetAuth() {
  clearOnboardingDismissal()
  _token = null
  _authMode = null
  _authReadyPromise = null
  _cloudFailureCount = 0
  _cloudRetryAfter = 0
  _bootstrapOnboardingStatus = null
  Taro.removeStorageSync('token')
  Taro.removeStorageSync('userId')
  Taro.removeStorageSync('authMode')
}

async function _doInitAuth(): Promise<boolean> {
  try {
    // Step 1: cached token
    const cached = Taro.getStorageSync('token')
    if (cached) {
      setToken(cached)
      const cachedMode = Taro.getStorageSync('authMode')
      _authMode = cachedMode === 'wechat' || cachedMode === 'guest' ? cachedMode : null
      return true
    }

    // Step 2: WeChat login
    let tokenResult: AuthResponse | null = null
    let authMode: Exclude<AuthMode, null> | null = null

    try {
      const loginRes = await Taro.login()
      if (loginRes.code) {
        const res = await authWechat(loginRes.code)
        if (res.ok) {
          tokenResult = res.data
          authMode = 'wechat'
        }
      }
    } catch {
      // wx.login or wechat auth failed, fall through to guest
    }

    // Step 3: Guest fallback
    if (!tokenResult) {
      const res = await authGuest()
      if (res.ok) {
        tokenResult = res.data
        authMode = 'guest'
      }
    }

    if (tokenResult) {
      setToken(tokenResult.token)
      _authMode = authMode
      _bootstrapOnboardingStatus = typeof tokenResult.needsOnboarding === 'boolean'
        && typeof tokenResult.hasPlan === 'boolean'
        && typeof tokenResult.skipped === 'boolean'
        ? {
            needsOnboarding: tokenResult.needsOnboarding,
            hasPlan: tokenResult.hasPlan,
            skipped: tokenResult.skipped,
          }
        : null
      Taro.setStorageSync('token', tokenResult.token)
      Taro.setStorageSync('userId', tokenResult.userId)
      if (authMode) Taro.setStorageSync('authMode', authMode)
      return true
    }

    console.warn('[Auth] All login attempts failed; rendering offline empty states')
    return false
  } catch (err) {
    console.error('[Auth] init error:', err)
    return false
  }
}

function isCloudAvailable(): boolean {
  try {
    if (!isCloudConfigured()) return false
    if (_cloudRetryAfter > Date.now()) return false
    if (typeof process !== 'undefined' && process.env && process.env.TARO_ENV === 'h5') return false
    return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined'
  } catch {
    return false
  }
}

function isRetriableCloudError(err: any): boolean {
  const text = `${err?.errMsg || ''} ${err?.message || ''} ${String(err || '')}`.toLowerCase()
  return text.includes('timeout') || text.includes('timed out') || text.includes('-504')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeClientRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function withClientRequestId<T extends ClientRequestBody>(prefix: string, body: T): T & { clientRequestId: string } {
  return {
    ...body,
    clientRequestId: body.clientRequestId || makeClientRequestId(prefix),
  }
}

function isRetriableResultError(error: string): boolean {
  return /network_error|cloud_timeout|cloud_call_failed|empty_cloud_result|HTTP (408|429|5\d\d)/i.test(error)
}

async function callCloudFunctionOnce(action: string, payload?: unknown) {
  return (wx.cloud as any).callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: { action, payload: payload || {} },
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, action: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`cloud action ${action} timed out after ${timeoutMs / 1000}s`)
      ;(error as Error & { code?: string }).code = 'CLOUD_TIMEOUT'
      reject(error)
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function cloudRequest<T>(
  action: string,
  payload?: unknown,
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS,
  retryCloud = true,
): Promise<ApiResult<T>> {
  const request = callCloudFunctionOnce(action, payload).catch(async (err: any) => {
    if (!retryCloud || !isRetriableCloudError(err)) throw err
    await sleep(RETRY_DELAY_MS)
    return callCloudFunctionOnce(action, payload)
  })
  return withTimeout(request, timeoutMs, action).then((res: any) => {
    _cloudFailureCount = 0
    _cloudRetryAfter = 0
    const result = res && res.result
    if (!result) {
      return { ok: false, error: 'empty_cloud_result' } as const
    }
    if (result.code === 0) {
      return { ok: true, data: result.data as T } as const
    }
    return { ok: false, error: result.message || 'cloud_error', data: result.data as T | undefined } as const
  }).catch((err: any) => {
    if (err?.code === 'CLOUD_TIMEOUT') {
      console.warn(`[Cloud] ${action} timed out after ${timeoutMs / 1000}s`)
      return { ok: false, error: `cloud_timeout_${timeoutMs / 1000}s:${action}` } as const
    }
    _cloudFailureCount += 1
    if (_cloudFailureCount >= CLOUD_FAILURE_THRESHOLD) {
      _cloudFailureCount = 0
      _cloudRetryAfter = Date.now() + CLOUD_BREAKER_COOLDOWN_MS
    }
    console.warn('[Cloud] callFunction failed, fallback to HTTP:', err)
    return { ok: false, error: 'cloud_call_failed' } as const
  })
}

async function httpRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = CLOUD_REQUEST_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  try {
    const header: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (_token) header['Authorization'] = `Bearer ${_token}`

    const res = await Taro.request({
      url: `${BASE_URL}${path}`,
      method: method as any,
      header,
      data: body != null ? body : undefined,
      timeout: timeoutMs,
    })

    if (res.statusCode >= 400) {
      return { ok: false, error: res.data?.error || `HTTP ${res.statusCode}` }
    }
    return { ok: true, data: res.data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

async function backendRequest<T>(
  action: string,
  payload?: unknown,
  httpMethod?: string,
  httpPath?: string,
  httpBody?: unknown,
  options: BackendRequestOptions = {},
): Promise<ApiResult<T>> {
  const timeoutMs = options.timeoutMs ?? CLOUD_REQUEST_TIMEOUT_MS
  let cloudFailure: ApiResult<T> | null = null
  if (isCloudAvailable()) {
    const cloudRes = await cloudRequest<T>(action, payload, timeoutMs, options.retryCloud !== false)
    if (cloudRes.ok) {
      return cloudRes
    }
    if (cloudRes.error !== 'cloud_call_failed') {
      return cloudRes
    }
    cloudFailure = cloudRes
  }

  if (!useHttpFallback || !httpMethod || !httpPath) {
    return cloudFailure || { ok: false, error: 'cloud_temporarily_unavailable' }
  }
  return httpRequest<T>(httpMethod, httpPath, httpBody, timeoutMs)
}

async function createRequestWithRetry<T>(
  action: string,
  body: ClientRequestBody,
  httpPath: string,
  options: BackendRequestOptions = {},
): Promise<ApiResult<T>> {
  const request = () => backendRequest<T>(action, body, 'POST', httpPath, body, options)
  const firstResult = await request()
  if (firstResult.ok || !isRetriableResultError(firstResult.error)) return firstResult
  await sleep(RETRY_DELAY_MS)
  return request()
}

// ── Auth ──

/** 游客登录，返回 token/userId，不含 tier */
export async function authGuest() {
  return backendRequest<AuthResponse>('authGuest', {}, 'POST', '/auth/guest')
}

/** 微信登录：传入 wx.login() 返回的 code */
export async function authWechat(code: string) {
  return backendRequest<AuthResponse>('authWechat', { code }, 'POST', '/auth/wechat', { code })
}

export async function getOnboardingStatus() {
  if (_bootstrapOnboardingStatus) {
    const data = _bootstrapOnboardingStatus
    _bootstrapOnboardingStatus = null
    return { ok: true, data } as const
  }
  const result = await backendRequest<OnboardingStatus>('getOnboardingStatus', {}, 'GET', '/onboarding/status')
  if (result.ok && result.data.needsOnboarding && onboardingDismissedLocally()) {
    return { ...result, data: { ...result.data, needsOnboarding: false, skipped: true } }
  }
  return result
}

export async function skipOnboarding() {
  const result = await backendRequest<OnboardingStatus>('skipOnboarding', {}, 'POST', '/onboarding/skip', {})
  if (result.ok) dismissOnboardingLocally()
  return result
}

// ── Entitlement (积分 / 额度) ──

export interface PhotoQuota {
  freeRemaining: number
  freeUsed: number
  totalToday: number
}

export interface EntitlementResponse {
  pointBalance: number
  photoQuota: PhotoQuota
}

/** 查询当前用户积分余额和拍照剩余额度 */
export async function getEntitlement() {
  return backendRequest<EntitlementResponse>('getEntitlement', {}, 'GET', '/points/entitlement')
}

// ── Plans ──
export interface CreatePlanBody {
  sex: 'male' | 'female'
  age: number
  heightCm: number
  currentWeightKg: number
  targetWeightKg: number
  activityMultiplier: number
  weeklyLossKg?: number
  targetDate?: string
  clientRequestId?: string
}

export interface PlanRecord {
  id: string
  currentWeightKg: number
  targetWeightKg: number
  targetDate: string | null
  weeklyLossKg: number | null
  heightCm: number
  age: number
  sex: string
  activityLevel: number
  bmrKcal: number
  tdeeKcal: number
  dailyDeficitTargetKcal: number
  recommendedIntakeKcal: number
  proteinMinG: number
  proteinMaxG: number
  carbMinG: number
  carbMaxG: number
  fatMinG: number
  fatMaxG: number
}

export async function createPlan(body: CreatePlanBody) {
  const requestBody = withClientRequestId('plan', body)
  const result = await createRequestWithRetry<{ plan: PlanRecord; warnings: string[]; deduplicated?: boolean }>(
    'createPlan',
    requestBody,
    '/plans',
  )
  if (result.ok) clearOnboardingDismissal()
  return result
}

export async function getCurrentPlan() {
  return backendRequest<{ plan: PlanRecord | null }>('getCurrentPlan', {}, 'GET', '/plans/current')
}

export interface UpdatePlanGoalBody {
  mode?: 'weekly' | 'date'
  targetWeightKg?: number
  weeklyLossKg?: number | null
  targetDate?: string | null
}

export interface UpdatePlanMacrosBody {
  proteinMinG?: number
  proteinMaxG?: number
  carbMinG?: number
  carbMaxG?: number
  fatMinG?: number
  fatMaxG?: number
}

export async function updatePlanGoal(body: UpdatePlanGoalBody) {
  return backendRequest<{ plan: PlanRecord }>('updatePlanGoal', body, 'PATCH', '/plans/current/goal', body)
}

export async function updatePlanMacros(body: UpdatePlanMacrosBody) {
  return backendRequest<{ plan: PlanRecord }>('updatePlanMacros', body, 'PATCH', '/plans/current/macros', body)
}

export async function updatePlanActivity(activityLevel: number) {
  const body = { activityLevel }
  return backendRequest<{ plan: PlanRecord }>('updatePlanActivity', body, 'PATCH', '/plans/current/activity', body)
}

// ── Daily summary ──
export interface DailySummaryResponse {
  date: string
  hasPlan: boolean
  message?: string
  plan?: { tdeeKcal: number; targetDeficitKcal: number; recommendedIntakeKcal: number }
  intake?: { totalKcal: number; carbG: number; proteinG: number; fatG: number }
  exercise?: { totalKcal: number; count: number }
  summary?: {
    actualDeficitKcal: number
    remainingIntakeKcal: number
    achievementRate: number
    effectiveExerciseKcal: number
  }
  star?: {
    awarded: boolean
    isRecordComplete: boolean
    recordedMealSlots: number
    pointAwarded: boolean
    warnings: string[]
    consecutiveDays?: number
    cumulativeStars?: number
  }
  pointBalance?: number
}

export async function getDailySummary(date?: string) {
  const q = date ? `?date=${date}` : ''
  return backendRequest<DailySummaryResponse>('getDailySummary', { date }, 'GET', `/daily-summary${q}`)
}

export interface RecordCalendarDay {
  date: string
  intakeKcal: number
  exerciseKcal: number
  actualDeficitKcal: number
  targetDeficitKcal: number | null
  achievementRate: number | null
  recordComplete: boolean
  recordedMealSlots: number
  achieved: boolean
  star: boolean
  weightKg: number | null
}

export async function getRecordCalendar(month: string) {
  return backendRequest<{ month: string; days: RecordCalendarDay[] }>(
    'getRecordCalendar',
    { month },
    'GET',
    `/records/calendar?month=${encodeURIComponent(month)}`,
  )
}

// ── Meals ──
export interface MealItemInput {
  foodName: string
  quantityG: number
  kcal: number
  carbG: number
  proteinG: number
  fatG: number
}

export interface MealEntry {
  id: string
  date: string
  mealSlot: string
  status: string
  totalKcal: number
  carbG: number
  proteinG: number
  fatG: number
  items: MealItemInput[]
  createdAt?: string
  clientRequestId?: string
}

export interface CreateMealBody {
  date: string
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'other' | 'drink'
  status?: 'recorded' | 'skipped' | 'fasting'
  items?: MealItemInput[]
  clientRequestId?: string
}

export async function createMeal(body: CreateMealBody) {
  const requestBody = withClientRequestId('meal', body)
  return createRequestWithRetry<{ meal: MealEntry; deduplicated?: boolean }>('createMeal', requestBody, '/meals')
}

export type UpdateMealBody = Partial<Omit<CreateMealBody, 'clientRequestId'>>

export async function updateMeal(id: string, body: UpdateMealBody) {
  const payload = { id, ...body }
  return backendRequest<{ meal: MealEntry }>('updateMeal', payload, 'PATCH', `/meals/${encodeURIComponent(id)}`, body)
}

export async function deleteMeal(id: string) {
  return backendRequest<{ deleted: boolean; meal: MealEntry }>('deleteMeal', { id }, 'DELETE', `/meals/${encodeURIComponent(id)}`)
}

export async function getMeals(date?: string) {
  const q = date ? `?date=${date}` : ''
  return backendRequest<{ meals: MealEntry[]; totals: { totalKcal: number; carbG: number; proteinG: number; fatG: number } }>('getMeals', { date }, 'GET', `/meals${q}`)
}

// ── Exercises ──
export interface ExerciseEntry {
  id: string
  date: string
  exerciseType: string
  durationMin: number
  met?: number
  estimateWeightKg?: number
  estimatedKcal?: number
  confirmedKcal: number
  calorieSource?: 'met' | 'manual'
  clientRequestId?: string
}

export interface CreateExerciseBody {
  date: string
  exerciseType: string
  durationMin: number
  weightKg?: number
  /** 用户手动覆盖热量；不传则由后端 MET 自动估算 */
  confirmedKcal?: number
  /** 同一次提交重试时复用该值，服务端按用户去重。 */
  clientRequestId?: string
}

export async function createExercise(body: CreateExerciseBody) {
  const requestBody = withClientRequestId('exercise', body)
  return createRequestWithRetry<{ exercise: ExerciseEntry; deduplicated?: boolean }>('createExercise', requestBody, '/exercises')
}

export type UpdateExerciseBody = Partial<Omit<CreateExerciseBody, 'clientRequestId'>>

export async function updateExercise(id: string, body: UpdateExerciseBody) {
  const payload = { id, ...body }
  return backendRequest<{ exercise: ExerciseEntry }>('updateExercise', payload, 'PATCH', `/exercises/${encodeURIComponent(id)}`, body)
}

export async function deleteExercise(id: string) {
  return backendRequest<{ deleted: boolean; exercise: ExerciseEntry }>('deleteExercise', { id }, 'DELETE', `/exercises/${encodeURIComponent(id)}`)
}

export async function getExercises(date?: string) {
  const q = date ? `?date=${date}` : ''
  return backendRequest<{ exercises: ExerciseEntry[]; totalKcal: number }>('getExercises', { date }, 'GET', `/exercises${q}`)
}

// ── Weights ──
export interface WeightEntry {
  id: string
  date: string
  weightKg: number
  weighingContext?: string
  clientRequestId?: string
  createdAt?: string
}

export interface WeightCalibration {
  applied: boolean
  standardizedWeightKg: number | null
  standardizedDate?: string | null
  source: 'morning' | 'latest' | 'baseline' | 'none'
  message: string
  plan?: Pick<PlanRecord,
    'id' | 'currentWeightKg' | 'targetWeightKg' | 'targetDate' | 'weeklyLossKg' |
    'bmrKcal' | 'tdeeKcal' | 'dailyDeficitTargetKcal' | 'recommendedIntakeKcal' |
    'proteinMinG' | 'proteinMaxG' | 'carbMinG' | 'carbMaxG' | 'fatMinG' | 'fatMaxG'>
}

export interface CreateWeightBody {
  date: string
  weightKg: number
  weighingContext?: string
  clientRequestId?: string
}

export async function createWeight(body: CreateWeightBody) {
  const requestBody = withClientRequestId('weight', body)
  return createRequestWithRetry<{ weight: WeightEntry; calibration: WeightCalibration; deduplicated?: boolean }>(
    'createWeight',
    requestBody,
    '/weights',
  )
}

export async function updateWeight(id: string, body: Partial<Omit<CreateWeightBody, 'clientRequestId'>>) {
  const payload = { id, ...body }
  return backendRequest<{ weight: WeightEntry; calibration: WeightCalibration }>('updateWeight', payload, 'PATCH', `/weights/${encodeURIComponent(id)}`, body)
}

export async function deleteWeight(id: string) {
  return backendRequest<{ deleted: boolean; weight: WeightEntry; calibration: WeightCalibration }>('deleteWeight', { id }, 'DELETE', `/weights/${encodeURIComponent(id)}`)
}

export async function getWeights(from?: string, to?: string) {
  const params: string[] = []
  if (from) params.push(`from=${from}`)
  if (to) params.push(`to=${to}`)
  const q = params.length ? `?${params.join('&')}` : ''
  return backendRequest<{ weights: WeightEntry[] }>('getWeights', { from, to }, 'GET', `/weights${q}`)
}

// ── Trends ──
export async function getWeightTrend(days?: number) {
  return backendRequest<{ points: { date: string; weightKg: number; weighingContext?: string }[] }>('getWeightTrend', { days }, 'GET', `/trends/weight?days=${days ?? 30}`)
}

export async function getDeficitTrend(days?: number) {
  return backendRequest<{ data: { date: string; intakeKcal: number; exerciseKcal: number; actualDeficitKcal: number }[] }>('getDeficitTrend', { days }, 'GET', `/trends/deficit?days=${days ?? 30}`)
}

// ── AI ──
export async function aiTextEstimate(description: string, clientRequestId?: string) {
  const payload = withClientRequestId('ai_text', { description, clientRequestId })
  return backendRequest<{
    /** @deprecated 兼容旧调用，单条粗估结果 */
    estimate: { foodName: string; kcal: number; carbG: number; proteinG: number; fatG: number; confidence: number }
    /** 食品列表（新） */
    items: MealItemInput[]
    message: string
  }>('aiTextEstimate', payload, 'POST', '/ai/meal-text-estimate', payload, {
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    retryCloud: false,
  })
}

export interface PhotoEstimateOptions {
  mimeType?: string
  usePoint?: boolean
  imageSizeBytes?: number
  /** 兼容已有上传组件的 sizeBytes 命名。 */
  sizeBytes?: number
  clientRequestId?: string
}

/** AI 拍照识别；兼容旧的分参数调用和包含 MIME/大小的 options 调用。 */
export async function aiPhotoEstimate(
  imageBase64: string,
  mimeTypeOrOptions?: string | PhotoEstimateOptions,
  usePoint?: boolean,
  imageSizeBytes?: number,
) {
  const options: PhotoEstimateOptions = typeof mimeTypeOrOptions === 'object'
    ? mimeTypeOrOptions
    : { mimeType: mimeTypeOrOptions, usePoint, imageSizeBytes }
  const payload = withClientRequestId('ai_photo', {
    imageBase64,
    mimeType: options.mimeType || 'image/jpeg',
    usePoint: options.usePoint ?? false,
    imageSizeBytes: options.imageSizeBytes ?? options.sizeBytes,
    clientRequestId: options.clientRequestId,
  })
  return backendRequest<{
    /** @deprecated 兼容旧调用，单条粗估结果 */
    estimate: { foodName: string; kcal: number; carbG: number; proteinG: number; fatG: number; confidence: number }
    /** 食品列表（新） */
    items: MealItemInput[]
    pointBalance: number
    freeRemaining: number
    usedPoint: boolean
    message: string
    note: string
    image: { mimeType: string; sizeBytes: number }
    mimeType: string
    imageSizeBytes: number
    timing?: {
      validationMs: number
      quotaMs: number
      aiMs: number
      commitMs?: number
      totalServerMs?: number
      recoveredReservations?: number
      deduplicated?: boolean
    }
  }>('aiPhotoEstimate', payload, 'POST', '/ai/meal-photo-estimate', payload, {
    timeoutMs: AI_REQUEST_TIMEOUT_MS,
    retryCloud: false,
  })
}

export async function createFeedback(content: string) {
  const payload = withClientRequestId('feedback', { content, category: 'general', clientRequestId: undefined })
  return createRequestWithRetry<{ id: string; deduplicated?: boolean }>('createFeedback', payload, '/feedback')
}

// ── Account ──
/** 删除账号及所有数据（需确认） */
export async function deleteAccount() {
  const result = await backendRequest<{
    deleted: boolean
    partial?: boolean
    deletedCounts?: Record<string, number>
    failures?: Array<{ collection?: string; id?: string; message?: string }>
    message?: string
  }>('deleteAccount', {}, 'DELETE', '/account')
  if (result.ok) resetAuth()
  return result
}
