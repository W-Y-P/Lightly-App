import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './DailyAdviceCard.scss'

export default function DailyAdviceCard() {
  const { advice } = useTodayData()

  return (
    <View className='advice-card'>
      <View className='advice-header'>
        <View className='advice-icon-circle'>
          <Text className='advice-icon'>✓</Text>
        </View>
        <Text className='advice-title'>今日总结与建议</Text>
      </View>
      <Text className='advice-text'>{advice}</Text>
    </View>
  )
}
