/**
 * Reactive store for Today page data.
 * Components use useTodayData() hook to get live data (API or mock fallback).
 */
import { useState, useEffect } from 'react'
import { mockTodayData } from './mockData'
import type { MealRecord, NutrientProgress, TimelineItem } from './mockData'

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

let _data: TodayStoreData = {
  ...mockTodayData,
  apiLoaded: false,
  entitlement: null,
}
let _listeners: Set<() => void> = new Set()

function notify() {
  _listeners.forEach((fn) => fn())
}

/** Merge partial API data into the store and notify subscribers. */
export function setTodayData(patch: Partial<TodayStoreData>) {
  _data = { ..._data, ...patch }
  notify()
}

/** Reset store to mock defaults (used on logout). */
export function resetTodayData() {
  _data = { ...mockTodayData, apiLoaded: false, entitlement: null }
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
