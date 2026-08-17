import { Text, View } from '@tarojs/components'
import { useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import {
  ensureAuthReady,
  getCurrentPlan,
  getDailySummary,
  getEntitlement,
  getExercises,
  getMeals,
  getWeights,
} from '../../api/client'
import { resetTodayData, setTodayData, useTodayData } from '../../store/todayDataStore'
import type { TodayStoreData } from '../../store/todayDataStore'
import HeaderSection from './components/HeaderSection'
import CalorieBalanceCard from './components/CalorieBalanceCard'
import MetricRow from './components/MetricRow'
import MealQuickCards from './components/MealQuickCards'
import ExerciseCard from './components/ExerciseCard'
import StarRewardCard from './components/StarRewardCard'
import WeightTrendCard from './components/WeightTrendCard'
import TipCard from './components/TipCard'
import MacroSummaryCard from './components/MacroSummaryCard'
import MealTimelineCard from './components/MealTimelineCard'
import QuickActionCards from './components/QuickActionCards'
import DailyAdviceCard from './components/DailyAdviceCard'
import TodayRecordOverlay from './components/TodayRecordOverlay'
import type { TodayRecordAction } from './components/TodayRecordOverlay'
import type { MealSlot } from '../../utils/recordIntent'
import './index.scss'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const m = d.getMonth() + 1
  const day = d.getDate()
  const w = WEEKDAYS[d.getDay()]
  return `${m}月${day}日 星期${w}`
}

function isoDateOffset(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const SLOT_META: Record<string, { id: string; name: string }> = {
  breakfast: { id: 'breakfast', name: '早餐' },
  lunch: { id: 'lunch', name: '午餐' },
  dinner: { id: 'dinner', name: '晚餐' },
  other: { id: 'snack', name: '其它' },
  drink: { id: 'drink', name: '饮品' },
}

function formatCreatedAt(createdAt?: string): string {
  if (!createdAt) return '无时间'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return '无时间'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function PartialDailyMetrics({ onIntake }: { onIntake: () => void }) {
  const d = useTodayData()
  const metrics = [
    { label: '已摄入', value: `${d.consumed}`, unit: 'kcal', tone: 'brand' },
    { label: '日常消耗', value: `${d.baseExpenditure}`, unit: 'kcal', tone: 'blue' },
    { label: '运动', value: `${d.exerciseCalories}`, unit: 'kcal', tone: 'amber' },
    { label: '实际缺口', value: '--', unit: '待完成', tone: 'pending' },
    { label: '目标摄入', value: `${d.targetIntake}`, unit: 'kcal', tone: 'ink' },
  ]

  return (
    <>
      <View className='today-pending-card'>
        <Text className='today-pending-title'>达成评估待完成</Text>
        <Text className='today-pending-value'>--</Text>
        <Text className='today-pending-text'>至少记录两餐后计算实际缺口与达成率，已知数据仍照常展示。</Text>
      </View>
      <View className='metric-row'>
        {metrics.map((metric) => (
          <View
            key={metric.label}
            className={`metric-item metric-item--${metric.tone} ${metric.label === '已摄入' ? 'metric-item--pressable' : ''}`}
            onClick={metric.label === '已摄入' ? onIntake : undefined}
          >
            <Text className='metric-label'>{metric.label}</Text>
            <Text className='metric-value'>{metric.value}</Text>
            <Text className='metric-unit'>{metric.unit}</Text>
          </View>
        ))}
      </View>
    </>
  )
}

function PendingStarReward() {
  const { totalStars } = useTodayData()

  return (
    <View className='star-card'>
      <View className='star-header'>
        <View className='star-icon-circle'>
          <Text className='star-icon'>★</Text>
        </View>
        <Text className='star-title'>今日之星</Text>
      </View>
      <View className='star-stats'>
        <View className='star-stat'>
          <Text className='star-stat-value'>--</Text>
          <Text className='star-stat-label'>今日待完成</Text>
        </View>
        <View className='star-stat'>
          <Text className='star-stat-value'>{totalStars}</Text>
          <Text className='star-stat-label'>累计星</Text>
        </View>
      </View>
      <View className='star-encourage'>
        <Text className='star-encourage-text'>记录至少两餐后评估今日星</Text>
      </View>
    </View>
  )
}

export default function TodayPage() {
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [partialFailures, setPartialFailures] = useState<string[]>([])
  const [hasCompleteMeals, setHasCompleteMeals] = useState(false)
  const [recordAction, setRecordAction] = useState<TodayRecordAction | null>(null)
  const recordActionRef = useRef<TodayRecordAction | null>(null)
  const loadSequence = useRef(0)
  const hasRenderedToday = useRef(false)

  useDidShow(() => {
    // Returning from the native camera/album also triggers didShow. Reloading here
    // would replace the ready page and unmount the pending recognition overlay.
    if (recordActionRef.current) return
    loadFromApi()
  })

  useDidHide(() => {
    loadSequence.current += 1
    // Native camera and album pickers hide the page while their promise is pending.
    // Keep the overlay mounted so the selected photo can finish recognition on return.
  })

  const showRecordAction = (action: TodayRecordAction) => {
    recordActionRef.current = action
    setRecordAction(action)
  }
  const closeRecordAction = () => {
    recordActionRef.current = null
    setRecordAction(null)
  }
  const openMeal = (slot: MealSlot) => showRecordAction({ type: 'meal', slot })
  const openMealPicker = () => showRecordAction({ type: 'mealPicker' })
  const openExercise = () => showRecordAction({ type: 'exercise' })
  const openWeight = () => showRecordAction({ type: 'weight' })
  const openPhoto = () => showRecordAction({ type: 'photo' })

  async function loadFromApi() {
    const sequence = ++loadSequence.current
    const blockingLoad = !hasRenderedToday.current
    if (blockingLoad) {
      resetTodayData()
      setPageState('loading')
      setHasCompleteMeals(false)
    }
    setPartialFailures([])
    let summaryRendered = false

    try {
      const authed = await ensureAuthReady()
      if (sequence !== loadSequence.current) return
      if (!authed) {
        if (blockingLoad) setPageState('error')
        else setPartialFailures(['今日摘要'])
        return
      }

      const summaryRes = await getDailySummary()
      if (sequence !== loadSequence.current) return
      if (!summaryRes.ok) {
        if (blockingLoad) setPageState('error')
        else setPartialFailures(['今日摘要'])
        return
      }

      if (!summaryRes.data.hasPlan) {
        setTodayData({
          apiLoaded: true,
          date: summaryRes.data.date ? formatDateLabel(summaryRes.data.date) : '',
        })
        hasRenderedToday.current = true
        setPageState('empty')
        return
      }

      const s = summaryRes.data
      const initialMealSlots = s.star?.recordedMealSlots ?? 0
      const initialRecordComplete = initialMealSlots >= 2
      const initialPatch: Partial<TodayStoreData> = {
        apiLoaded: true,
        date: s.date ? formatDateLabel(s.date) : '',
        consumed: s.intake?.totalKcal ?? 0,
        exerciseCalories: s.exercise?.totalKcal ?? 0,
        exerciseCaloriesTotal: s.exercise?.totalKcal ?? 0,
        remainingCalories: s.summary?.remainingIntakeKcal ?? 0,
        targetGap: -(s.summary?.actualDeficitKcal ?? 0),
        totalStars: s.star?.cumulativeStars ?? 0,
        consecutiveDays: s.star?.consecutiveDays ?? 0,
        tip: initialRecordComplete
          ? '今日摘要已更新，餐食和趋势明细正在同步。'
          : `已记录 ${initialMealSlots} 餐，至少完成两餐后再评估今天的摄入节奏。`,
        advice: initialRecordComplete && s.summary
          ? `今日缺口达成率 ${Math.round(s.summary.achievementRate * 100)}%。明细同步后会补充更完整的建议。`
          : '待完整记录：至少记录两餐后，才会生成今日达成情况与建议。',
      }
      if (s.plan) {
        initialPatch.baseExpenditure = s.plan.tdeeKcal
        initialPatch.targetIntake = s.plan.recommendedIntakeKcal
        initialPatch.suggestedRange = {
          min: Math.max(1200, Math.round(s.plan.recommendedIntakeKcal - 200)),
          max: Math.round(s.plan.recommendedIntakeKcal + 200),
        }
      }
      setTodayData(initialPatch)
      setHasCompleteMeals(initialRecordComplete)
      hasRenderedToday.current = true
      setPageState('ready')
      summaryRendered = true

      const [entitlementRes, planRes, mealsRes, exercisesRes, weightsRes] = await Promise.all([
        getEntitlement(),
        getCurrentPlan(),
        getMeals(),
        getExercises(),
        getWeights(isoDateOffset(-6), isoDateOffset(0)),
      ])
      if (sequence !== loadSequence.current) return

      const failures: string[] = []
      const patch: Partial<TodayStoreData> = { apiLoaded: true }

      if (entitlementRes.ok) {
        const eq = entitlementRes.data
        patch.entitlement = {
          pointBalance: eq.pointBalance,
          freeRemaining: eq.photoQuota.freeRemaining,
          freeUsed: eq.photoQuota.freeUsed,
          totalToday: eq.photoQuota.totalToday,
        }
      } else {
        failures.push('积分权益')
      }

      if (s.date) patch.date = formatDateLabel(s.date)
      if (s.plan) {
        patch.baseExpenditure = s.plan.tdeeKcal
        patch.targetIntake = s.plan.recommendedIntakeKcal
        patch.suggestedRange = {
          min: Math.max(1200, Math.round(s.plan.recommendedIntakeKcal - 200)),
          max: Math.round(s.plan.recommendedIntakeKcal + 200),
        }
      }
      const intake = s.intake ?? (mealsRes.ok ? mealsRes.data.totals : undefined)
      if (intake) patch.consumed = intake.totalKcal
      if (s.exercise) {
        patch.exerciseCalories = s.exercise.totalKcal
        patch.exerciseCaloriesTotal = s.exercise.totalKcal
      }
      if (s.summary) {
        patch.remainingCalories = s.summary.remainingIntakeKcal
        patch.targetGap = -s.summary.actualDeficitKcal
      }
      if (s.star) {
        patch.totalStars = s.star.cumulativeStars ?? 0
        patch.consecutiveDays = s.star.consecutiveDays ?? 0
      }

      if (intake) {
        const plan = planRes.ok ? planRes.data.plan : null
        patch.nutrients = [
          { name: '碳水化合物', current: Math.round(intake.carbG), target: plan ? Math.round((plan.carbMinG + plan.carbMaxG) / 2) : 0, unit: 'g', color: '#168a5b' },
          { name: '蛋白质', current: Math.round(intake.proteinG), target: plan ? Math.round((plan.proteinMinG + plan.proteinMaxG) / 2) : 0, unit: 'g', color: '#3d83b8' },
          { name: '脂肪', current: Math.round(intake.fatG), target: plan ? Math.round((plan.fatMinG + plan.fatMaxG) / 2) : 0, unit: 'g', color: '#d7921b' },
        ]
      }
      if (!planRes.ok) {
        failures.push('营养目标')
      }

      if (mealsRes.ok) {
        const bySlot = new Map<string, typeof mealsRes.data.meals>()
        mealsRes.data.meals.forEach((meal) => {
          const current = bySlot.get(meal.mealSlot) ?? []
          current.push(meal)
          bySlot.set(meal.mealSlot, current)
        })
        patch.meals = Object.entries(SLOT_META).map(([slot, meta]) => {
          const entries = bySlot.get(slot) ?? []
          const status = entries.some((meal) => meal.status === 'recorded')
            ? 'recorded'
            : entries.some((meal) => meal.status === 'fasting')
              ? 'fasting'
              : entries.some((meal) => meal.status === 'skipped')
                ? 'skipped'
                : 'unrecorded'
          return {
            id: meta.id,
            name: meta.name,
            emoji: '',
            calories: Math.round(entries.reduce((sum, meal) => sum + (meal.totalKcal || 0), 0)),
            recorded: status === 'recorded',
            status,
          }
        })
        patch.timeline = mealsRes.data.meals
          .filter((meal) => meal.status === 'recorded' && meal.items.length > 0)
          .map((meal) => {
            const meta = SLOT_META[meal.mealSlot] ?? SLOT_META.other
            return {
              id: meal.id,
              time: formatCreatedAt(meal.createdAt),
              meal: meta.name,
              emoji: '',
              calories: meal.totalKcal,
              items: meal.items.map((item) => item.foodName),
            }
          })
      } else {
        failures.push('餐食记录')
      }

      if (exercisesRes.ok) {
        const exercises = exercisesRes.data.exercises
        patch.exerciseCalories = exercisesRes.data.totalKcal
        patch.exerciseCaloriesTotal = exercisesRes.data.totalKcal
        patch.exerciseDuration = Math.round(exercises.reduce((sum, item) => sum + item.durationMin, 0))
        patch.exerciseType = [...new Set(exercises.map((item) => item.exerciseType))].slice(0, 2).join('、') || '尚未记录'
        patch.exerciseEntries = exercises.map((item) => ({
          id: item.id,
          exerciseType: item.exerciseType,
          durationMin: item.durationMin,
          kcal: item.confirmedKcal,
        }))
      } else {
        failures.push('运动记录')
      }

      if (weightsRes.ok) {
        const points = [...weightsRes.data.weights].sort((a, b) => a.date.localeCompare(b.date))
        if (points.length > 0) {
          patch.currentWeight = points[points.length - 1].weightKg
          patch.weightTrend = points.map((point) => ({ date: point.date, weight: point.weightKg }))
        }
      } else {
        failures.push('体重记录')
      }

      const fallbackMealSlots = mealsRes.ok
        ? new Set(mealsRes.data.meals
          .filter((meal) => ['breakfast', 'lunch', 'dinner'].includes(meal.mealSlot)
            && ['recorded', 'fasting'].includes(meal.status))
          .map((meal) => meal.mealSlot)).size
        : 0
      const recordedMealSlots = s.star?.recordedMealSlots ?? fallbackMealSlots
      const recordComplete = recordedMealSlots >= 2
      setHasCompleteMeals(recordComplete)

      if (!recordComplete) {
        patch.tip = `已记录 ${recordedMealSlots} 餐，至少完成两餐后再评估今天的摄入节奏。`
        patch.advice = '待完整记录：至少记录两餐后，才会生成今日达成情况与建议。'
      } else if (s.summary) {
        const rem = s.summary.remainingIntakeKcal
        if (rem > 200) {
          patch.tip = `今天还有约 ${rem} kcal 的安排空间，可以按饥饿感分配到剩余餐次。`
        } else if (rem > 0) {
          patch.tip = `今天的计划余量约 ${rem} kcal，按身体感受安排即可。`
        } else {
          patch.tip = `今天比计划多摄入约 ${Math.abs(rem)} kcal。单日波动很正常，继续按日常节奏记录即可。`
        }
        const rate = Math.round(s.summary.achievementRate * 100)
        const exerciseText = exercisesRes.ok ? `，运动消耗 ${exercisesRes.data.totalKcal} kcal` : ''
        patch.advice = `今日缺口达成率 ${rate}%${exerciseText}。${rate >= 80 ? '节奏很稳，保持现在的记录习惯。' : '不必追求单日完美，关注一段时间的平均趋势。'}`
      }

      setTodayData(patch)
      setPartialFailures(failures)
      setPageState('ready')
    } catch {
      if (sequence !== loadSequence.current) return
      if (summaryRendered) {
        setPartialFailures(['辅助数据'])
        return
      }
      if (blockingLoad) setPageState('error')
      else setPartialFailures(['今日摘要'])
    }
  }

  if (pageState !== 'ready') {
    return (
      <View className='today-page'>
        <View className='today-scroll'>
          <View className='today-state-card'>
            <View className={`today-state-mark today-state-mark--${pageState}`} />
            <Text className='today-state-title'>
              {pageState === 'loading' ? '正在同步今天的数据' : pageState === 'empty' ? '先建立你的减脂计划' : '暂时无法加载数据'}
            </Text>
            <Text className='today-state-text'>
              {pageState === 'loading'
                ? '很快就好'
                : pageState === 'empty'
                  ? '完成基础信息后，我们会计算更适合你的每日目标。'
                  : '请检查网络或云环境配置。当前页面已清空上一次快照。'}
            </Text>
            {pageState !== 'loading' && (
              <View
                className='today-state-action'
                onClick={() => pageState === 'empty'
                  ? Taro.navigateTo({ url: '/pages/onboarding/index' })
                  : loadFromApi()}
              >
                <Text className='today-state-action-text'>{pageState === 'empty' ? '开始制定计划' : '重新加载'}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='today-page'>
      <View className='today-scroll'>
        {partialFailures.length > 0 && (
          <View className='today-partial-notice'>
            <View className='today-partial-copy'>
              <Text className='today-partial-title'>部分数据未能更新</Text>
              <Text className='today-partial-text'>{partialFailures.join('、')}已清空，不会显示上一次内容。</Text>
            </View>
            <View className='today-partial-action' onClick={loadFromApi}>
              <Text>重试</Text>
            </View>
          </View>
        )}
        <HeaderSection onPhoto={openPhoto} />
        <CalorieBalanceCard />
        {hasCompleteMeals ? <MetricRow onIntake={openMealPicker} /> : <PartialDailyMetrics onIntake={openMealPicker} />}
        <MealQuickCards onSelect={openMeal} />

        <View className='today-exercise-row'>
          <View className='today-exercise-left'>
            <ExerciseCard onRecord={openExercise} />
          </View>
          <View className='today-right-stack'>
            {hasCompleteMeals ? <StarRewardCard /> : <PendingStarReward />}
            <WeightTrendCard onCheckin={openWeight} />
          </View>
        </View>

        <TipCard />
        <MacroSummaryCard />
        <MealTimelineCard />
        <QuickActionCards onWeight={openWeight} onPhoto={openPhoto} />
        <DailyAdviceCard />

        <View className='today-bottom-spacer' />
      </View>
      <TodayRecordOverlay
        action={recordAction}
        onClose={closeRecordAction}
        onSaved={loadFromApi}
      />
    </View>
  )
}
