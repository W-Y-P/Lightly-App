import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ensureAuthReady, getCurrentPlan, PlanRecord } from '../../api/client'
import './index.scss'

/* ── Mock fallback (keeps page usable if API unavailable) ── */
const MOCK_PLAN = {
  currentWeight: 72.6,
  targetWeight: 65.0,
  weeklyLoss: 0.5,
  targetDate: '2026-09-15',
  bmr: 1620,
  tdee: 2268,
  dailyDeficit: 500,
  recommendedIntake: 1400,
  macros: {
    protein: { min: 86, max: 116 },
    carb: { min: 140, max: 175 },
    fat: { min: 31, max: 47 },
  },
  activityLevel: 1.4,
  activityLabel: '轻度活跃（每周运动 1-3 次）',
}

/* ── Activity level → label ── */
function activityLabel(level: number): string {
  if (level < 1.3) return '久坐（几乎不运动）'
  if (level < 1.45) return '轻度活跃（每周运动 1-3 次）'
  if (level < 1.65) return '中度活跃（每周运动 3-5 次）'
  if (level < 1.85) return '高度活跃（每周运动 6-7 次）'
  return '非常活跃（高强度体力活动）'
}

/* ── Plan shape used by the renderer ── */
interface PlanView {
  currentWeight: number
  targetWeight: number
  weeklyLoss: number
  targetDate: string
  bmr: number
  tdee: number
  dailyDeficit: number
  recommendedIntake: number
  macros: {
    protein: { min: number; max: number }
    carb: { min: number; max: number }
    fat: { min: number; max: number }
  }
  activityLevel: number
  activityLabel: string
}

function mapRecord(r: PlanRecord): PlanView {
  return {
    currentWeight: r.currentWeightKg,
    targetWeight: r.targetWeightKg,
    weeklyLoss: r.weeklyLossKg ?? 0.5,
    targetDate: r.targetDate ?? '—',
    bmr: r.bmrKcal,
    tdee: r.tdeeKcal,
    dailyDeficit: r.dailyDeficitTargetKcal,
    recommendedIntake: r.recommendedIntakeKcal,
    macros: {
      protein: { min: r.proteinMinG, max: r.proteinMaxG },
      carb: { min: r.carbMinG, max: r.carbMaxG },
      fat: { min: r.fatMinG, max: r.fatMaxG },
    },
    activityLevel: r.activityLevel,
    activityLabel: activityLabel(r.activityLevel),
  }
}

/* ── Component ── */
export default function PlanPage() {
  const [plan, setPlan] = useState<PlanView>(MOCK_PLAN)
  const [isMock, setIsMock] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const authed = await ensureAuthReady()
        if (!authed || cancelled) return

        const res = await getCurrentPlan()
        if (cancelled) return

        if (res.ok && res.data.plan) {
          setPlan(mapRecord(res.data.plan))
          setIsMock(false)
        } else {
          // No plan or API error → stay on mock, gentle hint
          Taro.showToast({ title: '暂无计划，展示示例数据', icon: 'none', duration: 2000 })
        }
      } catch {
        // Network / unexpected error → stay on mock
        if (!cancelled) {
          Taro.showToast({ title: '加载失败，使用示例数据', icon: 'none', duration: 2000 })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const progress =
    plan.currentWeight > plan.targetWeight
      ? ((plan.currentWeight - plan.targetWeight) / (plan.currentWeight + 5 - plan.targetWeight)) * 100
      : 100

  const handleEditGoal = () => {
    Taro.showToast({ title: '编辑目标', icon: 'none' })
  }

  const handleEditMacros = () => {
    Taro.showToast({ title: '调整营养素', icon: 'none' })
  }

  const handleGoOnboarding = () => {
    Taro.navigateTo({ url: '/pages/onboarding/index' })
  }

  const dots = [1.2, 1.375, 1.55, 1.725, 1.9]

  return (
    <View className='plan-page'>
      <View className='plan-scroll'>
        {/* Mock hint banner */}
        {isMock && !loading && (
          <View className='plan-mock-banner' onClick={handleGoOnboarding}>
            <Text className='plan-mock-text'>尚未创建个人计划，点击查看示例 →</Text>
          </View>
        )}

        {/* Goal card */}
        <View className='plan-goal-card'>
          <Text className='plan-goal-title'>🎯 减脂目标</Text>
          <View className='plan-goal-row'>
            <View className='plan-goal-item'>
              <Text className='plan-goal-value'>{plan.currentWeight}</Text>
              <Text className='plan-goal-label'>当前 (kg)</Text>
            </View>
            <View className='plan-goal-arrow'>
              <Text className='plan-goal-arrow-text'>→</Text>
            </View>
            <View className='plan-goal-item'>
              <Text className='plan-goal-value plan-goal-value--target'>{plan.targetWeight}</Text>
              <Text className='plan-goal-label'>目标 (kg)</Text>
            </View>
          </View>
          <View className='plan-progress-bg'>
            <View className='plan-progress-fill' style={{ width: `${Math.min(progress, 100)}%` }} />
          </View>
          <View className='plan-goal-meta'>
            <Text className='plan-meta-text'>每周减 {plan.weeklyLoss} kg</Text>
            <Text className='plan-meta-text'>预计 {plan.targetDate}</Text>
          </View>
          <View className='plan-edit-btn' onClick={handleEditGoal}>
            <Text className='plan-edit-text'>调整目标</Text>
          </View>
        </View>

        {/* Calorie card */}
        <View className='plan-card'>
          <Text className='plan-card-title'>🔥 每日热量</Text>
          <View className='plan-calorie-grid'>
            <View className='plan-calorie-item'>
              <Text className='plan-calorie-value' style={{ color: '#FF9800' }}>{plan.bmr}</Text>
              <Text className='plan-calorie-label'>基础代谢</Text>
            </View>
            <View className='plan-calorie-item'>
              <Text className='plan-calorie-value' style={{ color: '#2196F3' }}>{plan.tdee}</Text>
              <Text className='plan-calorie-label'>总消耗</Text>
            </View>
            <View className='plan-calorie-item'>
              <Text className='plan-calorie-value' style={{ color: '#E91E63' }}>-{plan.dailyDeficit}</Text>
              <Text className='plan-calorie-label'>目标缺口</Text>
            </View>
          </View>
          <View className='plan-recommended'>
            <Text className='plan-recommended-label'>建议每日摄入</Text>
            <Text className='plan-recommended-value'>{plan.recommendedIntake} kcal</Text>
          </View>
        </View>

        {/* Macros card */}
        <View className='plan-card'>
          <View className='plan-macro-header'>
            <Text className='plan-card-title'>📊 营养素分配</Text>
            <View className='plan-macro-edit' onClick={handleEditMacros}>
              <Text className='plan-macro-edit-text'>调整</Text>
            </View>
          </View>
          <View className='plan-macro-list'>
            {[
              { name: '蛋白质', ...plan.macros.protein, unit: 'g', color: '#2196F3' },
              { name: '碳水化合物', ...plan.macros.carb, unit: 'g', color: '#4CAF50' },
              { name: '脂肪', ...plan.macros.fat, unit: 'g', color: '#FF9800' },
            ].map(m => (
              <View key={m.name} className='plan-macro-item'>
                <View className='plan-macro-row'>
                  <Text className='plan-macro-name'>{m.name}</Text>
                  <Text className='plan-macro-range' style={{ color: m.color }}>{m.min}-{m.max} {m.unit}/天</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Activity card */}
        <View className='plan-card'>
          <Text className='plan-card-title'>🏃 活动水平</Text>
          <Text className='plan-activity-label'>{plan.activityLabel}</Text>
          <View className='plan-activity-bar'>
            {dots.map((level) => {
              const isActive = Math.abs(plan.activityLevel - level) < 0.1
              return (
                <View
                  key={level}
                  className={`plan-activity-dot ${isActive ? 'plan-activity-dot--active' : ''}`}
                />
              )
            })}
          </View>
          <View className='plan-activity-labels'>
            <Text className='plan-activity-text'>久坐</Text>
            <Text className='plan-activity-text'>活跃</Text>
            <Text className='plan-activity-text'>非常活跃</Text>
          </View>
        </View>

        {/* Health note */}
        <View className='plan-note'>
          <Text className='plan-note-icon'>💡</Text>
          <Text className='plan-note-text'>
            减脂速度建议控制在每周 0.5-1 kg，过快可能导致肌肉流失。请根据自身感受灵活调整。
          </Text>
        </View>

        <View className='plan-bottom-spacer' />
      </View>
    </View>
  )
}
