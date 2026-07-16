/**
 * Reactive store for Today page data.
 * Components use useTodayData() hook to get live API data.
 */
import { useState, useEffect } from 'react'

interface MealRecord {
  id: string
  name: string
  emoji: string
  calories: number
  recorded: boolean
  status?: 'recorded' | 'skipped' | 'fasting' | 'unrecorded'
  time?: string
  items?: string[]
}

interface NutrientProgress {
  name: string
  current: number
  target: number
  unit: string
  color: string
}

interface TimelineItem {
  id: string
  time: string
  meal: string
  emoji: string
  calories: number
  items: string[]
}

export interface EntitlementInfo {
  pointBalance: number
  freeRemaining: number
  freeUsed: number
  totalToday: number
}

export interface TodayStoreData {
  date: string
  remainingCalories: number
  suggestedRange: { min: number; max: number }
  consumed: number
  baseExpenditure: number
  exerciseCalories: number
  targetGap: number
  targetIntake: number
  meals: MealRecord[]
  exerciseCaloriesTotal: number
  exerciseDuration: number
  exerciseType: string
  consecutiveDays: number
  totalStars: number
  currentWeight: number
  weightUnit: string
  weightTrend: { date: string; weight: number }[]
  nutrients: NutrientProgress[]
  timeline: TimelineItem[]
  tip: string
  advice: string
  /** Whether data has been loaded from API at least once */
  apiLoaded: boolean
  /** Entitlement info from API (null = not loaded) */
  entitlement: EntitlementInfo | null
}

function createEmptyTodayData(): TodayStoreData {
  return {
    date: '',
    remainingCalories: 0,
    suggestedRange: { min: 0, max: 0 },
    consumed: 0,
    baseExpenditure: 0,
    exerciseCalories: 0,
    targetGap: 0,
    targetIntake: 0,
    meals: [
      { id: 'breakfast', name: '早餐', emoji: '', calories: 0, recorded: false },
      { id: 'lunch', name: '午餐', emoji: '', calories: 0, recorded: false },
      { id: 'dinner', name: '晚餐', emoji: '', calories: 0, recorded: false },
      { id: 'snack', name: '其它', emoji: '', calories: 0, recorded: false },
      { id: 'drink', name: '饮品', emoji: '', calories: 0, recorded: false },
    ],
    exerciseCaloriesTotal: 0,
    exerciseDuration: 0,
    exerciseType: '尚未记录',
    consecutiveDays: 0,
    totalStars: 0,
    currentWeight: 0,
    weightUnit: 'kg',
    weightTrend: [],
    nutrients: [
      { name: '碳水化合物', current: 0, target: 0, unit: 'g', color: '#168a5b' },
      { name: '蛋白质', current: 0, target: 0, unit: 'g', color: '#3d83b8' },
      { name: '脂肪', current: 0, target: 0, unit: 'g', color: '#d7921b' },
    ],
    timeline: [],
    tip: '记录饮食和运动后，这里会给出温和的当日提醒。',
    advice: '待完整记录：至少记录两餐后生成今日建议。',
    apiLoaded: false,
    entitlement: null,
  }
}

let _data: TodayStoreData = createEmptyTodayData()
let _listeners: Set<() => void> = new Set()

function notify() {
  _listeners.forEach((fn) => fn())
}

/** Merge partial API data into the store and notify subscribers. */
export function setTodayData(patch: Partial<TodayStoreData>) {
  _data = { ..._data, ...patch }
  notify()
}

/** Reset store to an empty state (used on logout). */
export function resetTodayData() {
  _data = createEmptyTodayData()
  notify()
}

/** React hook: returns current today data, re-renders on update. */
export function useTodayData(): TodayStoreData {
  const [state, setState] = useState(_data)

  useEffect(() => {
    const listener = () => setState({ ..._data })
    _listeners.add(listener)
    // Sync immediately in case data changed between render and effect
    setState({ ..._data })
    return () => {
      _listeners.delete(listener)
    }
  }, [])

  return state
}
