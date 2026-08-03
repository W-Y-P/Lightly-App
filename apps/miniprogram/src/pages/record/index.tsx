import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, Input, Textarea, Picker, Button } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  ensureAuthReady,
  getCurrentPlan,
  getDailySummary,
  createMeal,
  createExercise,
  createWeight,
  updateMeal,
  deleteMeal,
  updateExercise,
  deleteExercise,
  updateWeight,
  deleteWeight,
  getExercises,
  getMeals,
  getWeights,
  aiTextEstimate,
  aiPhotoEstimate,
} from '../../api/client'
import type {
  CreateExerciseBody,
  CreateMealBody,
  DailySummaryResponse,
  ExerciseEntry,
  MealEntry,
  MealItemInput,
  WeightEntry,
} from '../../api/client'
import { RecordIntent, localDateString, takeRecordIntent } from '../../utils/recordIntent'
import './index.scss'

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', short: '早' },
  { key: 'lunch', label: '午餐', short: '午' },
  { key: 'dinner', label: '晚餐', short: '晚' },
  { key: 'other', label: '其它', short: '其' },
  { key: 'drink', label: '饮品', short: '饮' },
]

function setTabBarVisible(visible: boolean) {
  const action = visible ? Taro.showTabBar : Taro.hideTabBar
  void action({ animation: false }).catch(() => {})
}

/** 运动类型与默认 MET，用当前体重和时长动态估算消耗。 */
const EXERCISE_TYPES: { type: string; met: number }[] = [
  { type: '快走', met: 4.3 },
  { type: '慢跑', met: 7 },
  { type: '游泳', met: 6 },
  { type: '骑行', met: 6.8 },
  { type: '跳绳', met: 11.8 },
  { type: '瑜伽', met: 2.5 },
  { type: '力量训练', met: 5 },
  { type: 'HIIT', met: 8 },
  { type: '舞蹈', met: 5 },
  { type: '椭圆机', met: 5 },
  { type: '爬楼梯', met: 8.8 },
  { type: '其它', met: 4 },
]

const FOOD_NUTRITION_PER_100G: Record<string, { kcal: number; carbG: number; proteinG: number; fatG: number }> = {
  米饭: { kcal: 116, carbG: 25.9, proteinG: 2.6, fatG: 0.3 },
  燕麦: { kcal: 379, carbG: 67.7, proteinG: 13.2, fatG: 6.5 },
  鸡胸肉: { kcal: 133, carbG: 0, proteinG: 24.6, fatG: 3.3 },
  鸡蛋: { kcal: 144, carbG: 2.8, proteinG: 13.3, fatG: 8.8 },
  牛奶: { kcal: 54, carbG: 3.4, proteinG: 3, fatG: 3.2 },
  西兰花: { kcal: 36, carbG: 4.3, proteinG: 4.1, fatG: 0.6 },
  豆腐: { kcal: 84, carbG: 3.4, proteinG: 6.6, fatG: 5.3 },
  紫薯: { kcal: 106, carbG: 25.2, proteinG: 1.6, fatG: 0.2 },
  苹果: { kcal: 53, carbG: 13.7, proteinG: 0.4, fatG: 0.2 },
  酸奶: { kcal: 72, carbG: 9.3, proteinG: 2.5, fatG: 2.7 },
}

const DAYS_COUNT = 15

interface CalendarDayData {
  date: string
  intake: number
  exercise: number
  deficit: number
  achieved: boolean
  star: boolean
  weight: number | null
}

interface ExtendedDayData extends CalendarDayData {
  targetDeficitKcal: number | null
  achievementRate: number | null
  recordComplete: boolean
}

interface DayDetails {
  meals: MealEntry[]
  exercises: ExerciseEntry[]
  weights: WeightEntry[]
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
  kcalManuallyEdited: boolean
  clientRequestId: string
}

type DetailKind = 'meal' | 'exercise' | 'weight'

const EMPTY_DETAILS: DayDetails = { meals: [], exercises: [], weights: [] }
const MAX_PHOTO_BYTES = 1024 * 1024
const SUPPORTED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const EXERCISE_TIMEOUT_MS = 15000

function makeEmptyRow(): MealRow {
  return { foodName: '', quantityG: '', kcal: '', carbG: '', proteinG: '', fatG: '' }
}

function makeClientRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function estimateExerciseKcal(exerciseType: string, weightKg: number | null, durationMin: number): number | null {
  if (!(weightKg && weightKg > 0) || !(durationMin > 0)) return null
  const exercise = EXERCISE_TYPES.find((item) => item.type === exerciseType) ?? EXERCISE_TYPES[0]
  return Math.round((exercise.met * 3.5 * weightKg * durationMin) / 200)
}

function makeExerciseRow(
  exerciseType: string,
  weightKg: number | null,
  durationMin = 30,
  confirmedKcal?: number,
  kcalManuallyEdited = false,
): ExerciseRow {
  const def = EXERCISE_TYPES.find((item) => item.type === exerciseType) ?? EXERCISE_TYPES[0]
  const estimatedKcal = estimateExerciseKcal(def.type, weightKg, durationMin)
  return {
    exerciseType: def.type,
    durationMin: String(durationMin),
    confirmedKcal: confirmedKcal != null ? String(confirmedKcal) : estimatedKcal != null ? String(estimatedKcal) : '',
    kcalManuallyEdited,
    clientRequestId: makeClientRequestId('exercise'),
  }
}

function inferImageMimeType(filePath: string, fileType?: string): string {
  const normalizedType = fileType?.toLowerCase()
  if (normalizedType?.startsWith('image/')) return normalizedType
  const cleanPath = filePath.split('?')[0].toLowerCase()
  if (/\.png$/.test(cleanPath)) return 'image/png'
  if (/\.webp$/.test(cleanPath)) return 'image/webp'
  if (/\.gif$/.test(cleanPath)) return 'image/gif'
  if (/\.(heic|heif)$/.test(cleanPath)) return 'image/heic'
  if (/\.(jpg|jpeg|jfif)$/.test(cleanPath)) return 'image/jpeg'
  return normalizedType === 'image' ? 'image/jpeg' : 'image/jpeg'
}

function readFileAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (result) => resolve(result.data as string),
      fail: reject,
    })
  })
}

function requirePlatformPrivacyAuthorization(): Promise<void> {
  const wechat = typeof wx !== 'undefined' ? wx as any : null
  if (!wechat || typeof wechat.requirePrivacyAuthorize !== 'function') return Promise.resolve()
  return new Promise((resolve, reject) => {
    wechat.requirePrivacyAuthorize({ success: resolve, fail: reject })
  })
}

async function chooseOneImage(): Promise<{ tempFilePath: string; fileType?: string }> {
  if (Taro.canIUse('chooseMedia')) {
    const result = await Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
    })
    return result.tempFiles[0]
  }
  const legacy = await Taro.chooseImage({ count: 1, sourceType: ['camera', 'album'], sizeType: ['compressed'] })
  const first = legacy.tempFiles?.[0]
  return { tempFilePath: first?.path || legacy.tempFilePaths[0], fileType: 'image' }
}

function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor(value.length * 3 / 4) - padding
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('request_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 仅用于生成日期骨架，绝不把随机示例数据展示为用户数据。 */
const FALLBACK_CALENDAR: CalendarDayData[] = recentDates(DAYS_COUNT).map((date) => ({
  date,
  intake: 0,
  exercise: 0,
  deficit: 0,
  achieved: false,
  star: false,
  weight: null,
}))

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
  return localDateString()
}

function mockToExtended(mock: CalendarDayData): ExtendedDayData {
  return {
    ...mock,
    targetDeficitKcal: null,
    achievementRate: null,
    recordComplete: false,
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
  const recordComplete = summary.star?.isRecordComplete ?? false
  const achieved = recordComplete && rate != null ? rate >= 0.8 : false
  const star = summary.star?.awarded ?? false
  const targetDeficitKcal = summary.plan?.targetDeficitKcal ?? null

  return {
    date,
    intake,
    exercise,
    deficit: recordComplete ? deficit : 0,
    achieved,
    star,
    weight: null,
    targetDeficitKcal,
    achievementRate: recordComplete ? rate : null,
    recordComplete,
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
  const [calendarError, setCalendarError] = useState('')
  const [details, setDetails] = useState<DayDetails>(EMPTY_DETAILS)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsErrors, setDetailsErrors] = useState<string[]>([])
  const [detailActionId, setDetailActionId] = useState('')
  const [currentWeightKg, setCurrentWeightKg] = useState<number | null>(null)

  // ── 餐食弹窗状态 ──
  const [mealModalOpen, setMealModalOpen] = useState(false)
  const [activeMealSlot, setActiveMealSlot] = useState<string>('')
  const [mealRows, setMealRows] = useState<MealRow[]>([makeEmptyRow()])
  const [mealText, setMealText] = useState('')
  const [mealLoading, setMealLoading] = useState(false)
  const [mealRowErrors, setMealRowErrors] = useState<string[]>([])
  const [mealPhotoError, setMealPhotoError] = useState('')
  const [mealSubmitError, setMealSubmitError] = useState('')
  const [editingMealId, setEditingMealId] = useState<string | null>(null)

  // ── 运动弹窗状态 ──
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false)
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>([])
  const [exerciseSubmitting, setExerciseSubmitting] = useState(false)
  const [exerciseError, setExerciseError] = useState('')
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)

  // ── 体重弹窗状态 ──
  const [weightModalOpen, setWeightModalOpen] = useState(false)
  const [weightValue, setWeightValue] = useState('')
  const [weighingContext, setWeighingContext] = useState<'morning' | 'evening'>('morning')
  const [weightSubmitting, setWeightSubmitting] = useState(false)
  const [weightError, setWeightError] = useState('')
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null)
  const [pendingIntent, setPendingIntent] = useState<RecordIntent | null>(null)

  const selected = calendarData[selectedIdx]
  const selectedDateRef = useRef(selected?.date ?? todayDateString())
  const detailsDateRef = useRef('')
  const detailsRequestSeq = useRef(0)
  const calendarRequestSeq = useRef(0)
  const mealClientRequestIdRef = useRef('')
  const mealRequestFingerprintRef = useRef('')
  const weightClientRequestIdRef = useRef('')
  const weightRequestFingerprintRef = useRef('')
  const exerciseInitialRef = useRef('')
  const weightInitialRef = useRef('')
  selectedDateRef.current = selected?.date ?? selectedDateRef.current

  useEffect(() => () => setTabBarVisible(true), [])

  const loadDayDetails = useCallback(async (date: string) => {
    const requestSeq = ++detailsRequestSeq.current
    const hadSameDate = detailsDateRef.current === date
    detailsDateRef.current = date
    setDetailsLoading(true)
    setDetailsErrors([])
    if (!hadSameDate) setDetails(EMPTY_DETAILS)
    try {
      const [mealResult, exerciseResult, weightResult] = await Promise.allSettled([
        getMeals(date),
        getExercises(date),
        getWeights(date, date),
      ])
      if (requestSeq !== detailsRequestSeq.current || selectedDateRef.current !== date) return

      const errors: string[] = []
      const mealRes = mealResult.status === 'fulfilled' ? mealResult.value : null
      const exerciseRes = exerciseResult.status === 'fulfilled' ? exerciseResult.value : null
      const weightRes = weightResult.status === 'fulfilled' ? weightResult.value : null
      if (!mealRes?.ok) errors.push('餐饮明细')
      if (!exerciseRes?.ok) errors.push('运动明细')
      if (!weightRes?.ok) errors.push('体重明细')

      setDetails((previous) => ({
        meals: mealRes?.ok ? mealRes.data.meals : (hadSameDate ? previous.meals : []),
        exercises: exerciseRes?.ok ? exerciseRes.data.exercises : (hadSameDate ? previous.exercises : []),
        weights: weightRes?.ok ? weightRes.data.weights : (hadSameDate ? previous.weights : []),
      }))
      setDetailsErrors(errors)
      if (weightRes?.ok) {
        const latestWeight = weightRes.data.weights[weightRes.data.weights.length - 1]?.weightKg ?? null
        setCalendarData((previous) => previous.map((day) => (
          day.date === date ? { ...day, weight: latestWeight } : day
        )))
      }
    } finally {
      if (requestSeq === detailsRequestSeq.current && selectedDateRef.current === date) {
        setDetailsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!selected?.date) return
    loadDayDetails(selected.date).catch(() => {})
  }, [selected?.date, loadDayDetails])

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
        const actualIdx = next.findIndex((day) => day.date === date)
        const targetIdx = actualIdx >= 0 ? actualIdx : idx
        if (!next[targetIdx]) return prev
        mapped.weight = next[targetIdx].weight ?? null
        next[targetIdx] = mapped
        return next
      })
    }
  }, [])

  const loadCalendar = useCallback(async () => {
    const requestSeq = ++calendarRequestSeq.current
    setLoading(true)
    setCalendarError('')
    const dates = recentDates(DAYS_COUNT)
    const authOk = await ensureAuthReady()
    if (requestSeq !== calendarRequestSeq.current) return
    if (!authOk) {
      setCalendarError('暂时无法连接云端，当前仅显示日期。请检查网络后重试。')
      setLoading(false)
      return
    }
    try {
      const [results, weightsRes, planRes] = await Promise.all([
        Promise.allSettled(dates.map((date) => getDailySummary(date))),
        getWeights(dates[0], dates[dates.length - 1]),
        getCurrentPlan(),
      ])
      if (requestSeq !== calendarRequestSeq.current) return
      if (planRes.ok && planRes.data.plan) setCurrentWeightKg(planRes.data.plan.currentWeightKg)
      const weightByDate = new Map<string, number>()
      if (weightsRes.ok) {
        weightsRes.data.weights.forEach((item) => weightByDate.set(item.date, item.weightKg))
        if ((!planRes.ok || !planRes.data.plan) && weightsRes.data.weights.length > 0) {
          const sortedWeights = [...weightsRes.data.weights].sort((a, b) => a.date.localeCompare(b.date))
          const latestWeight = sortedWeights[sortedWeights.length - 1]
          if (latestWeight) setCurrentWeightKg(latestWeight.weightKg)
        }
      }
      const failedSummaryCount = results.filter((result) => (
        result.status === 'rejected' || !result.value.ok
      )).length
      if (failedSummaryCount > 0 || !weightsRes.ok) {
        setCalendarError('部分记录同步失败，空白数据可能不完整。请点击重试。')
      }
      const updated = dates.map((date, index) => {
        const result = results[index]
        const fallback = mockToExtended(FALLBACK_CALENDAR[index])
        const day = result.status === 'fulfilled' && result.value.ok && result.value.data
          ? summaryToDayData(date, result.value.data)
          : fallback
        return { ...day, weight: weightByDate.get(date) ?? null }
      })
      const preferredDate = selectedDateRef.current
      setCalendarData(updated)
      const preferredIdx = updated.findIndex((day) => day.date === preferredDate)
      setSelectedIdx(preferredIdx >= 0 ? preferredIdx : updated.length - 1)
    } catch {
      if (requestSeq === calendarRequestSeq.current) {
        setCalendarError('记录同步失败，请检查网络后重试。')
      }
    } finally {
      if (requestSeq === calendarRequestSeq.current) setLoading(false)
    }
  }, [])

  // 跨页快捷入口先定位目标日期，再由下方 effect 打开对应弹窗。
  useDidShow(() => {
    const action = takeRecordIntent()
    const visibleDates = recentDates(DAYS_COUNT)
    const requestedDate = action && visibleDates.includes(action.date)
      ? action.date
      : selectedDateRef.current
    selectedDateRef.current = requestedDate
    const requestedIdx = calendarData.findIndex((day) => day.date === requestedDate)
    if (requestedIdx >= 0) setSelectedIdx(requestedIdx)
    setPendingIntent(null)
    void loadCalendar()
      .then(() => loadDayDetails(requestedDate))
      .then(() => setPendingIntent(action && action.type !== 'calendar' ? { ...action, date: requestedDate } : null))
      .catch(() => {})
  })

  // ── 打开/关闭餐食弹窗 ──
  const openMealModal = (slotKey: string) => {
    setTabBarVisible(false)
    setEditingMealId(null)
    setActiveMealSlot(slotKey)
    setMealRows([makeEmptyRow()])
    setMealText('')
    setMealRowErrors([])
    setMealPhotoError('')
    setMealSubmitError('')
    setMealLoading(false)
    mealClientRequestIdRef.current = makeClientRequestId('meal')
    mealRequestFingerprintRef.current = ''
    setMealModalOpen(true)
  }

  const openMealEditModal = (meal: MealEntry) => {
    setTabBarVisible(false)
    setEditingMealId(meal.id)
    setActiveMealSlot(meal.mealSlot)
    setMealRows(meal.items.length > 0 ? meal.items.map(itemToRow) : [makeEmptyRow()])
    setMealText('')
    setMealRowErrors([])
    setMealPhotoError('')
    setMealSubmitError('')
    setMealLoading(false)
    mealClientRequestIdRef.current = ''
    mealRequestFingerprintRef.current = ''
    setMealModalOpen(true)
  }

  const closeMealModal = () => {
    setTabBarVisible(true)
    setMealModalOpen(false)
    setActiveMealSlot('')
    setMealRows([makeEmptyRow()])
    setMealText('')
    setMealRowErrors([])
    setMealPhotoError('')
    setMealSubmitError('')
    setEditingMealId(null)
    setMealLoading(false)
    mealClientRequestIdRef.current = ''
    mealRequestFingerprintRef.current = ''
  }

  const requestCloseMealModal = () => {
    const hasInput = mealText.trim() || mealRows.some((row) => row.foodName.trim() || row.quantityG || row.kcal)
    if (mealLoading) return
    if (!hasInput) {
      closeMealModal()
      return
    }
    Taro.showModal({
      title: '放弃本次编辑？',
      content: '尚未确认的食物内容不会保存。',
      confirmText: '放弃',
      confirmColor: '#bd4b45',
      cancelText: '继续编辑',
    }).then((result) => {
      if (result.confirm) closeMealModal()
    })
  }

  // ── handleRecordMeal 改为打开弹窗 ──
  const handleRecordMeal = (slotKey: string) => {
    openMealModal(slotKey)
  }

  // ── 行操作 ──
  const updateMealRow = (idx: number, field: keyof MealRow, value: string) => {
    if (mealLoading) return
    setMealRowErrors((previous) => previous.map((error, errorIdx) => errorIdx === idx ? '' : error))
    setMealRows((prev) => {
      const next = [...prev]
      const row = { ...next[idx], [field]: value }
      if (field === 'foodName' || field === 'quantityG') {
        const nutrition = FOOD_NUTRITION_PER_100G[row.foodName.trim()]
        const grams = parseFloat(row.quantityG)
        if (nutrition && grams > 0) {
          const ratio = grams / 100
          row.kcal = String(Math.round(nutrition.kcal * ratio))
          row.carbG = String(Math.round(nutrition.carbG * ratio * 10) / 10)
          row.proteinG = String(Math.round(nutrition.proteinG * ratio * 10) / 10)
          row.fatG = String(Math.round(nutrition.fatG * ratio * 10) / 10)
        }
      }
      next[idx] = row
      return next
    })
  }

  const addMealRow = () => {
    if (mealLoading) return
    setMealRows((prev) => [...prev, makeEmptyRow()])
  }

  const deleteMealRow = (idx: number) => {
    if (mealLoading) return
    setMealRows((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
    setMealRowErrors((previous) => previous.filter((_, errorIdx) => errorIdx !== idx))
  }

  // ── AI 文字解析 ──
  const handleMealTextParse = async () => {
    if (mealLoading) return
    const text = mealText.trim()
    if (!text) return
    const clientRequestId = makeClientRequestId('ai-text')
    setMealLoading(true)
    try {
      const res = await aiTextEstimate(text, clientRequestId)
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
        const unavailable = 'error' in res && /not_configured|503|service/i.test(res.error)
        Taro.showToast({ title: unavailable ? 'AI 服务暂不可用，可先手动录入' : '解析失败，请重试', icon: 'none', duration: 2500 })
      }
    } catch {
      Taro.showToast({ title: '解析出错', icon: 'none' })
    } finally {
      setMealLoading(false)
    }
  }

  // ── AI 拍照识别 ──
  const handleMealPhoto = async (initialUsePoint = false) => {
    if (mealLoading) return
    setMealPhotoError('')
    try {
      await requirePlatformPrivacyAuthorization()
      if (!Taro.getStorageSync('aiPhotoPrivacyConsent')) {
        const consent = await Taro.showModal({
          title: '照片识别说明',
          content: '所选照片会发送给第三方 AI 服务 OpenAI 进行本次识别。本服务不保存原图，识别结果会先由你确认，再写入饮食记录。',
          cancelText: '暂不使用',
          confirmText: '同意并继续',
        })
        if (!consent.confirm) return
        Taro.setStorageSync('aiPhotoPrivacyConsent', true)
      }
      setMealLoading(true)
      const chosenFile = await chooseOneImage()
      if (!chosenFile?.tempFilePath) return

      let uploadPath = chosenFile.tempFilePath
      let base64 = ''
      for (const quality of [80, 60, 40, 25]) {
        const compressed = await Taro.compressImage({ src: chosenFile.tempFilePath, quality })
        uploadPath = compressed.tempFilePath
        base64 = await readFileAsBase64(uploadPath)
        if (base64ByteLength(base64) <= MAX_PHOTO_BYTES) break
      }
      if (!base64) base64 = await readFileAsBase64(uploadPath)
      if (base64ByteLength(base64) > MAX_PHOTO_BYTES) {
        setMealPhotoError('图片压缩后仍超过 1MB，请裁剪后重试。已填写的食物内容会保留。')
        return
      }
      const mimeType = inferImageMimeType(uploadPath, chosenFile.fileType)
      if (!SUPPORTED_PHOTO_MIME_TYPES.has(mimeType)) {
        setMealPhotoError('暂不支持这种图片格式，请选择 JPG、PNG 或 WebP 图片。')
        return
      }
      const imageSizeBytes = base64ByteLength(base64)
      const clientRequestId = makeClientRequestId('ai-photo')

      const tryEstimate = async (usePoint: boolean) => {
        return aiPhotoEstimate(base64, { mimeType, usePoint, imageSizeBytes, clientRequestId })
      }

      let res = await tryEstimate(initialUsePoint)

      // 如果失败且可能是配额/积分问题，提示是否用积分重试
      if (!initialUsePoint && !res.ok && res.error && /quota|point|limit|余额|积分|次数/i.test(res.error)) {
        const confirmRes = await Taro.showModal({
          title: '提示',
          content: '免费次数已用完，是否使用积分继续识别？',
          confirmText: '使用积分',
          cancelText: '取消',
        })
        if (confirmRes.confirm) {
          res = await tryEstimate(true)
        } else {
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
        const unavailable = 'error' in res && /not_configured|503|service/i.test(res.error)
        const message = unavailable ? 'AI 服务暂不可用，未消耗识别次数' : '识别失败，请重试'
        setMealPhotoError(`${message}。已填写的食物内容会保留。`)
        Taro.showToast({ title: message, icon: 'none', duration: 2500 })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('cancel') && !msg.includes('取消')) {
        setMealPhotoError('图片处理失败，请重试。已填写的食物内容会保留。')
        Taro.showToast({ title: '拍照失败', icon: 'none' })
      }
    } finally {
      setMealLoading(false)
    }
  }

  // ── 确认提交 ──
  const handleMealConfirm = async () => {
    if (mealLoading) return
    setMealSubmitError('')
    const target = getTargetDay()
    const rowErrors = mealRows.map((row) => {
      const hasAnyValue = Boolean(row.foodName.trim() || row.quantityG || row.kcal || row.carbG || row.proteinG || row.fatG)
      if (!hasAnyValue) return ''
      if (!row.foodName.trim()) return '请填写食物名称。'
      if (!(parseFloat(row.quantityG) > 0)) return '请填写大于 0 的克数。'
      const kcal = parseFloat(row.kcal)
      if (!Number.isFinite(kcal) || kcal < 0) return '请填写不小于 0 kcal 的热量。'
      const hasMacro = [row.carbG, row.proteinG, row.fatG].some((value) => parseFloat(value) > 0)
      if (!hasMacro && !(activeMealSlot === 'drink' && kcal === 0)) return '碳水、蛋白质、脂肪至少一项必须大于 0。'
      return ''
    })
    setMealRowErrors(rowErrors)
    if (rowErrors.some(Boolean)) return

    const cleaned: MealItemInput[] = mealRows
      .filter((row) => row.foodName.trim() !== '')
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

    if (!editingMealId && details.meals.some((meal) => meal.mealSlot === activeMealSlot)) {
      const confirmation = await Taro.showModal({
        title: `${slotLabel}已有记录`,
        content: '继续保存会作为同一餐段的补充记录，并计入当天总摄入。',
        confirmText: '继续添加',
        cancelText: '返回检查',
      })
      if (!confirmation.confirm) return
    }

    const requestFingerprint = JSON.stringify({
      date: target.date,
      mealSlot: activeMealSlot,
      status: 'recorded',
      items: cleaned,
    })
    setMealLoading(true)
    if (!editingMealId && (!mealClientRequestIdRef.current || mealRequestFingerprintRef.current !== requestFingerprint)) {
      mealClientRequestIdRef.current = makeClientRequestId('meal')
      mealRequestFingerprintRef.current = requestFingerprint
    }
    const body: CreateMealBody = {
      date: target.date,
      mealSlot: activeMealSlot as CreateMealBody['mealSlot'],
      status: 'recorded',
      items: cleaned,
      clientRequestId: editingMealId ? undefined : mealClientRequestIdRef.current,
    }
    try {
      const res = editingMealId
        ? await updateMeal(editingMealId, body)
        : await createMeal(body)
      if (res.ok) {
        Taro.showToast({ title: editingMealId ? '已更新' : '已记录', icon: 'success', duration: 1500 })
        closeMealModal()
        await refreshDay(target.date, target.idx)
        await loadDayDetails(target.date)
      } else {
        setMealSubmitError('云端暂时未保存这条记录，已填写的内容仍在，请稍后重试。')
        Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      }
    } catch {
      setMealSubmitError('网络异常，记录尚未保存，已填写的内容仍在，请检查网络后重试。')
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    } finally {
      setMealLoading(false)
    }
  }


  const handleMealStatus = async (status: 'skipped' | 'fasting') => {
    if (mealLoading) return
    const target = getTargetDay()
    const sameSlotMeals = details.meals.filter((meal) => meal.mealSlot === activeMealSlot && meal.id !== editingMealId)
    if (!editingMealId && sameSlotMeals.length > 0) {
      const confirmation = await Taro.showModal({
        title: `替换${slotLabel}记录？`,
        content: `改为${status === 'fasting' ? '轻断食' : '本餐跳过'}后，已有食物和热量会从当天统计中移除。`,
        confirmText: '确认替换',
        cancelText: '返回检查',
        confirmColor: '#B06A28',
      })
      if (!confirmation.confirm) return
    }
    setMealSubmitError('')
    setMealLoading(true)
    try {
      const requestFingerprint = JSON.stringify({
        date: target.date,
        mealSlot: activeMealSlot,
        status,
        items: [],
      })
      if (!editingMealId && (!mealClientRequestIdRef.current || mealRequestFingerprintRef.current !== requestFingerprint)) {
        mealClientRequestIdRef.current = makeClientRequestId('meal')
        mealRequestFingerprintRef.current = requestFingerprint
      }
      const body: CreateMealBody = {
        date: target.date,
        mealSlot: activeMealSlot as CreateMealBody['mealSlot'],
        status,
        items: [],
        clientRequestId: editingMealId ? undefined : mealClientRequestIdRef.current,
      }
      let res = editingMealId
        ? await updateMeal(editingMealId, body)
        : sameSlotMeals.length > 0
          ? await updateMeal(sameSlotMeals[0].id, body)
          : await createMeal(body)
      if (res.ok && !editingMealId && sameSlotMeals.length > 1) {
        const removals = await Promise.all(sameSlotMeals.slice(1).map((meal) => deleteMeal(meal.id)))
        if (removals.some((result) => !result.ok)) {
          res = { ok: false, error: 'meal_replacement_partial' }
        }
      }
      if (!res.ok) {
        setMealSubmitError('云端暂时未保存本餐状态，请稍后重试。')
        Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
        return
      }
      closeMealModal()
      Taro.showToast({ title: status === 'fasting' ? '已记录轻断食' : '已记录本餐跳过', icon: 'success' })
      await refreshDay(target.date, target.idx)
      await loadDayDetails(target.date)
    } catch {
      setMealSubmitError('网络异常，本餐状态尚未保存，请检查网络后重试。')
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
    } finally {
      setMealLoading(false)
    }
  }

  // ── 运动弹窗 ──
  const openExerciseModal = (exerciseType: string) => {
    setTabBarVisible(false)
    setEditingExerciseId(null)
    const rows = [makeExerciseRow(exerciseType, currentWeightKg ?? selected?.weight ?? null)]
    setExerciseRows(rows)
    exerciseInitialRef.current = JSON.stringify(rows)
    setExerciseSubmitting(false)
    setExerciseError('')
    setExerciseModalOpen(true)
  }

  const openExerciseEditModal = (exercise: ExerciseEntry) => {
    setTabBarVisible(false)
    setEditingExerciseId(exercise.id)
    const rows = [
      makeExerciseRow(
        exercise.exerciseType,
        currentWeightKg ?? selected?.weight ?? null,
        exercise.durationMin,
        exercise.confirmedKcal,
        exercise.calorieSource !== 'met',
      ),
    ]
    setExerciseRows(rows)
    exerciseInitialRef.current = JSON.stringify(rows)
    setExerciseSubmitting(false)
    setExerciseError('')
    setExerciseModalOpen(true)
  }

  const closeExerciseModal = (force = false) => {
    if (exerciseSubmitting && !force) return
    setTabBarVisible(true)
    setExerciseModalOpen(false)
    setExerciseRows([])
    setExerciseSubmitting(false)
    setExerciseError('')
    setEditingExerciseId(null)
    exerciseInitialRef.current = ''
  }

  const requestCloseExerciseModal = async () => {
    if (exerciseSubmitting) return
    if (exerciseInitialRef.current && JSON.stringify(exerciseRows) !== exerciseInitialRef.current) {
      const result = await Taro.showModal({
        title: '放弃本次修改？',
        content: '已填写的运动内容尚未保存。',
        confirmText: '放弃',
        cancelText: '继续填写',
        confirmColor: '#B64A3B',
      })
      if (!result.confirm) return
    }
    closeExerciseModal()
  }

  const updateExerciseRow = (idx: number, field: keyof ExerciseRow, value: string) => {
    if (exerciseSubmitting) return
    setExerciseError('')
    setExerciseRows((prev) => {
      const next = [...prev]
      const row = { ...next[idx], [field]: value }
      if (field === 'durationMin') {
        const dur = parseFloat(value) || 0
        const estimate = estimateExerciseKcal(row.exerciseType, currentWeightKg ?? selected?.weight ?? null, dur)
        row.confirmedKcal = estimate != null ? String(estimate) : ''
        row.kcalManuallyEdited = false
      } else if (field === 'confirmedKcal') {
        row.kcalManuallyEdited = true
      }
      row.clientRequestId = makeClientRequestId('exercise')
      next[idx] = row
      return next
    })
  }

  const updateExerciseRowType = (idx: number, exerciseType: string) => {
    if (exerciseSubmitting) return
    setExerciseError('')
    setExerciseRows((prev) => {
      const next = [...prev]
      const dur = parseFloat(next[idx].durationMin) || 30
      const estimate = estimateExerciseKcal(exerciseType, currentWeightKg ?? selected?.weight ?? null, dur)
      next[idx] = {
        ...next[idx],
        exerciseType,
        confirmedKcal: estimate != null ? String(estimate) : '',
        kcalManuallyEdited: false,
        clientRequestId: makeClientRequestId('exercise'),
      }
      return next
    })
  }

  const addExerciseRow = () => {
    if (exerciseSubmitting || editingExerciseId) return
    setExerciseRows((prev) => [
      ...prev,
      makeExerciseRow(EXERCISE_TYPES[0].type, currentWeightKg ?? selected?.weight ?? null),
    ])
  }

  const deleteExerciseRow = (idx: number) => {
    if (exerciseSubmitting || editingExerciseId) return
    setExerciseRows((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  const handleExerciseConfirm = async () => {
    if (exerciseSubmitting) return
    const target = getTargetDay()
    const valid = exerciseRows.filter((r) => parseFloat(r.durationMin) > 0)
    if (valid.length === 0) {
      setExerciseError('请至少填写一项时长大于 0 分钟的运动。')
      Taro.showToast({ title: '请至少添加一项运动', icon: 'none' })
      return
    }
    if (valid.some((row) => parseFloat(row.durationMin) > 1440)) {
      setExerciseError('单项运动时长不能超过 1440 分钟。')
      Taro.showToast({ title: '运动时长不能超过 1440 分钟', icon: 'none' })
      return
    }
    setExerciseError('')
    setExerciseSubmitting(true)
    const failedRows: ExerciseRow[] = []
    let failureReason = ''
    try {
      if (editingExerciseId) {
        const row = valid[0]
        const res = await withTimeout(updateExercise(editingExerciseId, {
          exerciseType: row.exerciseType,
          durationMin: parseFloat(row.durationMin),
          ...(row.kcalManuallyEdited && parseFloat(row.confirmedKcal) > 0
            ? { confirmedKcal: parseFloat(row.confirmedKcal) }
            : {}),
        }), EXERCISE_TIMEOUT_MS)
        if (!res.ok) {
          failedRows.push(row)
          failureReason = res.error
        }
      } else {
        for (const row of valid) {
          const body: CreateExerciseBody & { clientRequestId: string } = {
            date: target.date,
            exerciseType: row.exerciseType,
            durationMin: parseFloat(row.durationMin) || 30,
            weightKg: currentWeightKg ?? target.weight ?? undefined,
            ...(row.kcalManuallyEdited && parseFloat(row.confirmedKcal) > 0
              ? { confirmedKcal: parseFloat(row.confirmedKcal) }
              : {}),
            clientRequestId: row.clientRequestId,
          }
          try {
            const res = await withTimeout(createExercise(body), EXERCISE_TIMEOUT_MS)
            if (!res.ok) {
              failedRows.push(row)
              failureReason ||= res.error
            }
          } catch (error) {
            failedRows.push(row)
            failureReason ||= error instanceof Error ? error.message : 'network_error'
          }
        }
      }
      if (failedRows.length === 0) {
        closeExerciseModal(true)
        Taro.showToast({ title: editingExerciseId ? '已更新运动' : '已记录运动', icon: 'success', duration: 1500 })
      } else {
        setExerciseRows(failedRows)
        setExerciseSubmitting(false)
        setExerciseError(
          /timeout/i.test(failureReason)
            ? '提交超时，内容已保留。请检查网络后重试。'
            : failureReason === 'http_not_configured' || failureReason === 'cloud_call_failed'
            ? '云端服务暂时不可用，内容已保留。请稍后重试。'
            : '部分运动未能保存，未保存的内容已保留。',
        )
        Taro.showToast({ title: '未保存的项目已保留，请重试', icon: 'none' })
      }
      await refreshDay(target.date, target.idx)
      await loadDayDetails(target.date)
    } catch {
      setExerciseError('记录失败，内容已保留。请检查网络后重试。')
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      setExerciseSubmitting(false)
    }
  }

  const handleRecordExercise = (exerciseType: string) => {
    openExerciseModal(exerciseType)
  }

  // ── 体重弹窗 ──
  const openWeightModal = () => {
    const existingWeight = details.weights[details.weights.length - 1]
    setTabBarVisible(false)
    setEditingWeightId(existingWeight?.id ?? null)
    setWeightValue(existingWeight ? String(existingWeight.weightKg) : selected?.weight != null ? String(selected.weight) : '')
    setWeighingContext(/evening|after_meal|晚|饭后/i.test(existingWeight?.weighingContext ?? '') ? 'evening' : 'morning')
    weightInitialRef.current = JSON.stringify({
      value: existingWeight ? String(existingWeight.weightKg) : selected?.weight != null ? String(selected.weight) : '',
      context: /evening|after_meal|晚|饭后/i.test(existingWeight?.weighingContext ?? '') ? 'evening' : 'morning',
    })
    setWeightSubmitting(false)
    setWeightError('')
    weightClientRequestIdRef.current = makeClientRequestId('weight')
    weightRequestFingerprintRef.current = ''
    setWeightModalOpen(true)
  }

  useEffect(() => {
    if (!pendingIntent || selected?.date !== pendingIntent.date) return
    setPendingIntent(null)
    if (pendingIntent.type === 'meal') {
      openMealModal(pendingIntent.slot)
      if (pendingIntent.mode === 'photo') Taro.nextTick(() => handleMealPhoto(Boolean(pendingIntent.usePoint)))
    } else if (pendingIntent.type === 'exercise') {
      openExerciseModal(EXERCISE_TYPES[0].type)
    } else if (pendingIntent.type === 'weight') {
      openWeightModal()
    }
  }, [pendingIntent, selected?.date])

  const openWeightEditModal = (weight: WeightEntry) => {
    setTabBarVisible(false)
    setEditingWeightId(weight.id)
    setWeightValue(String(weight.weightKg))
    setWeighingContext(/evening|after_meal|晚|饭后/i.test(weight.weighingContext ?? '') ? 'evening' : 'morning')
    weightInitialRef.current = JSON.stringify({
      value: String(weight.weightKg),
      context: /evening|after_meal|晚|饭后/i.test(weight.weighingContext ?? '') ? 'evening' : 'morning',
    })
    setWeightSubmitting(false)
    setWeightError('')
    weightClientRequestIdRef.current = ''
    weightRequestFingerprintRef.current = ''
    setWeightModalOpen(true)
  }

  const closeWeightModal = (force = false) => {
    if (weightSubmitting && !force) return
    setTabBarVisible(true)
    setWeightModalOpen(false)
    setWeightValue('')
    setWeightSubmitting(false)
    setWeightError('')
    setEditingWeightId(null)
    weightClientRequestIdRef.current = ''
    weightRequestFingerprintRef.current = ''
    weightInitialRef.current = ''
  }

  const requestCloseWeightModal = async () => {
    if (weightSubmitting) return
    const current = JSON.stringify({ value: weightValue, context: weighingContext })
    if (weightInitialRef.current && current !== weightInitialRef.current) {
      const result = await Taro.showModal({
        title: '放弃体重修改？',
        content: '当前输入尚未保存。',
        confirmText: '放弃',
        cancelText: '继续填写',
        confirmColor: '#B64A3B',
      })
      if (!result.confirm) return
    }
    closeWeightModal()
  }

  const handleWeightConfirm = async () => {
    if (weightSubmitting) return
    const target = getTargetDay()
    const val = parseFloat(weightValue)
    if (!Number.isFinite(val) || val < 20 || val > 250) {
      setWeightError('请输入 20-250 kg 之间的体重。')
      Taro.showToast({ title: '体重需在 20-250 kg', icon: 'none' })
      return
    }
    setWeightError('')
    setWeightSubmitting(true)
    const ctx = weighingContext === 'morning' ? 'morning_fasted' : 'evening'
    try {
      const body = { date: target.date, weightKg: val, weighingContext: ctx }
      const requestFingerprint = JSON.stringify(body)
      if (!editingWeightId && (!weightClientRequestIdRef.current || weightRequestFingerprintRef.current !== requestFingerprint)) {
        weightClientRequestIdRef.current = makeClientRequestId('weight')
        weightRequestFingerprintRef.current = requestFingerprint
      }
      const res = editingWeightId
        ? await updateWeight(editingWeightId, body)
        : await createWeight({ ...body, clientRequestId: weightClientRequestIdRef.current })
      if (res.ok) {
        setCalendarData((prev) => {
          const next = [...prev]
          if (next[target.idx]) {
            next[target.idx] = { ...next[target.idx], weight: val }
          }
          return next
        })
        if (target.date === todayDateString()) {
          setCurrentWeightKg(res.data.calibration?.plan?.currentWeightKg ?? val)
        }
        Taro.showToast({ title: editingWeightId ? '已更新体重' : '已记录体重', icon: 'success', duration: 1500 })
        closeWeightModal(true)
        await refreshDay(target.date, target.idx)
        await loadDayDetails(target.date)
      } else {
        setWeightError('云端暂时未保存体重，输入内容仍在，请稍后重试。')
        Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
        setWeightSubmitting(false)
      }
    } catch {
      setWeightError('网络异常，体重尚未保存，输入内容仍在，请检查网络后重试。')
      Taro.showToast({ title: '记录失败，请重试', icon: 'none' })
      setWeightSubmitting(false)
    }
  }

  const handleRecordWeight = () => {
    openWeightModal()
  }

  const refreshAfterDetailChange = async (date: string) => {
    const idx = calendarData.findIndex((day) => day.date === date)
    await Promise.all([
      refreshDay(date, idx >= 0 ? idx : selectedIdx),
      loadDayDetails(date),
    ])
  }

  const handleDeleteDetail = async (kind: DetailKind, id: string, label: string) => {
    if (detailActionId) return
    const confirmation = await Taro.showModal({
      title: `删除${label}？`,
      content: '删除后会立即重新计算当天数据。',
      confirmText: '删除',
      confirmColor: '#bd4b45',
      cancelText: '取消',
    })
    if (!confirmation.confirm) return
    setDetailActionId(id)
    try {
      const res = kind === 'meal'
        ? await deleteMeal(id)
        : kind === 'exercise'
          ? await deleteExercise(id)
          : await deleteWeight(id)
      if (!res.ok) {
        Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
        return
      }
      Taro.showToast({ title: '已删除', icon: 'success' })
      await refreshAfterDetailChange(selectedDateRef.current)
    } catch {
      Taro.showToast({ title: '删除失败，请重试', icon: 'none' })
    } finally {
      setDetailActionId('')
    }
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
          {calendarError && !loading && (
            <View className='record-calendar-error'>
              <Text className='record-calendar-error-text'>{calendarError}</Text>
              <View className='record-calendar-retry' onClick={() => void loadCalendar()}>
                <Text className='record-calendar-retry-text'>重试</Text>
              </View>
            </View>
          )}
          <ScrollView className='record-calendar-scroll' scrollX enhanced showScrollbar={false} scrollIntoView={selected ? `record-day-${selected.date}` : undefined} scrollWithAnimation>
            <View className='record-calendar-row'>
              {calendarData.map((day, idx) => (
                <View
                  key={day.date}
                  id={`record-day-${day.date}`}
                  className={`record-day ${idx === selectedIdx ? 'record-day--active' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <Text className='record-day-week'>{weekdayShort(day.date)}</Text>
                  <Text className='record-day-date'>{fmtDay(day.date)}</Text>
                  {day.star && <Text className='record-day-star'>★</Text>}
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
                  {selected.recordComplete ? displayVal(selected.deficit) : '--'}
                </Text>
                <Text className='record-summary-label'>
                  {!selected.recordComplete
                    ? '待完整记录'
                    : selected.targetDeficitKcal != null
                    ? `缺口 ${selected.deficit} / ${selected.targetDeficitKcal} kcal`
                    : '缺口 kcal'}
                </Text>
                <Text className='record-achievement-rate'>
                  {selected.recordComplete && ratePercent(selected.achievementRate) != null
                    ? `达成 ${ratePercent(selected.achievementRate)}`
                    : '达成率 --'}
                </Text>
              </View>
              <View className='record-summary-item'>
                <Text className='record-summary-value'>
                  {selected.weight != null ? selected.weight.toFixed(1) : '--'}
                </Text>
                <Text className='record-summary-label'>体重 kg</Text>
              </View>
            </View>

            {!selected.recordComplete && (
              <View className='record-incomplete'>
                <View className='record-incomplete-dot' />
                <Text className='record-incomplete-text'>至少记录两餐后，才会计算当天缺口达成率</Text>
              </View>
            )}

            {/* 缺口详情卡片 */}
            {selected.targetDeficitKcal != null && (
              <View className='record-gap-card'>
                <Text className='record-gap-title'>今日能量缺口</Text>
                <View className='record-gap-row'>
                  <View className='record-gap-col'>
                    <Text className='record-gap-kcal'>{selected.recordComplete ? displayVal(selected.deficit) : '--'}</Text>
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

            <View className='record-section record-detail-section'>
              <View className='record-section-heading'>
                <Text className='record-section-title'>当日明细</Text>
                {detailsLoading && <Text className='record-section-meta'>同步中</Text>}
              </View>
              {detailsErrors.length > 0 && (
                <View className='record-detail-error'>
                  <Text className='record-detail-error-text'>{detailsErrors.join('、')}加载失败，已保留成功返回的数据。</Text>
                  <View className='record-detail-retry' onClick={() => loadDayDetails(selected.date)}>
                    <Text className='record-detail-retry-text'>重试</Text>
                  </View>
                </View>
              )}
              {!detailsLoading && detailsErrors.length === 0 && details.meals.length === 0 && details.exercises.length === 0 && details.weights.length === 0 && (
                <View className='record-detail-empty'>
                  <Text className='record-detail-empty-title'>这一天还没有记录</Text>
                  <Text className='record-detail-empty-text'>从下面选择餐段、运动或体重开始</Text>
                </View>
              )}
              {details.meals.map((meal) => (
                <View key={`meal-${meal.id}`} className='record-detail-row'>
                  <View className='record-detail-mark record-detail-mark--meal'><Text className='record-detail-mark-text'>食</Text></View>
                  <View className='record-detail-main'>
                    <Text className='record-detail-title'>{MEAL_SLOTS.find((slot) => slot.key === meal.mealSlot)?.label ?? '饮食'}</Text>
                    <Text className='record-detail-desc'>{meal.items.map((item) => item.foodName).join('、') || (meal.status === 'fasting' ? '轻断食' : '本餐跳过')}</Text>
                  </View>
                  <View className='record-detail-end'>
                    <Text className='record-detail-value'>{meal.totalKcal} kcal</Text>
                    <View className='record-detail-actions'>
                      <Text className='record-detail-action' onClick={() => openMealEditModal(meal)}>修改</Text>
                      <Text
                        className='record-detail-action record-detail-action--danger'
                        onClick={() => handleDeleteDetail('meal', meal.id, '餐饮记录')}
                      >{detailActionId === meal.id ? '删除中' : '删除'}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {details.exercises.map((exercise) => (
                <View key={`exercise-${exercise.id}`} className='record-detail-row'>
                  <View className='record-detail-mark record-detail-mark--exercise'><Text className='record-detail-mark-text'>动</Text></View>
                  <View className='record-detail-main'>
                    <Text className='record-detail-title'>{exercise.exerciseType}</Text>
                    <Text className='record-detail-desc'>{exercise.durationMin} 分钟</Text>
                  </View>
                  <View className='record-detail-end'>
                    <Text className='record-detail-value'>{exercise.confirmedKcal} kcal</Text>
                    <View className='record-detail-actions'>
                      <Text className='record-detail-action' onClick={() => openExerciseEditModal(exercise)}>修改</Text>
                      <Text
                        className='record-detail-action record-detail-action--danger'
                        onClick={() => handleDeleteDetail('exercise', exercise.id, '运动记录')}
                      >{detailActionId === exercise.id ? '删除中' : '删除'}</Text>
                    </View>
                  </View>
                </View>
              ))}
              {details.weights.map((weight) => (
                <View key={`weight-${weight.id}`} className='record-detail-row'>
                  <View className='record-detail-mark record-detail-mark--weight'><Text className='record-detail-mark-text'>重</Text></View>
                  <View className='record-detail-main'>
                    <Text className='record-detail-title'>体重打卡</Text>
                    <Text className='record-detail-desc'>
                      {/morning|fasted|早|空腹/i.test(weight.weighingContext ?? '')
                        ? '早晨空腹'
                        : /evening|after_meal|晚|饭后/i.test(weight.weighingContext ?? '')
                        ? '晚上饭后'
                        : '称重时间未标注'}
                    </Text>
                  </View>
                  <View className='record-detail-end'>
                    <Text className='record-detail-value'>{weight.weightKg.toFixed(1)} kg</Text>
                    <View className='record-detail-actions'>
                      <Text className='record-detail-action' onClick={() => openWeightEditModal(weight)}>修改</Text>
                      <Text
                        className='record-detail-action record-detail-action--danger'
                        onClick={() => handleDeleteDetail('weight', weight.id, '体重记录')}
                      >{detailActionId === weight.id ? '删除中' : '删除'}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Meal record buttons */}
            <View className='record-section'>
              <Text className='record-section-title'>添加餐饮</Text>
              <View className='record-meal-grid'>
                {MEAL_SLOTS.map((slot) => (
                  <View
                    key={slot.key}
                    className='record-meal-btn'
                    onClick={() => handleRecordMeal(slot.key)}
                  >
                    <View className='record-meal-mark'>
                      <Text className='record-meal-mark-text'>{slot.short}</Text>
                    </View>
                    <Text className='record-meal-label'>{slot.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Exercise record */}
            <View className='record-section'>
              <Text className='record-section-title'>添加运动</Text>
              <View className='record-exercise-grid'>
                {EXERCISE_TYPES.map((ex) => (
                  <View
                    key={ex.type}
                    className='record-exercise-btn'
                    onClick={() => handleRecordExercise(ex.type)}
                  >
                    <Text className='record-exercise-label'>{ex.type}</Text>
                    <Text className='record-exercise-kcal'>
                      {estimateExerciseKcal(ex.type, currentWeightKg ?? selected.weight, 30) != null
                        ? `~${estimateExerciseKcal(ex.type, currentWeightKg ?? selected.weight, 30)}kcal / 30分钟`
                        : '记录体重后估算'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Weight record */}
            <View className='record-section'>
              <Text className='record-section-title'>体重打卡</Text>
              <View className='record-weight-card'>
                <View className='record-weight-info'>
                  <Text className='record-weight-value'>
                    {selected.weight != null ? `${selected.weight.toFixed(1)} kg` : '-- kg'}
                  </Text>
                  <Text className='record-weight-context'>记录时请标注早晨空腹或晚上饭后</Text>
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
        <View className={`meal-modal-mask ${mealLoading ? 'meal-modal-mask--locked' : ''}`} onClick={requestCloseMealModal}>
          <View className={`meal-modal ${mealLoading ? 'meal-modal--locked' : ''}`} onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>{editingMealId ? '修改' : '记录'}{slotLabel}</Text>
              <View
                className={`meal-modal-close ${mealLoading ? 'meal-modal-close--disabled' : ''}`}
                onClick={requestCloseMealModal}
              >
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            {/* 食物表格 */}
            <ScrollView className='meal-modal-body' scrollY>
              <View className='meal-modal-body-inner'>
              <View className='meal-table'>
                <View className='meal-table-header'>
                  <Text className='meal-th meal-th-food'>食物</Text>
                  <Text className='meal-th meal-th-num'>克数</Text>
                  <Text className='meal-th meal-th-num'>热量</Text>
                  <Text className='meal-th meal-th-del'></Text>
                </View>
                {mealRows.map((row, idx) => (
                  <View className='meal-row-block' key={idx}>
                    <View className='meal-table-row'>
                      <View className='meal-td meal-td-food'>
                        <Input
                          className='meal-input'
                          disabled={mealLoading}
                          value={row.foodName}
                          placeholder='食物名称'
                          onInput={(e) => updateMealRow(idx, 'foodName', e.detail.value)}
                        />
                      </View>
                      <View className='meal-td meal-td-num'>
                        <Input
                          className='meal-input meal-input-num'
                          type='digit'
                          disabled={mealLoading}
                          value={row.quantityG}
                          placeholder='g'
                          onInput={(e) => updateMealRow(idx, 'quantityG', e.detail.value)}
                        />
                      </View>
                      <View className='meal-td meal-td-num'>
                        <Input
                          className='meal-input meal-input-num'
                          type='digit'
                          disabled={mealLoading}
                          value={row.kcal}
                          placeholder='kcal'
                          onInput={(e) => updateMealRow(idx, 'kcal', e.detail.value)}
                        />
                      </View>
                      <View className='meal-td meal-td-del'>
                        <View
                          className={`meal-del-btn ${mealLoading ? 'meal-control--disabled' : ''}`}
                          onClick={() => deleteMealRow(idx)}
                        >
                          <Text className='meal-del-btn-text'>删除</Text>
                        </View>
                      </View>
                    </View>
                    <View className='meal-macro-grid'>
                      {([
                        ['carbG', '碳水 g'],
                        ['proteinG', '蛋白质 g'],
                        ['fatG', '脂肪 g'],
                      ] as const).map(([field, label]) => (
                        <View className='meal-macro-field' key={field}>
                          <Text className='meal-macro-label'>{label}</Text>
                          <Input
                            className='meal-input meal-input-num meal-macro-input'
                            type='digit'
                            disabled={mealLoading}
                            value={row[field]}
                            placeholder='0'
                            onInput={(e) => updateMealRow(idx, field, e.detail.value)}
                          />
                        </View>
                      ))}
                    </View>
                    {mealRowErrors[idx] && (
                      <View className='meal-inline-error'>
                        <Text className='meal-inline-error-text'>{mealRowErrors[idx]}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              <View
                className={`meal-add-row ${mealLoading ? 'meal-add-row--disabled' : ''}`}
                onClick={addMealRow}
              >
                <Text className='meal-add-row-text'>＋ 新增一行</Text>
              </View>

              <View className='meal-status-row'>
                <View
                  className={`meal-status-btn ${mealLoading ? 'meal-control--disabled' : ''}`}
                  onClick={() => handleMealStatus('fasting')}
                >
                  <Text className='meal-status-title'>轻断食</Text>
                  <Text className='meal-status-desc'>计为已记录，不计摄入</Text>
                </View>
                <View
                  className={`meal-status-btn ${mealLoading ? 'meal-control--disabled' : ''}`}
                  onClick={() => handleMealStatus('skipped')}
                >
                  <Text className='meal-status-title'>本餐跳过</Text>
                  <Text className='meal-status-desc'>仅做标记，不计入两餐完成度</Text>
                </View>
              </View>

              {/* 自然语言输入 */}
              <View className='meal-ai-section'>
                <Text className='meal-ai-label'>自然语言描述</Text>
                <Textarea
                  className='meal-textarea'
                  disabled={mealLoading}
                  value={mealText}
                  placeholder='例如：一碗米饭，一份番茄炒蛋，一杯豆浆'
                  onInput={(e) => {
                    if (!mealLoading) setMealText(e.detail.value)
                  }}
                  autoHeight
                  maxlength={500}
                />
                <View className='meal-ai-row'>
                  <View
                    className={`meal-ai-btn ${mealLoading ? 'meal-control--disabled' : ''}`}
                    onClick={handleMealTextParse}
                  >
                    <Text className='meal-ai-btn-text'>AI 解析</Text>
                  </View>
                  <View
                    className={`meal-ai-btn meal-ai-btn--photo ${mealLoading ? 'meal-control--disabled' : ''}`}
                    onClick={() => handleMealPhoto()}
                  >
                    <Text className='meal-ai-btn-text'>拍照识别</Text>
                  </View>
                </View>
                {mealPhotoError && (
                  <View className='meal-inline-error meal-photo-error'>
                    <Text className='meal-inline-error-text'>{mealPhotoError}</Text>
                  </View>
                )}
              </View>
              </View>
            </ScrollView>

            {mealLoading && (
              <View className='exercise-submit-notice'>
                <Text className='exercise-submit-notice-text'>正在处理，请等待结果。期间不可修改、增删或切换餐食状态。</Text>
              </View>
            )}

            {mealSubmitError && (
              <View className='exercise-inline-error'>
                <Text className='exercise-inline-error-text'>{mealSubmitError}</Text>
              </View>
            )}

            {/* 底部按钮 */}
            <View className='meal-modal-footer'>
              <Button
                className={`meal-footer-btn meal-footer-btn--cancel ${mealLoading ? 'meal-footer-btn--disabled' : ''}`}
                disabled={mealLoading}
                onClick={requestCloseMealModal}
              >
                <Text className='meal-footer-btn-text'>取消</Text>
              </Button>
              <Button
                className={`meal-footer-btn meal-footer-btn--confirm ${mealLoading ? 'meal-footer-btn--disabled' : ''}`}
                disabled={mealLoading}
                onClick={handleMealConfirm}
              >
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {mealLoading ? '处理中...' : editingMealId ? '保存修改' : '确认记录'}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* ── 运动弹窗 ── */}
      {exerciseModalOpen && (
        <View className={`meal-modal-mask ${exerciseSubmitting ? 'meal-modal-mask--locked' : ''}`} onClick={requestCloseExerciseModal}>
          <View className='meal-modal exercise-modal' onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>{editingExerciseId ? '修改运动' : '记录运动'}</Text>
              <View
                className={`meal-modal-close ${exerciseSubmitting ? 'meal-modal-close--disabled' : ''}`}
                onClick={requestCloseExerciseModal}
              >
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            <ScrollView className='meal-modal-body exercise-modal-body' scrollY>
              <View className='meal-modal-body-inner exercise-modal-body-inner'>
              <View className='exercise-table-header'>
                <Text className='exercise-th exercise-th-type'>运动类型</Text>
                <Text className='exercise-th exercise-th-num'>分钟</Text>
                <Text className='exercise-th exercise-th-num'>热量</Text>
                <Text className='exercise-th exercise-th-del'></Text>
              </View>

              {exerciseRows.map((row, idx) => (
                <View className='exercise-table-row' key={row.clientRequestId}>
                  <View className='exercise-type-cell'>
                    <Picker
                      mode='selector'
                      range={EXERCISE_TYPES.map((ex) => ex.type)}
                      value={Math.max(0, EXERCISE_TYPES.findIndex((ex) => ex.type === row.exerciseType))}
                      disabled={exerciseSubmitting}
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
                      disabled={exerciseSubmitting}
                      value={row.durationMin}
                      placeholder='分钟'
                      onInput={(e) => updateExerciseRow(idx, 'durationMin', e.detail.value)}
                    />
                  </View>
                  <View className='exercise-num-cell'>
                    <Input
                      className='meal-input meal-input-num'
                      type='digit'
                      disabled={exerciseSubmitting}
                      value={row.confirmedKcal}
                      placeholder='kcal'
                      onInput={(e) => updateExerciseRow(idx, 'confirmedKcal', e.detail.value)}
                    />
                  </View>
                  <View className='exercise-del-cell'>
                    {!editingExerciseId && (
                      <View className='meal-del-btn' onClick={() => deleteExerciseRow(idx)}>
                        <Text className='meal-del-btn-text'>删除</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}

              {!editingExerciseId && (
                <View className={`meal-add-row ${exerciseSubmitting ? 'meal-add-row--disabled' : ''}`} onClick={addExerciseRow}>
                  <Text className='meal-add-row-text'>＋ 新增运动</Text>
                </View>
              )}
              </View>
            </ScrollView>

            {exerciseSubmitting && (
              <View className='exercise-submit-notice'>
                <Text className='exercise-submit-notice-text'>正在保存，请等待结果。提交期间不可取消或关闭。</Text>
              </View>
            )}
            {exerciseError && (
              <View className='exercise-inline-error'>
                <Text className='exercise-inline-error-text'>{exerciseError}</Text>
              </View>
            )}

            <View className='meal-modal-footer'>
              <Button
                className={`meal-footer-btn meal-footer-btn--cancel ${exerciseSubmitting ? 'meal-footer-btn--disabled' : ''}`}
                disabled={exerciseSubmitting}
                onClick={requestCloseExerciseModal}
              >
                <Text className='meal-footer-btn-text'>取消</Text>
              </Button>
              <Button
                className={`meal-footer-btn meal-footer-btn--confirm ${exerciseSubmitting ? 'meal-footer-btn--disabled' : ''}`}
                disabled={exerciseSubmitting}
                onClick={handleExerciseConfirm}
              >
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {exerciseSubmitting ? '提交中...' : editingExerciseId ? '保存修改' : '确认记录'}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* ── 体重弹窗 ── */}
      {weightModalOpen && (
        <View className={`meal-modal-mask ${weightSubmitting ? 'meal-modal-mask--locked' : ''}`} onClick={requestCloseWeightModal}>
          <View className='meal-modal weight-modal' onClick={(e) => e.stopPropagation()}>
            <View className='meal-modal-header'>
              <Text className='meal-modal-title'>{editingWeightId ? '修改体重' : '体重打卡'}</Text>
              <View
                className={`meal-modal-close ${weightSubmitting ? 'meal-modal-close--disabled' : ''}`}
                onClick={requestCloseWeightModal}
              >
                <Text className='meal-modal-close-text'>✕</Text>
              </View>
            </View>

            <View className='weight-modal-body'>
              <Text className='weight-modal-label'>称重时间</Text>
              <View className='weight-context-row'>
                <View
                  className={`weight-context-option ${weighingContext === 'morning' ? 'weight-context-option--active' : ''}`}
                  onClick={() => {
                    if (weightSubmitting) return
                    setWeighingContext('morning')
                    setWeightError('')
                  }}
                >
                  <Text className={`weight-context-text ${weighingContext === 'morning' ? 'weight-context-text--active' : ''}`}>
                    早（空腹）
                  </Text>
                </View>
                <View
                  className={`weight-context-option ${weighingContext === 'evening' ? 'weight-context-option--active' : ''}`}
                  onClick={() => {
                    if (weightSubmitting) return
                    setWeighingContext('evening')
                    setWeightError('')
                  }}
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
                  disabled={weightSubmitting}
                  value={weightValue}
                  placeholder='请输入体重'
                  onInput={(e) => {
                    setWeightValue(e.detail.value)
                    setWeightError('')
                  }}
                />
                <Text className='weight-input-unit'>kg</Text>
              </View>
            </View>

            {weightError && (
              <View className='exercise-inline-error'>
                <Text className='exercise-inline-error-text'>{weightError}</Text>
              </View>
            )}

            {weightSubmitting && (
              <View className='exercise-submit-notice'>
                <Text className='exercise-submit-notice-text'>正在保存，请等待结果。提交期间不可取消或关闭。</Text>
              </View>
            )}

            <View className='meal-modal-footer'>
              <Button
                className={`meal-footer-btn meal-footer-btn--cancel ${weightSubmitting ? 'meal-footer-btn--disabled' : ''}`}
                disabled={weightSubmitting}
                onClick={requestCloseWeightModal}
              >
                <Text className='meal-footer-btn-text'>取消</Text>
              </Button>
              <Button
                className={`meal-footer-btn meal-footer-btn--confirm ${weightSubmitting ? 'meal-footer-btn--disabled' : ''}`}
                disabled={weightSubmitting}
                onClick={handleWeightConfirm}
              >
                <Text className='meal-footer-btn-text meal-footer-btn-text--confirm'>
                  {weightSubmitting ? '提交中...' : editingWeightId ? '保存修改' : '确认记录'}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
