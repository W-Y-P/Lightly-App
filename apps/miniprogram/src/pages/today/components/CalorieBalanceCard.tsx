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
            <View className='calorie-ring-bg' />
            <View className='calorie-ring-progress' style={{
              background: `conic-gradient(#4CAF50 ${progress * 360}deg, rgba(255,255,255,0.6) ${progress * 360}deg)`
            }} />
            <View className='calorie-ring-inner'>
              <Text className='calorie-number'>{remainingCalories}</Text>
              <Text className='calorie-unit'>kcal</Text>
            </View>
          </View>
          <Text className='calorie-range'>建议范围 {suggestedRange.min}-{suggestedRange.max} kcal</Text>
        </View>
        <View className='calorie-card-right'>
          <View className='calorie-bubble'>
            <Text className='calorie-bubble-text'>做得不错，保持住哦！</Text>
          </View>
          <View className='calorie-emoji-row'>
            <Text className='calorie-emoji'>🥗</Text>
            <Text className='calorie-emoji-sm'>🥤</Text>
          </View>
        </View>
      </View>
    </View>
  )
}
