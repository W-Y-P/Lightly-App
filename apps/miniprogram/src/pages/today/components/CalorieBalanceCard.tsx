import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './CalorieBalanceCard.scss'

export default function CalorieBalanceCard() {
  const { remainingCalories, suggestedRange, consumed, targetIntake } = useTodayData()
  const progress = targetIntake > 0 ? Math.min(consumed / targetIntake, 1) : 0

  return (
    <View className='calorie-card'>
      <Text className='calorie-card-title'>今日可吃余额</Text>
      <View className='calorie-card-body'>
        <View className='calorie-card-left'>
          <View className='calorie-ring'>
            <View className='calorie-ring-inner'>
              <Text className='calorie-number'>{remainingCalories}</Text>
              <Text className='calorie-unit'>kcal</Text>
            </View>
          </View>
          <View className='calorie-progress-track'>
            <View className='calorie-progress-fill' style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </View>
          <Text className='calorie-range'>建议摄入 {suggestedRange.min}-{suggestedRange.max} kcal</Text>
        </View>
        <View className='calorie-card-right'>
          <View className='calorie-bubble'>
            <Text className='calorie-bubble-kicker'>今日节奏</Text>
            <Text className='calorie-bubble-text'>按饥饿感安排剩余餐次</Text>
          </View>
          <View className='calorie-illustration'>
            <View className='calorie-bowl'>
              <View className='calorie-leaf calorie-leaf--one' />
              <View className='calorie-leaf calorie-leaf--two' />
              <View className='calorie-leaf calorie-leaf--three' />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
