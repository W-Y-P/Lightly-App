import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Input, Textarea, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { generateMockCalendar } from '../../store/mockData'
import type { CalendarDayData } from '../../store/mockData'
import {
  ensureAuthReady,
  getDailySummary,
  createMeal,
  createExercise,
  createWeight,
  aiTextEstimate,
  aiPhotoEstimate,
} from '../../api/client'
import type { DailySummaryResponse, CreateMealBody, CreateExerciseBody, MealItemInput } from '../../api/client'
import './index.scss'

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', emoji: '🌅' },
  { key: 'lunch', label: '午餐', emoji: '☀️' },
  { key: 'dinner', label: '晚餐', emoji: '🌙' },
  { key: 'other', label: '其它', emoji: '🍪' },
  { key: 'drink', label: '饮品', emoji: '🥤' },
]

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

interface ExtendedDayData extends CalendarDayData {
  targetDeficitKcal: number | null
  achievementRate: number | null
}

/** 餐食弹窗行 */
interface MealRow {
  foodName: string
  quantityG: string
  kcal: string
  carbG: string
  proteinG: string
  fatG: string
}

/** 运动弹窗行 */
interface ExerciseRow {
  exerciseType: string
  durationMin: string
  confirmedKcal: string
}

function makeEmptyRow(): MealRow {
  return { foodName: '', quantityG: '', kcal: '', carbG: '', proteinG: '', fatG: '' }
}

/** 仅初始化一次的 mock fallback，保证每条数据稳定 */
const FALLBACK_CALENDAR: CalendarDayData[] = generateMockCalendar(DAYS_COUNT)

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

function todayDateString(): string {
  return recentDates(1)[0]
}

function mockToExtended(mock: CalendarDayData): ExtendedDayData {
  return {
    ...mock,
    targetDeficitKcal: null,
    achievementRate: null,
  }
}

function summaryToDayData(
  date: string,
  summary: DailySummaryResponse,
): ExtendedDayData {
  const intake = summary.intake?.totalKcal ?? 0
  const exercise = summary.exercise?.totalKcal ?? 0
  const deficit = summary.summary?.actualDeficitKcal ?? 0
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
    weight: null,
    targetDeficitKcal,
    achievementRate: rate,
  }
}

function displayVal(val: number | null | undefined, suffix?: string): string {
  if (val == null) return '--'
  return suffix ? `${val}${suffix}` : `${val}`
}

/** MealItemInput → MealRow */
function itemToRow(item: MealItemInput): MealRow {
  return {
    foodName: item.foodName,
    quantityG: String(item.quantityG ?? ''),
    kcal: String(item.kcal ?? ''),
    carbG: String(item.carbG ?? ''),
    proteinG: String(item.proteinG ?? ''),
    fatG: String(item.fatG ?? ''),
  }
}

export default function RecordPage() {
  const [calendarData, setCalendarData] = useState<ExtendedDayData[]>(() =>
    FALLBACK_CALENDAR.map(mockToExtended),
  )
  const [selectedIdx, setSelectedIdx] = useState(DAYS_COUNT - 1)
  const [loading, setLoading] = useState(true)

  // ── 餐食弹窗状态 ──
  const [mealModalOpen, setMealModalOpen] = useState(false)
  const [activeMealSlot, setActiveMealSlot] = useState<string>('')
  const [mealRows, setMealRows] = useState<MealRow[]>([makeEmptyRow()])
  const [mealText, setMealText] = useState('')
  const [mealLoading, setMealLoading] = useState(false)

  // ── 运动弹窗状态 ──
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false)
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>([])
  const [exerciseSubmitting, setExerciseSubmitting] = useState(false)

  // ── 体重弹窗状态 ──
  const [weightModalOpen, setWeightModalOpen] = useState(false)
  const [weightValue, setWeightValue] = useState('')
  const [weighingContext, setWeighingContext] = useState<'morning' | 'evening'>('morning')
  const [weightSubmitting, setWeightSubmitting] = useState(false)

  const selected = calendarData[selectedIdx]

  const getTargetDay = () => {
    const fallbackDate = todayDateString()
    const fallbackIdx = calendarData.findIndex((day) => day.date === fallbackDate)
    return {
      date: selected?.date ?? fallbackDate,
      idx: selected ? selectedIdx : (fallbackIdx >= 0 ? fallbackIdx : Math.max(0, calendarData.length - 1)),
      weight: selected?.weight ?? null,
    }
  }

  const refreshDay = useCallback(async (date: string, idx: number) => {
    const res = await getDailySummary(date)
    if (res.ok && res.data) {
      const mapped = summaryToDayData(date, res.data)
      setCalendarData((prev) => {
        const next = [...prev]
        mapped.weight = next[idx]?.weight ?? null
        next[idx] = mapped
        return next
      })
    }
  }, [])

  // ── useDidShow: 读取 pendingRecordAction ──
  useDidShow(() => {
    Taro.getStorage({ key: 'pendingRecordAction' })
      .then((res) => {
        const action = typeof res.data === 'string'
          ? JSON.parse(res.data) as { type: string; slot?: string; mode?: string }
          : res.data as { type: string; slot?: string; mode?: string }
        Taro.removeStorage({ key: 'pendingRecordAction' })
        if (action.type === 'meal' && action.slot) {
          const slotObj = MEAL_SLOTS.find((s) => s.key === action.slot)
          if (slotObj) {
            openMealModal(slotObj.key)
            if (action.mode === 'photo') {
              Taro.nextTick(() => {
                handleMealPhoto()
              })
            }
          }
        } else if (action.type === 'exercise') {
          openExerciseModal(EXERCISE_TYPES[0].type)
        } else if (action.type === 'weight') {
          openWeightModal()
        }
      })
      .catch(() => {})
  })

  /** 初始加载 */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const dates = recentDates(DAYS_COUNT)
      const authOk = await ensureAuthReady()
      if (cancelled) return
      if (!authOk) { setLoading(false); return }
      const results = await Promise.allSettled(dates.map((d) => getDailySummary(d)))
      if (cancelled) return
      const updated: ExtendedDayData[] = dates.map((date, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value.ok && r.value.data) {
          return summaryToDayData(date, r.value.data)
        }
        return mockToExtended(FALLBACK_CALENDAR[i])
      })
      setCalendarData(updated)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── 打开/关闭餐食弹窗 ──
  const openMealModal = (slotKey: string) => {
    setActiveMealSlot(slotKey)
    setMealRows([makeEmptyRow()])
    setMealText('')
    setMealLoading(false)
    setMealModalOpen(true)
  }

  const closeMealModal = () => {
    setMealModalOpen(false)
    setActiveMealSlot('')
    setMealRows([makeEmptyRow()])
    setMealText('')
    setMealLoading(false)
  }

  // ── handleRecordMeal 改为打开弹窗 ──
  const handleRecordMeal = (slotKey: string) => {
    openMealModal(slotKey)
  }

  // ── 行操作 ──
  const updateMealRow = (idx: number, field: keyof MealRow, value: string) => {
    setMealRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const addMealRow = () => {
    setMealRows((prev) => [...prev, makeEmptyRow()])
  }

  const deleteMealRow = (idx: number) => {
    setMealRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }

  // ── AI 文字解析 ──
  const handleMealTextParse = async () => {
    const text = mealText.trim()
    if (!text) return
    setMealLoading(true)
    try {
      const res = await aiTextEstimate(text)
      if (res.ok && res.data) {
        const newRows: MealRow[] = []
        if (res.data.items && res.data.items.length > 0) {
          newRows.push(...res.data.items.map(itemToRow))
        } else if (res.data.estimate) {
          newRows.push(itemToRow({
            foodName: res.data.estimate.foodName,
            quantityG: 0,
            kcal: res.data.estimate.kcal,
            carbG: res.data.estimate.carbG,
            proteinG: res.data.estimate.proteinG,
            fatG: res.data.estimate.fatG,
          }))
        }
        if (newRows.length > 0) {
          setMealRows((prev) => {
            const last = prev[prev.length - 1]
            const isLastEmpty = !last.foodName && !last.kcal
            if (isLastEmpty) {
              return [...prev.slice(0, -1), ...newRows]
            }
            return [...prev, ...newRows]
          })
        }
        Taro.showToast({ title: '已解析', icon: 'success', duration: 1000 })
      } else {
        Taro.showToast({ title: '解析失败，请重试', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '解析出错', icon: 'none' })
    }
    setMealLoading(false)
  }

  // ── AI 拍照识别 ──
  const handleMealPhoto = async () => {
    setMealLoading(true)
    try {
      const chooseRes = await Taro.chooseImage({ count: 1, sourceType: ['camera', 'album'] })
      const filePath = chooseRes.tempFilePaths[0]
      if (!filePath) { setMealLoading(false); return }

      const base64: string = await new Promise((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath,
          encoding: 'base64',
          success: (r) => resolve(r.data as string),
          fail: (err) => reject(err),
        })
      })

      const tryEstimate = async (usePoint: boolean) => {
        return aiPhotoEstimate(base64, 'image/jpeg', usePoint)
      }

      let res = await tryEstimate(false)

      // 如果失败且可能是配额/积分问题，提示是否用积分重试
      if (!res.ok && res.error && /quota|point|limit|余额|积分|次数/i.test(res.error)) {
        const confirmRes = await Taro.showModal({
          title: '提示',
          content: '免费次数已用完，是否使用积分继续识别？',
          confirmText: '使用积分',
          cancelText: '取消',
        })
        if (confirmRes.confirm) {
          res = await tryEstimate(true)
        } else {
          setMealLoading(false)
          return
        }
      }

      if (res.ok) {
        const newRows: MealRow[] = []
        if (res.data.items && res.data.items.length > 0) {
          newRows.push(...res.data.items.map(itemToRow))
        } else if (res.data.estimate) {
          newRows.push(itemToRow({
            foodName: res.data.estimate.foodName,
            quantityG: 0,
            kcal: res.data.estimate.kcal,
            carbG: res.data.estimate.carbG,
            proteinG: res.data.estimate.proteinG,
            fatG: res.data.estimate.fatG,
          }))
        }
        if (newRows.length > 0) {
          setMealRows((prev) => {
            const last = prev[prev.length - 1]
            const isLastEmpty = !last.foodName && !last.kcal
            if (isLastEmpty) {
              return [...prev.slice(0, -1), ...newRows]
            }
            return [...prev, ...newRows]
          })
        }
        Taro.showToast({ title: '识别成功', icon: 'success', duration: 1000 })
      } else {
        Taro.showToast({ title: '识别失败', icon: 'none' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('cancel') && !msg.includes('取消')) {
        Taro.showToast({ title: '拍照失败', icon: 'none' })
      }
    }
    setMealLoading(false)
  }

  // ── 确认提交 ──
  const handleMealConfirm = async () => {
    if (mealLoading) return
    const target = getTargetDay()
    const cleaned: MealItemInput[] = mealRows
      .filter((r) => r.foodName.trim() !== '')
      .map((r) => ({
        foodName: r.foodName.trim(),
        quantityG: parseFloat(r.quantityG) || 0,
        kcal: parseFloat(r.kcal) || 0,
        carbG: parseFloat(r.carbG) || 0,
        proteinG: parseFloat(r.proteinG) || 0,
        fatG: parseFloat(r.fatG) || 0,
      }))
    if (cleaned.length === 0) {
      Taro.showToast({ title: '请至少添加一项食物', icon: 'none' })
      return
    }

    setMealLoading(true)
    const body: CreateMealBody = {
      date: target.date,
      mealSlot: activeMealSlot as CreateMealBody['mealSlot'],
      status: 'recorded',
      items: cleaned,
    }
    try {
      const res = await createMeal(body)
      if (res.ok) {
        Taro.showToast({ title: '已记录', icon: 'success', duration: 1500 })
        closeMealModal()
        refreshDay(target.date, target.idx)
      } else {
        Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      }
    } catch {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    } finally {
      setMealLoading(false)
    }
  }

  // ── 运动弹窗 ──
  const openExerciseModal = (exerciseType: string) => {
    const def = EXERCISE_TYPES.find((e) => e.type === exerciseType) ?? EXERCISE_TYPES[0]
    const duration = 30
    const kcal = Math.round(def.kcal30min * duration / 30)
    setExerciseRows([{ exerciseType: def.type, durationMin: String(duration), confirmedKcal: String(kcal) }])
    setExerciseSubmitting(false)
    setExerciseModalOpen(true)
  }

  const closeExerciseModal = () => {
    setExerciseModalOpen(false)
    setExerciseRows([])
    setExerciseSubmitting(false)
  }

  const updateExerciseRow = (idx: number, field: keyof ExerciseRow, value: string) => {
    setExerciseRows((prev) => {
      const next = [...prev]
      const row = { ...next[idx], [field]: value }
      if (field === 'durationMin') {
        const def = EXERCISE_TYPES.find((e) => e.type === row.exerciseType) ?? EXERCISE_TYPES[0]
        const dur = parseFloat(value) || 0
        row.confirmedKcal = String(Math.round(def.kcal30min * dur / 30))
      }
      next[idx] = row
      return next
    })
  }

  const updateExerciseRowType = (idx: number, exerciseType: string) => {
    setExerciseRows((prev) => {
      const next = [...prev]
      const def = EXERCISE_TYPES.find((e) => e.type === exerciseType) ?? EXERCISE_TYPES[0]
      const dur = parseFloat(next[idx].durationMin) || 30
      next[idx] = { ...next[idx], exerciseType, confirmedKcal: String(Math.round(def.kcal30min * dur / 30)) }
      return next
    })
  }

  const addExerciseRow = () => {
    const def = EXERCISE_TYPES[0]
    setExerciseRows((prev) => [...prev, { exerciseType: def.type, durationMin: '30', confirmedKcal: String(def.kcal30min) }])
  }

  const deleteExerciseRow = (idx: number) => {
    setExerciseRows((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  const handleExerciseConfirm = async () => {
    if (exerciseSubmitting) return
    const target = getTargetDay()
    const valid = exerciseRows.filter((r) => parseFloat(r.durationMin) > 0)
    if (valid.length === 0) {
      Taro.showToast({ title: '请至少添加一项运动', icon: 'none' })
      return
    }
    setExerciseSubmitting(true)
    let allOk = true
    try {
      for (const row of valid) {
        const body: CreateExerciseBody = {
          date: target.date,
          exerciseType: row.exerciseType,
          durationMin: parseFloat(row.durationMin) || 30,
          weightKg: target.weight ?? 72.6,
          confirmedKcal: parseFloat(row.confirmedKcal) || 0,
        }
        const res = await createExercise(body)
        if (!res.ok) allOk = false
      }
      closeExerciseModal()
      if (allOk) {
        Taro.showToast({ title: '已记录运动', icon: 'success', duration: 1500 })
      } else {
        Taro.showToast({ title: '部分记录失败', icon: 'none' })
      }
      refreshDay(target.date, target.idx)
    } catch {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      setExerciseSubmitting(false)
    }
  }

  const handleRecordExercise = (exerciseType: string) => {
    openExerciseModal(exerciseType)
  }

  // ── 体重弹窗 ──
  const openWeightModal = () => {
    setWeightValue(selected?.weight != null ? String(selected.weight) : '')
    setWeighingContext('morning')
    setWeightSubmitting(false)
    setWeightModalOpen(true)
  }

  const closeWeightModal = () => {
    setWeightModalOpen(false)
    setWeightValue('')
    setWeightSubmitting(false)
  }

  const handleWeightConfirm = async () => {
    if (weightSubmitting) return
    const target = getTargetDay()
    const val = parseFloat(weightValue)
    if (!val || val <= 0) {
      Taro.showToast({ title: '请输入有效体重', icon: 'none' })
      return
    }
    setWeightSubmitting(true)
    const ctx = weighingContext === 'morning' ? '早晨（空腹）' : '晚上（饭后）'
    try {
      const res = await createWeight({ date: target.date, weightKg: val, weighingContext: ctx })
      if (res.ok) {
        setCalendarData((prev) => {
          const next = [...prev]
          if (next[target.idx]) {
            next[target.idx] = { ...next[target.idx], weight: val }
          }
          return next
        })
        Taro.showToast({ title: '已记录体重', icon: 'success', duration: 1500 })
        closeWeightModal()
        refreshDay(target.date, target.idx)
      } else {
        Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
        setWeightSubmitting(false)
      }
    } catch {
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      setWeightSubmitting(false)
    }
  }

  const handleRecordWeight = () => {
    openWeightModal()
  }

  const ratePercent = (rate: number | null): string | null => {
    if (rate == null) return null
    return `${Math.round(rate * 100)}%`
  }

  const slotLabel = MEAL_SLOTS.find((s) => s.key === activeMealSlot)?.label ?? ''

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
                    onClick={() => handleRecordMeal(slot.key)}
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

      {/* ── 餐食弹窗 ── */}
      {mealModalOpen && (
        <View className='meal-modal-mask' onClick={closeMealModal}>
          <View className='meal-modal' onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>记录{slotLabel}</Text>
              <View className='meal-modal-close' onClick={closeMealModal}>
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            {/* 食物表格 */}
            <ScrollView className='meal-modal-body' scrollY>
              <View className='meal-table'>
                <View className='meal-table-header'>
                  <Text className='meal-th meal-th-food'>食物</Text>
                  <Text className='meal-th meal-th-num'>克数</Text>
                  <Text className='meal-th meal-th-num'>热量</Text>
                  <Text className='meal-th meal-th-del'></Text>
                </View>
                {mealRows.map((row, idx) => (
                  <View className='meal-table-row' key={idx}>
                    <View className='meal-td meal-td-food'>
                      <Input
                        className='meal-input'
                        value={row.foodName}
                        placeholder='食物名称'
                        onInput={(e) => updateMealRow(idx, 'foodName', e.detail.value)}
                      />
                    </View>
                    <View className='meal-td meal-td-num'>
                      <Input
                        className='meal-input meal-input-num'
                        type='digit'
                        value={row.quantityG}
                        placeholder='g'
                        onInput={(e) => updateMealRow(idx, 'quantityG', e.detail.value)}
                      />
                    </View>
                    <View className='meal-td meal-td-num'>
                      <Input
                        className='meal-input meal-input-num'
                        type='digit'
                        value={row.kcal}
                        placeholder='kcal'
                        onInput={(e) => updateMealRow(idx, 'kcal', e.detail.value)}
                      />
                    </View>
                    <View className='meal-td meal-td-del'>
                      <View className='meal-del-btn' onClick={() => deleteMealRow(idx)}>
                        <Text className='meal-del-btn-text'>删除</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <View className='meal-add-row' onClick={addMealRow}>
                <Text className='meal-add-row-text'>＋ 新增一行</Text>
              </View>

              {/* 自然语言输入 */}
              <View className='meal-ai-section'>
                <Text className='meal-ai-label'>🗣️ 自然语言描述</Text>
                <Textarea
                  className='meal-textarea'
                  value={mealText}
                  placeholder='例如：一碗米饭，一份番茄炒蛋，一杯豆浆'
                  onInput={(e) => setMealText(e.detail.value)}
                  autoHeight
                  maxlength={500}
                />
                <View className='meal-ai-row'>
                  <View className='meal-ai-btn' onClick={handleMealTextParse}>
                    <Text className='meal-ai-btn-text'>🔍 AI 解析</Text>
                  </View>
                  <View className='meal-ai-btn meal-ai-btn--photo' onClick={handleMealPhoto}>
                    <Text className='meal-ai-btn-text'>📷 拍照识别</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* 底部按钮 */}
            <View className='meal-modal-footer'>
              <View className='meal-footer-btn meal-footer-btn--cancel' onClick={closeMealModal}>
                <Text className='meal-footer-btn-text'>取消</Text>
              </View>
              <View className='meal-footer-btn meal-footer-btn--confirm' onClick={handleMealConfirm}>
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {mealLoading ? '提交中...' : '确认记录'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 运动弹窗 ── */}
      {exerciseModalOpen && (
        <View className='meal-modal-mask' onClick={closeExerciseModal}>
          <View className='meal-modal exercise-modal' onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>记录运动</Text>
              <View className='meal-modal-close' onClick={closeExerciseModal}>
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            <ScrollView className='meal-modal-body exercise-modal-body' scrollY>
              <View className='exercise-table-header'>
                <Text className='exercise-th exercise-th-type'>运动类型</Text>
                <Text className='exercise-th exercise-th-num'>分钟</Text>
                <Text className='exercise-th exercise-th-num'>热量</Text>
                <Text className='exercise-th exercise-th-del'></Text>
              </View>

              {exerciseRows.map((row, idx) => (
                <View className='exercise-table-row' key={`${row.exerciseType}-${idx}`}>
                  <View className='exercise-type-cell'>
                    <Picker
                      mode='selector'
                      range={EXERCISE_TYPES.map((ex) => ex.type)}
                      value={Math.max(0, EXERCISE_TYPES.findIndex((ex) => ex.type === row.exerciseType))}
                      onChange={(e) => {
                        const nextType = EXERCISE_TYPES[Number(e.detail.value)]?.type ?? row.exerciseType
                        updateExerciseRowType(idx, nextType)
                      }}
                    >
                      <View className='exercise-picker'>
                        <Text className='exercise-picker-text'>{row.exerciseType}</Text>
                        <Text className='exercise-picker-arrow'>⌄</Text>
                      </View>
                    </Picker>
                  </View>
                  <View className='exercise-num-cell'>
                    <Input
                      className='meal-input meal-input-num'
                      type='digit'
                      value={row.durationMin}
                      placeholder='分钟'
                      onInput={(e) => updateExerciseRow(idx, 'durationMin', e.detail.value)}
                    />
                  </View>
                  <View className='exercise-num-cell'>
                    <Input
                      className='meal-input meal-input-num'
                      type='digit'
                      value={row.confirmedKcal}
                      placeholder='kcal'
                      onInput={(e) => updateExerciseRow(idx, 'confirmedKcal', e.detail.value)}
                    />
                  </View>
                  <View className='exercise-del-cell'>
                    <View className='meal-del-btn' onClick={() => deleteExerciseRow(idx)}>
                      <Text className='meal-del-btn-text'>删除</Text>
                    </View>
                  </View>
                </View>
              ))}

              <View className='meal-add-row' onClick={addExerciseRow}>
                <Text className='meal-add-row-text'>＋ 新增运动</Text>
              </View>
            </ScrollView>

            <View className='meal-modal-footer'>
              <View className='meal-footer-btn meal-footer-btn--cancel' onClick={closeExerciseModal}>
                <Text className='meal-footer-btn-text'>取消</Text>
              </View>
              <View className='meal-footer-btn meal-footer-btn--confirm' onClick={handleExerciseConfirm}>
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {exerciseSubmitting ? '提交中...' : '确认记录'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── 体重弹窗 ── */}
      {weightModalOpen && (
        <View className='meal-modal-mask' onClick={closeWeightModal}>
          <View className='meal-modal weight-modal' onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>体重打卡</Text>
              <View className='meal-modal-close' onClick={closeWeightModal}>
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            <View className='weight-modal-body'>
              <Text className='weight-modal-label'>称重时间</Text>
              <View className='weight-context-row'>
                <View
                  className={`weight-context-option ${weighingContext === 'morning' ? 'weight-context-option--active' : ''}`}
                  onClick={() => setWeighingContext('morning')}
                >
                  <Text className={`weight-context-text ${weighingContext === 'morning' ? 'weight-context-text--active' : ''}`}>
                    早（空腹）
                  </Text>
                </View>
                <View
                  className={`weight-context-option ${weighingContext === 'evening' ? 'weight-context-option--active' : ''}`}
                  onClick={() => setWeighingContext('evening')}
                >
                  <Text className={`weight-context-text ${weighingContext === 'evening' ? 'weight-context-text--active' : ''}`}>
                    晚（饭后）
                  </Text>
                </View>
              </View>

              <Text className='weight-modal-label'>体重</Text>
              <View className='weight-input-row'>
                <Input
                  className='weight-input'
                  type='digit'
                  value={weightValue}
                  placeholder='请输入体重'
                  onInput={(e) => setWeightValue(e.detail.value)}
                />
                <Text className='weight-input-unit'>kg</Text>
              </View>
            </View>

            <View className='meal-modal-footer'>
              <View className='meal-footer-btn meal-footer-btn--cancel' onClick={closeWeightModal}>
                <Text className='meal-footer-btn-text'>取消</Text>
              </View>
              <View className='meal-footer-btn meal-footer-btn--confirm' onClick={handleWeightConfirm}>
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {weightSubmitting ? '提交中...' : '确认记录'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
