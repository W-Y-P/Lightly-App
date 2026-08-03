import Taro from '@tarojs/taro'

export const RECORD_INTENT_STORAGE_KEY = 'pendingRecordAction'

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'other' | 'drink'

export type RecordIntent =
  | { type: 'calendar'; date: string }
  | { type: 'meal'; date: string; slot: MealSlot; mode?: 'photo'; usePoint?: boolean }
  | { type: 'exercise'; date: string }
  | { type: 'weight'; date: string }

export type RecordIntentInput =
  | { type: 'calendar'; date?: string }
  | { type: 'meal'; date?: string; slot: MealSlot; mode?: 'photo'; usePoint?: boolean }
  | { type: 'exercise'; date?: string }
  | { type: 'weight'; date?: string }

export function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function openRecord(intent: RecordIntentInput): void {
  Taro.setStorageSync(RECORD_INTENT_STORAGE_KEY, {
    ...intent,
    date: intent.date || localDateString(),
  })
  void Taro.switchTab({ url: '/pages/record/index' })
}

export function takeRecordIntent(): RecordIntent | null {
  let stored: unknown
  try {
    stored = Taro.getStorageSync(RECORD_INTENT_STORAGE_KEY)
    Taro.removeStorageSync(RECORD_INTENT_STORAGE_KEY)
    if (typeof stored === 'string') stored = JSON.parse(stored)
  } catch {
    Taro.removeStorageSync(RECORD_INTENT_STORAGE_KEY)
    return null
  }

  if (!stored || typeof stored !== 'object') return null
  const value = stored as Partial<RecordIntent> & { slot?: string; mode?: string }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value.date || '') ? value.date as string : localDateString()
  if (value.type === 'calendar' || value.type === 'exercise' || value.type === 'weight') {
    return { type: value.type, date }
  }
  if (value.type === 'meal' && ['breakfast', 'lunch', 'dinner', 'other', 'drink'].includes(value.slot || '')) {
    return {
      type: 'meal',
      date,
      slot: value.slot as MealSlot,
      ...(value.mode === 'photo' ? { mode: 'photo' as const } : {}),
      ...(value.usePoint === true ? { usePoint: true } : {}),
    }
  }
  return null
}
