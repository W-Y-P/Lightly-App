import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

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

export default function PlanPage() {
  const progress = ((MOCK_PLAN.currentWeight - MOCK_PLAN.targetWeight) / (75 - MOCK_PLAN.targetWeight)) * 100

  const handleEditGoal = () => {
    console.log('edit goal')
    Taro.showToast({ title: '编辑目标', icon: 'none' })
  }

  const handleEditMacros = () => {
    console.log('edit macros')
    Taro.showToast({ title: '调整营养素', icon: 'none' })
  }

  return (
    <View className='plan-page'>
      <ScrollView className='plan-scroll' scrollY enhanced showScrollbar={false}>
        {/* Goal card */}
        <View className='plan-goal-card'>
          <Text className='plan-goal-title'>🎯 减脂目标</Text>
          <View className='plan-goal-row'>
            <View className='plan-goal-item'>
              <Text className='plan-goal-value'>{MOCK_PLAN.currentWeight}</Text>
              <Text className='plan-goal-label'>当前 (kg)</Text>
            </View>
            <View className='plan-goal-arrow'>
              <Text className='plan-goal-arrow-text'>→</Text>
            </View>
            <View className='plan-goal-item'>
              <Text className='plan-goal-value plan-goal-value--target'>{MOCK_PLAN.targetWeight}</Text>
              <Text className='plan-goal-label'>目标 (kg)</Text>
            </View>
          </View>
          <View className='plan-progress-bg'>
            <View className='plan-progress-fill' style={{ width: `${Math.min(progress, 100)}%` }} />
          </View>
          <View className='plan-goal-meta'>
            <Text className='plan-meta-text'>每周减 {MOCK_PLAN.weeklyLoss} kg</Text>
            <Text className='plan-meta-text'>预计 {MOCK_PLAN.targetDate}</Text>
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
              <Text className='plan-calorie-value' style={{ color: '#FF9800' }}>{MOCK_PLAN.bmr}</Text>
              <Text className='plan-calorie-label'>基础代谢</Text>
            </View>
            <View className='plan-calorie-item'>
              <Text className='plan-calorie-value' style={{ color: '#2196F3' }}>{MOCK_PLAN.tdee}</Text>
              <Text className='plan-calorie-label'>总消耗</Text>
            </View>
            <View className='plan-calorie-item'>
              <Text className='plan-calorie-value' style={{ color: '#E91E63' }}>-{MOCK_PLAN.dailyDeficit}</Text>
              <Text className='plan-calorie-label'>目标缺口</Text>
            </View>
          </View>
          <View className='plan-recommended'>
            <Text className='plan-recommended-label'>建议每日摄入</Text>
            <Text className='plan-recommended-value'>{MOCK_PLAN.recommendedIntake} kcal</Text>
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
              { name: '蛋白质', ...MOCK_PLAN.macros.protein, unit: 'g', color: '#2196F3' },
              { name: '碳水化合物', ...MOCK_PLAN.macros.carb, unit: 'g', color: '#4CAF50' },
              { name: '脂肪', ...MOCK_PLAN.macros.fat, unit: 'g', color: '#FF9800' },
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
          <Text className='plan-activity-label'>{MOCK_PLAN.activityLabel}</Text>
          <View className='plan-activity-bar'>
            {[1.2, 1.4, 1.6, 1.8, 2.0].map((level) => (
              <View
                key={level}
                className={`plan-activity-dot ${MOCK_PLAN.activityLevel === level ? 'plan-activity-dot--active' : ''}`}
              />
            ))}
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
      </ScrollView>
    </View>
  )
}
