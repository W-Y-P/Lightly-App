import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './TipCard.scss'

export default function TipCard() {
  const { tip } = useTodayData()

  return (
    <View className='tip-card'>
      <View className='tip-header'>
        <Text className='tip-icon'>i</Text>
        <Text className='tip-title'>温馨提示</Text>
      </View>
      <Text className='tip-text'>{tip}</Text>
    </View>
  )
}
