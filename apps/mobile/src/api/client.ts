/**
 * Lightweight API client for the Fat Loss backend.
 * Falls back to mock data when the server is unreachable.
 */

const BASE_URL =
  (typeof process !== 'undefined' && (process as any).env?.EXPO_PUBLIC_API_URL) ||
  'http://127.0.0.1:8797';

let _token: string | null = null;

export function setToken(token: string | null) {
  _token = token;
}

export function getToken() {
  return _token;
}

// ── Generic fetch wrapper ─────────────────────────────────────────

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const json = await res.json();

    if (!res.ok) {
      return { ok: false, error: json.error || json.message || `HTTP ${res.status}` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// ── Auth ──────────────────────────────────────────────────────────

export interface GuestAuthResponse {
  token: string;
  userId: string;
  tier: string;
  isNew: boolean;
}

export async function authGuest() {
  return request<GuestAuthResponse>('POST', '/auth/guest');
}

// ── Plans ─────────────────────────────────────────────────────────

export interface CreatePlanBody {
  sex: 'male' | 'female';
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityMultiplier: number;
  weeklyLossKg?: number;
  targetDate?: string;
}

export interface PlanRecord {
  id: string;
  currentWeightKg: number;
  targetWeightKg: number;
  targetDate: string | null;
  weeklyLossKg: number | null;
  heightCm: number;
  age: number;
  sex: string;
  activityLevel: number;
  bmrKcal: number;
  tdeeKcal: number;
  dailyDeficitTargetKcal: number;
  recommendedIntakeKcal: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbMinG: number;
  carbMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

export async function createPlan(body: CreatePlanBody) {
  return request<{ plan: PlanRecord; warnings: string[] }>('POST', '/plans', body);
}

export async function getCurrentPlan() {
  return request<{ plan: PlanRecord }>('GET', '/plans/current');
}

export async function updatePlanGoal(body: {
  targetWeightKg?: number;
  weeklyLossKg?: number;
  targetDate?: string;
}) {
  return request<{ plan: PlanRecord }>('PATCH', '/plans/current/goal', body);
}

export async function updatePlanMacros(body: {
  proteinMinG?: number;
  proteinMaxG?: number;
  carbMinG?: number;
  carbMaxG?: number;
  fatMinG?: number;
  fatMaxG?: number;
}) {
  return request<{ plan: PlanRecord }>('PATCH', '/plans/current/macros', body);
}

// ── Daily summary ─────────────────────────────────────────────────

export interface DailySummaryResponse {
  date: string;
  hasPlan: boolean;
  message?: string;
  plan?: { tdeeKcal: number; targetDeficitKcal: number; recommendedIntakeKcal: number };
  intake?: { totalKcal: number; carbG: number; proteinG: number; fatG: number };
  exercise?: { totalKcal: number; count: number };
  summary?: {
    actualDeficitKcal: number;
    remainingIntakeKcal: number;
    achievementRate: number;
    effectiveExerciseKcal: number;
  };
  star?: {
    awarded: boolean;
    isRecordComplete: boolean;
    recordedMealSlots: number;
    warnings: string[];
  };
}

export async function getDailySummary(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<DailySummaryResponse>('GET', `/daily-summary${q}`);
}

// ── Meals ─────────────────────────────────────────────────────────

export interface MealItemInput {
  foodName: string;
  quantityG: number;
  kcal: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  confidence?: number;
  isAiEstimated?: boolean;
}

export interface MealEntry {
  id: string;
  date: string;
  mealSlot: string;
  status: string;
  totalKcal: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  items: MealItemInput[];
}

export interface CreateMealBody {
  date: string;
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'other' | 'drink';
  status?: 'recorded' | 'skipped' | 'fasting';
  source?: string;
  items?: MealItemInput[];
}

export async function createMeal(body: CreateMealBody) {
  return request<{ meal: MealEntry }>('POST', '/meals', body);
}

export async function getMeals(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<{ meals: MealEntry[]; totals: { totalKcal: number; carbG: number; proteinG: number; fatG: number } }>(
    'GET',
    `/meals${q}`,
  );
}

// ── Exercises ─────────────────────────────────────────────────────

export interface ExerciseEntry {
  id: string;
  date: string;
  exerciseType: string;
  durationMin: number;
  met: number;
  rawKcal: number;
  confirmedKcal: number;
}

export interface CreateExerciseBody {
  date: string;
  exerciseType: string;
  durationMin: number;
  weightKg?: number;
  source?: string;
}

export async function createExercise(body: CreateExerciseBody) {
  return request<{ exercise: ExerciseEntry }>('POST', '/exercises', body);
}

export async function getExercises(date?: string) {
  const q = date ? `?date=${date}` : '';
  return request<{ exercises: ExerciseEntry[]; totalKcal: number }>('GET', `/exercises${q}`);
}

// ── Weights ───────────────────────────────────────────────────────

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  weighingContext: string;
}

export interface CreateWeightBody {
  date: string;
  weightKg: number;
  weighingContext?: 'morning_fasted' | 'after_meal' | 'evening' | 'other';
  source?: string;
}

export async function createWeight(body: CreateWeightBody) {
  return request<{ weight: WeightEntry }>('POST', '/weights', body);
}

export async function getWeights(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString() ? `?${params}` : '';
  return request<{ weights: WeightEntry[] }>('GET', `/weights${q}`);
}

// ── Trends ────────────────────────────────────────────────────────

export interface WeightTrendResponse {
  points: { date: string; weightKg: number }[];
  movingAverage: { date: string; weightKg: number }[];
  planTarget: number | null;
  planStart: number | null;
}

export interface DeficitTrendResponse {
  data: {
    date: string;
    intakeKcal: number;
    exerciseKcal: number;
    actualDeficitKcal: number;
    targetDeficitKcal: number;
  }[];
  targetDeficitKcal: number | null;
}

export async function getWeightTrend(days?: number) {
  return request<WeightTrendResponse>('GET', `/trends/weight?days=${days ?? 30}`);
}

export async function getDeficitTrend(days?: number) {
  return request<DeficitTrendResponse>('GET', `/trends/deficit?days=${days ?? 30}`);
}

// ── AI ────────────────────────────────────────────────────────────

export interface TextEstimateResponse {
  estimate: {
    foodName: string;
    kcal: number;
    carbG: number;
    proteinG: number;
    fatG: number;
    confidence: number;
  };
  message: string;
  note: string;
}

export async function aiTextEstimate(description: string) {
  return request<TextEstimateResponse>('POST', '/ai/meal-text-estimate', { description });
}

// ── Account ───────────────────────────────────────────────────────

export async function deleteAccount() {
  return request<{ deleted: boolean; message: string }>('DELETE', '/account');
}

// ── Subscription ──────────────────────────────────────────────────

export interface SubscriptionResponse {
  tier: string;
  limits: {
    photoEstimatesPerDay: number;
    textEstimatesPerDay: number;
    manualEntryUnlimited: boolean;
  };
}

export async function getSubscription() {
  return request<SubscriptionResponse>('GET', '/subscription/entitlement');
}
