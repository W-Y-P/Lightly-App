import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as api from '../api/client';
import type { PlanRecord } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────

export type TabKey = 'today' | 'record' | 'trend' | 'plan' | 'profile';

interface AppState {
  // Auth
  token: string | null;
  userId: string | null;
  tier: string;
  isAuthenticated: boolean;
  // Plan
  plan: PlanRecord | null;
  planLoaded: boolean;
  // Navigation
  activeTab: TabKey;
  // Onboarding
  showOnboarding: boolean;
  // Mock indicator
  isUsingMockData: boolean;
  // Actions
  setActiveTab: (tab: TabKey) => void;
  login: () => Promise<boolean>;
  submitOnboarding: (data: api.CreatePlanBody) => Promise<{ ok: boolean; warnings?: string[] }>;
  refreshPlan: () => Promise<void>;
  setPlan: (plan: PlanRecord | null) => void;
  completeOnboarding: () => void;
  logout: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppStateProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────

export default function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tier, setTier] = useState('free');
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const loginAttempted = useRef(false);

  // ── Login (guest auth) ────────────────────────────────────────
  const login = useCallback(async (): Promise<boolean> => {
    if (loginAttempted.current && token) return true;
    loginAttempted.current = true;

    const res = await api.authGuest();
    if (res.ok) {
      setTokenState(res.data.token);
      setUserId(res.data.userId);
      setTier(res.data.tier);
      api.setToken(res.data.token);
      setIsUsingMockData(false);

      // Try to load existing plan
      const planRes = await api.getCurrentPlan();
      if (planRes.ok) {
        setPlan(planRes.data.plan);
        setShowOnboarding(false);
      }
      setPlanLoaded(true);
      return true;
    }

    // API unreachable → mock mode
    setIsUsingMockData(true);
    setPlanLoaded(true);
    return false;
  }, [token]);

  // ── Refresh plan ──────────────────────────────────────────────
  const refreshPlan = useCallback(async () => {
    const res = await api.getCurrentPlan();
    if (res.ok) {
      setPlan(res.data.plan);
    }
  }, []);

  // ── Submit onboarding ─────────────────────────────────────────
  const submitOnboarding = useCallback(
    async (data: api.CreatePlanBody) => {
      // If no token, try login first
      if (!token) {
        await login();
      }

      const res = await api.createPlan(data);
      if (res.ok) {
        setPlan(res.data.plan);
        setShowOnboarding(false);
        return { ok: true, warnings: res.data.warnings };
      }

      // If API failed, use mock plan in demo mode
      setIsUsingMockData(true);
      const mockPlan = buildMockPlan(data);
      setPlan(mockPlan);
      setShowOnboarding(false);
      return { ok: true, warnings: ['当前使用本地演示数据'] };
    },
    [token, login],
  );

  // ── Complete onboarding (skip) ────────────────────────────────
  const completeOnboarding = useCallback(() => {
    if (!plan) {
      setIsUsingMockData(true);
      setPlan(buildMockPlan(null));
    }
    setShowOnboarding(false);
  }, [plan]);

  // ── Logout / reset ────────────────────────────────────────────
  const logout = useCallback(() => {
    setTokenState(null);
    setUserId(null);
    setTier('free');
    setPlan(null);
    setPlanLoaded(false);
    setShowOnboarding(true);
    setIsUsingMockData(false);
    api.setToken(null);
    loginAttempted.current = false;
  }, []);

  const value: AppState = {
    token,
    userId,
    tier,
    isAuthenticated: !!token,
    plan,
    planLoaded,
    activeTab,
    showOnboarding,
    isUsingMockData,
    setActiveTab,
    login,
    submitOnboarding,
    refreshPlan,
    setPlan,
    completeOnboarding,
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ── Mock plan builder ─────────────────────────────────────────────

function buildMockPlan(data: api.CreatePlanBody | null): PlanRecord {
  const weight = data?.currentWeightKg ?? 72;
  const target = data?.targetWeightKg ?? 65;
  const height = data?.heightCm ?? 170;
  const age = data?.age ?? 28;
  const sex = data?.sex ?? 'male';
  const bmr = sex === 'male'
    ? Math.round(10 * weight + 6.25 * height - 5 * age + 5)
    : Math.round(10 * weight + 6.25 * height - 5 * age - 161);
  const tdee = Math.round(bmr * (data?.activityMultiplier ?? 1.4));
  const deficit = 500;
  const intake = tdee - deficit;

  return {
    id: 'mock-plan',
    currentWeightKg: weight,
    targetWeightKg: target,
    targetDate: null,
    weeklyLossKg: 0.5,
    heightCm: height,
    age,
    sex,
    activityLevel: data?.activityMultiplier ?? 1.4,
    bmrKcal: bmr,
    tdeeKcal: tdee,
    dailyDeficitTargetKcal: deficit,
    recommendedIntakeKcal: intake,
    proteinMinG: Math.round(weight * 1.2),
    proteinMaxG: Math.round(weight * 1.6),
    carbMinG: Math.round(intake * 0.4 / 4),
    carbMaxG: Math.round(intake * 0.5 / 4),
    fatMinG: Math.round(intake * 0.2 / 9),
    fatMaxG: Math.round(intake * 0.3 / 9),
  };
}
