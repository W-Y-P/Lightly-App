/**
 * 小程序 API client - 对齐后端接口
 */
import Taro from '@tarojs/taro'

const BASE_URL = 'http://127.0.0.1:8797'

let _token: string | null = null

export function setToken(token: string | null) {
  _token = token
}

export function getToken() {
  return _token
}

// ── Auth readiness singleton ──

let _authReadyPromise: Promise<boolean> | null = null

/**
 * Ensure authentication is complete before making API calls.
 * Returns a Promise<boolean> that resolves to true if authenticated,
 * false if all login attempts failed (app should fall back to mock).
 *
 * - Only initializes once; subsequent calls reuse the same Promise.
 * - Can be awaited by pages to avoid race conditions with token writes.
 * - Called eagerly from app.ts on launch for non-blocking startup.
 */
export function ensureAuthReady(): Promise<boolean> {
  if (!_authReadyPromise) {
    _authReadyPromise = _doInitAuth()
  }
  return _authReadyPromise
}

/** Reset auth state (used on logout / account delete). */
export function resetAuth() {
  _token = null
  _authReadyPromise = null
  Taro.removeStorageSync('token')
  Taro.removeStorageSync('userId')
}

async function _doInitAuth(): Promise<boolean> {
  try {
    // Step 1: cached token
    const cached = Taro.getStorageSync('token')
    if (cached) {
      setToken(cached)
      return true
    }

    // Step 2: WeChat login
    let tokenResult: { token: string; userId: string } | null = null

    try {
      const loginRes = await Taro.login()
      if (loginRes.code) {
        const res = await authWechat(loginRes.code)
        if (res.ok) {
          tokenResult = res.data
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
      }
    }

    if (tokenResult) {
      setToken(tokenResult.token)
      Taro.setStorageSync('token', tokenResult.token)
      Taro.setStorageSync('userId', tokenResult.userId)
      return true
    }

    console.warn('[Auth] All login attempts failed, using mock mode')
    return false
  } catch (err) {
    console.error('[Auth] init error:', err)
    return false
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
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
    })

    if (res.statusCode >= 400) {
      return { ok: false, error: res.data?.error || `HTTP ${res.statusCode}` }
    }
    return { ok: true, data: res.data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

// ── Auth ──

/** 游客登录，返回 token/userId，不含 tier */
export async function authGuest() {
  return request<{ token: string; userId: string; isNew: boolean }>('POST', '/auth/guest')
}

/** 微信登录：传入 wx.login() 返回的 code */
export async function authWechat(code: string) {
  return request<{ token: string; userId: string; isNew: boolean }>('POST', '/auth/wechat', { code })
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
  return request<EntitlementResponse>('GET', '/points/entitlement')
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
  return request<{ plan: PlanRecord; warnings: string[] }>('POST', '/plans', body)
}

export async function getCurrentPlan() {
  return request<{ plan: PlanRecord }>('GET', '/plans/current')
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
  }
  pointBalance?: number
}

export async function getDailySummary(date?: string) {
  const q = date ? `?date=${date}` : ''
  return request<DailySummaryResponse>('GET', `/daily-summary${q}`)
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
  items: MealItemInput[]
}

export interface CreateMealBody {
  date: string
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'other' | 'drink'
  status?: 'recorded' | 'skipped' | 'fasting'
  items?: MealItemInput[]
}

export async function createMeal(body: CreateMealBody) {
  return request<{ meal: MealEntry }>('POST', '/meals', body)
}

export async function getMeals(date?: string) {
  const q = date ? `?date=${date}` : ''
  return request<{ meals: MealEntry[]; totals: { totalKcal: number; carbG: number; proteinG: number; fatG: number } }>('GET', `/meals${q}`)
}

// ── Exercises ──
export interface ExerciseEntry {
  id: string
  date: string
  exerciseType: string
  durationMin: number
  confirmedKcal: number
}

export interface CreateExerciseBody {
  date: string
  exerciseType: string
  durationMin: number
  weightKg?: number
}

export async function createExercise(body: CreateExerciseBody) {
  return request<{ exercise: ExerciseEntry }>('POST', '/exercises', body)
}

export async function getExercises(date?: string) {
  const q = date ? `?date=${date}` : ''
  return request<{ exercises: ExerciseEntry[]; totalKcal: number }>('GET', `/exercises${q}`)
}

// ── Weights ──
export interface WeightEntry {
  id: string
  date: string
  weightKg: number
}

export async function createWeight(body: { date: string; weightKg: number; weighingContext?: string }) {
  return request<{ weight: WeightEntry }>('POST', '/weights', body)
}

export async function getWeights(from?: string, to?: string) {
  const params: string[] = []
  if (from) params.push(`from=${from}`)
  if (to) params.push(`to=${to}`)
  const q = params.length ? `?${params.join('&')}` : ''
  return request<{ weights: WeightEntry[] }>('GET', `/weights${q}`)
}

// ── Trends ──
export async function getWeightTrend(days?: number) {
  return request<{ points: { date: string; weightKg: number }[] }>('GET', `/trends/weight?days=${days ?? 30}`)
}

export async function getDeficitTrend(days?: number) {
  return request<{ data: { date: string; intakeKcal: number; exerciseKcal: number; actualDeficitKcal: number }[] }>('GET', `/trends/deficit?days=${days ?? 30}`)
}

// ── AI ──
export async function aiTextEstimate(description: string) {
  return request<{ estimate: { foodName: string; kcal: number; carbG: number; proteinG: number; fatG: number; confidence: number }; message: string }>('POST', '/ai/meal-text-estimate', { description })
}

/** AI 拍照识别：imageBase64, mimeType, usePoint(是否使用积分兑换额外次数) */
export async function aiPhotoEstimate(imageBase64: string, mimeType?: string, usePoint?: boolean) {
  return request<{
    estimate: { foodName: string; kcal: number; carbG: number; proteinG: number; fatG: number; confidence: number }
    pointBalance: number
    freeRemaining: number
    usedPoint: boolean
    message: string
    note: string
  }>('POST', '/ai/meal-photo-estimate', { imageBase64, mimeType: mimeType ?? 'image/jpeg', usePoint: usePoint ?? false })
}

// ── Account ──
/** 删除账号及所有数据（需确认） */
export async function deleteAccount() {
  return request<{ deleted: boolean; message: string }>('DELETE', '/account')
}
