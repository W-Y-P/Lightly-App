import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './WeightTrendCard.scss'

export default function WeightTrendCard() {
  const { currentWeight, weightUnit, weightTrend } = useTodayData()
  const minW = Math.min(...weightTrend.map(p => p.weight))
  const maxW = Math.max(...weightTrend.map(p => p.weight))
  const range = maxW - minW || 1

  const handleCheckin = () => {
    console.log('weight checkin')
    Taro.showToast({ title: '体重打卡', icon: 'none' })
  }

  // Build simple bar chart
  const bars = weightTrend.map((p) => {
    const h = Math.max(((p.weight - minW) / range) * 60 + 20, 20)
    return { ...p, h }
  })

  return (
    <View className='weight-card' onClick={handleCheckin}>
      <View className='weight-header'>
        <View className='weight-icon-circle'>
          <Text className='weight-icon'>⚖️</Text>
        </View>
        <Text className='weight-title'>体重趋势</Text>
      </View>
      <View className='weight-current'>
        <Text className='weight-current-value'>{currentWeight}</Text>
        <Text className='weight-current-unit'>{weightUnit}</Text>
      </View>
      <View className='weight-bars'>
        {bars.map((p) => (
          <View key={p.date} className='weight-bar-col'>
            <View className='weight-bar' style={{ height: `${p.h}rpx` }} />
            <Text className='weight-bar-date'>{p.date.slice(5)}</Text>
          </View>
        ))}
      </View>
      <View className='weight-checkin-btn'>
        <Text className='weight-checkin-text'>去打卡</Text>
      </View>
    </View>
  )
}
