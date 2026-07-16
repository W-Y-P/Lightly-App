import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './StarRewardCard.scss'

export default function StarRewardCard() {
  const { consecutiveDays, totalStars } = useTodayData()

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
          <Text className='star-stat-value'>{consecutiveDays}</Text>
          <Text className='star-stat-label'>连续达标天</Text>
        </View>
        <View className='star-stat'>
          <Text className='star-stat-value'>{totalStars}</Text>
          <Text className='star-stat-label'>累计星</Text>
        </View>
      </View>
      <View className='star-encourage'>
        <Text className='star-encourage-text'>达成 80% 且记录两餐即可获得</Text>
      </View>
    </View>
  )
}
