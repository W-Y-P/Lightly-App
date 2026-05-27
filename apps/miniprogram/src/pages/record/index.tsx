import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { generateMockCalendar } from '../../store/mockData'
import type { CalendarDayData } from '../../store/mockData'
import {
  ensureAuthReady,
  getDailySummary,
  createMeal,
  createExercise,
  createWeight,
} from '../../api/client'
import type { DailySummaryResponse, CreateMealBody, CreateExerciseBody } from '../../api/client'
import './index.scss'

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', emoji: '🌅' },
  { key: 'lunch', label: '午餐', emoji: '☀️' },
  { key: 'dinner', label: '晚餐', emoji: '🌙' },
  { key: 'other', label: '其它', emoji: '🍪' },
  { key: 'drink', label: '饮品', emoji: '🥤' },
]

/** 每个餐段的示例菜品，用于快捷记录 */
const MEAL_MOCK_ITEMS: Record<string, { name: string; kcal: number; carbG: number; proteinG: number; fatG: number }> = {
  breakfast: { name: '燕麦鸡蛋餐', kcal: 350, carbG: 45, proteinG: 18, fatG: 10 },
  lunch: { name: '鸡胸肉米饭', kcal: 520, carbG: 65, proteinG: 35, fatG: 12 },
  dinner: { name: '清炒时蔬配粗粮', kcal: 380, carbG: 48, proteinG: 15, fatG: 14 },
  other: { name: '水果坚果', kcal: 160, carbG: 20, proteinG: 4, fatG: 8 },
  drink: { name: '无糖绿茶', kcal: 5, carbG: 1, proteinG: 0, fatG: 0 },
}

/** 运动类型及其 30 分钟预估消耗 kcal */
const EXERCISE_TYPES: { type: string; kcal30min: number }[] = [
  { type: '快走', kcal30min: 150 },
  { type: '慢跑', kcal30min: 250 },
  { type: '游泳', kcal30min: 280 },
  { type: '骑行', kcal30min: 200 },
  { type: '跳绳', kcal30min: 300 },
  { type: '瑜伽', kcal30min: 120 },
  { type: '力量训练', kcal30min: 180 },
  { type: 'HIIT', kcal30min: 350 },
  { type: '舞蹈', kcal30min: 180 },
  { type: '椭圆机', kcal30min: 200 },
  { type: '爬楼梯', kcal30min: 250 },
  { type: '其它', kcal30min: 150 },
]

const DAYS_COUNT = 15

/**
 * 扩展日历数据：附加目标缺口和达成率
 * - targetDeficitKcal: plan 中的目标缺口 kcal（如 500），来自 summary.plan.targetDeficitKcal
 * - achievementRate: 达成倍率（如 0.8 表示 80%），来自 summary.summary.achievementRate
 */
interface ExtendedDayData extends CalendarDayData {
  targetDeficitKcal: number | null
  achievementRate: number | null
}

/** 仅初始化一次的 mock fallback，保证每条数据稳定 */
const FALLBACK_CALENDAR: CalendarDayData[] = generateMockCalendar()

function weekdayShort(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

function fmtDay(dateStr: string) {
  const parts = dateStr.split('-')
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`
}

/** 生成最近 N 天的日期字符串数组（从 oldest 到 today） */
function recentDates(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return result
}

/** 将 mock CalendarDayData 扩展为 ExtendedDayData（无云数据时用） */
function mockToExtended(mock: CalendarDayData): ExtendedDayData {
  return {
    ...mock,
    targetDeficitKcal: null,
    achievementRate: null,
  }
}

/** 将 API summary 转为 ExtendedDayData */
function summaryToDayData(
  date: string,
  summary: DailySummaryResponse,
): ExtendedDayData {
  const intake = summary.intake?.totalKcal ?? 0
  const exercise = summary.exercise?.totalKcal ?? 0
  const deficit = summary.summary?.actualDeficitKcal ?? 0
  // achievementRate 是 0.x 倍率，>= 0.8 算达成
  const rate = summary.summary?.achievementRate ?? null
  const achieved = rate != null ? rate >= 0.8 : false
  const star = summary.star?.awarded ?? false
  const targetDeficitKcal = summary.plan?.targetDeficitKcal ?? null

  return {
    date,
    intake,
    exercise,
    deficit,
    achieved,
    star,
    weight: null, // summary 不含 weight，需单独拉取
    targetDeficitKcal,
    achievementRate: rate,
  }
}

/** 数值安全显示：null/undefined → '--'，0 正常显示 0 */
function displayVal(val: number | null | undefined, suffix?: string): string {
  if (val == null) return '--'
  return suffix ? `${val}${suffix}` : `${val}`
}

export default function RecordPage() {
  const [calendarData, setCalendarData] = useState<ExtendedDayData[]>(() =>
    FALLBACK_CALENDAR.map(mockToExtended),
  )
  const [selectedIdx, setSelectedIdx] = useState(DAYS_COUNT - 1) // today is last
  const [loading, setLoading] = useState(true)

  const selected = calendarData[selectedIdx]

  /** 刷新单日摘要 */
  const refreshDay = useCallback(async (date: string, idx: number) => {
    const res = await getDailySummary(date)
    if (res.ok && res.data) {
      const mapped = summaryToDayData(date, res.data)
      setCalendarData((prev) => {
        const next = [...prev]
        // 保留旧 weight（summary 不含 weight）
        mapped.weight = next[idx]?.weight ?? null
        next[idx] = mapped
        return next
      })
    }
  }, [])

  /** 初始加载：auth → 拉 15 天 summary */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const dates = recentDates(DAYS_COUNT)
      const authOk = await ensureAuthReady()
      if (cancelled) return

      if (!authOk) {
        setLoading(false)
        return
      }

      // 并行拉取 15 天
      const results = await Promise.allSettled(dates.map((d) => getDailySummary(d)))
      if (cancelled) return

      const updated: ExtendedDayData[] = dates.map((date, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value.ok && r.value.data) {
          return summaryToDayData(date, r.value.data)
        }
        // 失败日使用稳定的 fallback（同一次初始化、同一下标）
        return mockToExtended(FALLBACK_CALENDAR[i])
      })

      setCalendarData(updated)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── 快捷记录 handlers ──

  const handleRecordMeal = async (slotKey: string, _slotLabel: string) => {
    if (!selected) return
    const mockItem = MEAL_MOCK_ITEMS[slotKey]
    if (!mockItem) return
    const body: CreateMealBody = {
      date: selected.date,
      mealSlot: slotKey as CreateMealBody['mealSlot'],
      status: 'recorded',
      items: [
        {
          foodName: mockItem.name,
          quantityG: 200,
          kcal: mockItem.kcal,
          carbG: mockItem.carbG,
          proteinG: mockItem.proteinG,
          fatG: mockItem.fatG,
        },
      ],
    }
    const res = await createMeal(body)
    if (res.ok) {
      Taro.showToast({ title: '已记录', icon: 'success', duration: 1500 })
      refreshDay(selected.date, selectedIdx)
    } else {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    }
  }

  const handleRecordExercise = async (exerciseType: string) => {
    if (!selected) return
    const body: CreateExerciseBody = {
      date: selected.date,
      exerciseType,
      durationMin: 30,
      weightKg: selected.weight ?? 72.6,
    }
    const res = await createExercise(body)
    if (res.ok) {
      Taro.showToast({ title: '已记录', icon: 'success', duration: 1500 })
      refreshDay(selected.date, selectedIdx)
    } else {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    }
  }

  const handleRecordWeight = async () => {
    if (!selected) return
    const weightVal = selected.weight ?? 72.6
    const res = await createWeight({
      date: selected.date,
      weightKg: weightVal,
      weighingContext: '早晨称重',
    })
    if (res.ok) {
      setCalendarData((prev) => {
        const next = [...prev]
        next[selectedIdx] = { ...next[selectedIdx], weight: weightVal }
        return next
      })
      Taro.showToast({ title: '已记录体重', icon: 'success', duration: 1500 })
      refreshDay(selected.date, selectedIdx)
    } else {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    }
  }

  // 达成率百分比文本（rate 是 0.x 倍率）
  const ratePercent = (rate: number | null): string | null => {
    if (rate == null) return null
    return `${Math.round(rate * 100)}%`
  }

  return (
    <View className='record-page'>
      <View className='record-scroll'>
        {/* Calendar strip */}
        <View className='record-calendar'>
          {loading && (
            <View className='record-loading-bar'>
              <Text className='record-loading-text'>同步数据中…</Text>
            </View>
          )}
          <ScrollView className='record-calendar-scroll' scrollX enhanced showScrollbar={false}>
            <View className='record-calendar-row'>
              {calendarData.map((day, idx) => (
                <View
                  key={day.date}
                  className={`record-day ${idx === selectedIdx ? 'record-day--active' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <Text className='record-day-week'>{weekdayShort(day.date)}</Text>
                  <Text className='record-day-date'>{fmtDay(day.date)}</Text>
                  {day.star && <Text className='record-day-star'>⭐</Text>}
                  {day.achieved && !day.star && <View className='record-day-dot' />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {selected && (
          <>
            {/* Day Summary */}
            <View className='record-summary'>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>{displayVal(selected.intake)}</Text>
                <Text className='record-summary-label'>摄入 kcal</Text>
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>{displayVal(selected.exercise)}</Text>
                <Text className='record-summary-label'>运动 kcal</Text>
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value record-summary-value--deficit'>
                  {displayVal(selected.deficit)}
                </Text>
                <Text className='record-summary-label'>
                  {selected.targetDeficitKcal != null
                    ? `缺口 ${selected.deficit} / ${selected.targetDeficitKcal} kcal`
                    : '缺口 kcal'}
                </Text>
                {ratePercent(selected.achievementRate) != null && (
                  <Text className='record-achievement-rate'>
                    达成 {ratePercent(selected.achievementRate)}
                  </Text>
                )}
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>
                  {selected.weight != null ? selected.weight.toFixed(1) : '--'}
                </Text>
                <Text className='record-summary-label'>体重 kg</Text>
              </View>
            </View>

            {/* 缺口详情卡片 */}
            {selected.targetDeficitKcal != null && (
              <View className='record-gap-card'>
                <Text className='record-gap-title'>📊 今日能量缺口</Text>
                <View className='record-gap-row'>
                  <View className='record-gap-col'>
                    <Text className='record-gap-kcal'>{displayVal(selected.deficit)}</Text>
                    <Text className='record-gap-sublabel'>实际缺口 kcal</Text>
                  </View>
                  <Text className='record-gap-divider'>/</Text>
                  <View className='record-gap-col'>
                    <Text className='record-gap-kcal'>{selected.targetDeficitKcal}</Text>
                    <Text className='record-gap-sublabel'>目标缺口 kcal</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Meal record buttons */}
            <View className='record-section'>
              <Text className='record-section-title'>📝 餐饮记录</Text>
              <View className='record-meal-grid'>
                {MEAL_SLOTS.map((slot) => (
                  <View
                    key={slot.key}
                    className='record-meal-btn'
                    onClick={() => handleRecordMeal(slot.key, slot.label)}
                  >
                    <Text className='record-meal-emoji'>{slot.emoji}</Text>
                    <Text className='record-meal-label'>{slot.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Exercise record */}
            <View className='record-section'>
              <Text className='record-section-title'>🏃 运动记录</Text>
              <View className='record-exercise-grid'>
                {EXERCISE_TYPES.map((ex) => (
                  <View
                    key={ex.type}
                    className='record-exercise-btn'
                    onClick={() => handleRecordExercise(ex.type)}
                  >
                    <Text className='record-exercise-label'>{ex.type}</Text>
                    <Text className='record-exercise-kcal'>~{ex.kcal30min}kcal</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Weight record */}
            <View className='record-section'>
              <Text className='record-section-title'>⚖️ 体重打卡</Text>
              <View className='record-weight-card'>
                <View className='record-weight-info'>
                  <Text className='record-weight-value'>
                    {selected.weight != null ? `${selected.weight.toFixed(1)} kg` : '-- kg'}
                  </Text>
                  <Text className='record-weight-context'>早晨 / 上午称重</Text>
                </View>
                <View className='record-weight-btn' onClick={handleRecordWeight}>
                  <Text className='record-weight-btn-text'>记录体重</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <View className='record-bottom-spacer' />
      </View>
    </View>
  )
}
