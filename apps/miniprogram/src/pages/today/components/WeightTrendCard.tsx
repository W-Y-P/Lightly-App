import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import { openRecord } from '../../../utils/recordIntent'
import './WeightTrendCard.scss'

export default function WeightTrendCard() {
  const { currentWeight, weightUnit, weightTrend } = useTodayData()
  const minW = weightTrend.length > 0 ? Math.min(...weightTrend.map(p => p.weight)) : 0
  const maxW = weightTrend.length > 0 ? Math.max(...weightTrend.map(p => p.weight)) : 0
  const range = maxW - minW || 1

  const handleTrend = () => void Taro.switchTab({ url: '/pages/trend/index' })

  const handleCheckin = (event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.()
    openRecord({ type: 'weight' })
  }

  // Build simple bar chart
  const bars = weightTrend.map((p) => {
    const h = Math.max(((p.weight - minW) / range) * 60 + 20, 20)
    return { ...p, h }
  })

  return (
    <View className='weight-card' onClick={handleTrend}>
      <View className='weight-header'>
        <Text className='weight-title'>体重趋势</Text>
        <View className='weight-link' onClick={handleCheckin}><Text>记录 ›</Text></View>
      </View>
      <View className='weight-current'>
        <Text className='weight-current-value'>{currentWeight > 0 ? currentWeight : '--'}</Text>
        <Text className='weight-current-unit'>{weightUnit}</Text>
      </View>
      <View className='weight-bars'>
        {bars.length === 0 && <Text className='weight-empty'>记录体重后显示近 7 天趋势</Text>}
        {bars.map((p) => (
          <View key={p.date} className='weight-bar-col'>
            <View className='weight-bar' style={{ height: `${p.h}rpx` }} />
            <Text className='weight-bar-date'>{p.date.slice(5)}</Text>
          </View>
        ))}
      </View>
      <Text className='weight-note'>建议固定早晨空腹称重</Text>
    </View>
  )
}
