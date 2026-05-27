import { View } from '@tarojs/components'
import { useEffect } from 'react'
import { getDailySummary, getEntitlement, getCurrentPlan, ensureAuthReady } from '../../api/client'
import { setTodayData } from '../../store/todayDataStore'
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
import './index.scss'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const m = d.getMonth() + 1
  const day = d.getDate()
  const w = WEEKDAYS[d.getDay()]
  return `${m}月${day}日 星期${w}`
}

export default function TodayPage() {
  useEffect(() => {
    loadFromApi()
  }, [])

  async function loadFromApi() {
    try {
      // Wait for auth before hitting authenticated endpoints
      const authed = await ensureAuthReady()
      if (!authed) {
        console.warn('[Today] auth failed, using mock data')
        setTodayData({ apiLoaded: true })
        return
      }

      const [summaryRes, entitlementRes, planRes] = await Promise.all([
        getDailySummary(),
        getEntitlement(),
        getCurrentPlan(),
      ])

      // Entitlement (points + photo quota) — always update
      if (entitlementRes.ok) {
        const eq = entitlementRes.data
        setTodayData({
          entitlement: {
            pointBalance: eq.pointBalance,
            freeRemaining: eq.photoQuota.freeRemaining,
            freeUsed: eq.photoQuota.freeUsed,
            totalToday: eq.photoQuota.totalToday,
          },
        })
      }

      // Daily summary
      if (summaryRes.ok && summaryRes.data.hasPlan) {
        const s = summaryRes.data
        const patch: Record<string, unknown> = { apiLoaded: true }

        if (s.date) {
          patch.date = formatDateLabel(s.date)
        }

        if (s.plan) {
          patch.baseExpenditure = s.plan.tdeeKcal
          patch.targetIntake = s.plan.recommendedIntakeKcal
          patch.suggestedRange = {
            min: Math.round(s.plan.recommendedIntakeKcal * 0.85),
            max: Math.round(s.plan.recommendedIntakeKcal * 1.15),
          }
        }

        if (s.intake) {
          patch.consumed = s.intake.totalKcal
          // Update nutrients current values
          const plan = planRes.ok ? planRes.data.plan : null
          patch.nutrients = [
            { name: '碳水化合物', current: Math.round(s.intake.carbG), target: plan ? Math.round((plan.carbMinG + plan.carbMaxG) / 2) : 180, unit: 'g', color: '#4CAF50' },
            { name: '蛋白质', current: Math.round(s.intake.proteinG), target: plan ? Math.round((plan.proteinMinG + plan.proteinMaxG) / 2) : 80, unit: 'g', color: '#2196F3' },
            { name: '脂肪', current: Math.round(s.intake.fatG), target: plan ? Math.round((plan.fatMinG + plan.fatMaxG) / 2) : 50, unit: 'g', color: '#FF9800' },
          ]
        }

        if (s.exercise) {
          patch.exerciseCalories = s.exercise.totalKcal
          patch.exerciseCaloriesTotal = s.exercise.totalKcal
        }

        if (s.summary) {
          patch.remainingCalories = s.summary.remainingIntakeKcal
          patch.targetGap = -s.summary.actualDeficitKcal
        }

        if (s.star) {
          patch.totalStars = s.pointBalance ?? 0
        }

        // Build tip/advice from actual data
        if (s.summary) {
          const rem = s.summary.remainingIntakeKcal
          if (rem > 200) {
            patch.tip = `今日还可摄入约 ${rem} kcal，合理分配到剩余餐次中～`
          } else if (rem > 0) {
            patch.tip = `今日余额仅剩 ${rem} kcal，注意控制哦～`
          } else {
            patch.tip = `今日摄入已超标 ${Math.abs(rem)} kcal，明天继续加油！`
          }
          const rate = Math.round(s.summary.achievementRate * 100)
          const exKcal = s.exercise?.totalKcal ?? 0
          patch.advice = `今日缺口达成率 ${rate}%，运动消耗 ${exKcal} kcal。${rate >= 80 ? '继续保持！' : '还有进步空间，加油！'}`
        }

        setTodayData(patch)
      } else {
        // No plan or API error — keep mock data, mark as loaded
        setTodayData({ apiLoaded: true })
      }
    } catch {
      console.warn('[Today] API fetch failed, using mock data')
      setTodayData({ apiLoaded: true })
    }
  }

  return (
    <View className='today-page'>
      <View className='today-scroll'>
        <HeaderSection />
        <CalorieBalanceCard />
        <MetricRow />
        <MealQuickCards />

        <View className='today-exercise-row'>
          <View className='today-exercise-left'>
            <ExerciseCard />
          </View>
          <View className='today-right-stack'>
            <StarRewardCard />
            <WeightTrendCard />
          </View>
        </View>

        <TipCard />
        <MacroSummaryCard />
        <MealTimelineCard />
        <QuickActionCards />
        <DailyAdviceCard />

        <View className='today-bottom-spacer' />
      </View>
    </View>
  )
}
