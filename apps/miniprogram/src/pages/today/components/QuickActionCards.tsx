import { View, Text } from '@tarojs/components'
import './QuickActionCards.scss'

interface QuickActionCardsProps {
  onWeight: () => void
  onPhoto: () => void
}

export default function QuickActionCards({ onWeight, onPhoto }: QuickActionCardsProps) {

  return (
    <View className='action-cards'>
      <View className='action-card' onClick={onWeight}>
        <View className='action-icon-circle action-icon--weight'>
          <Text className='action-icon'>kg</Text>
        </View>
        <Text className='action-title'>体重打卡</Text>
        <Text className='action-subtitle'>记录今日体重，追踪变化趋势</Text>
        <View className='action-btn action-btn--weight'>
          <Text className='action-btn-text'>去打卡</Text>
        </View>
      </View>
      <View className='action-card' onClick={onPhoto}>
        <View className='action-icon-circle action-icon--photo'>
          <View className='action-camera-lens' />
        </View>
        <Text className='action-title'>AI 拍照识别</Text>
        <Text className='action-subtitle'>拍照识别食物热量，更快更准记录</Text>
        <View className='action-btn action-btn--photo'>
          <Text className='action-btn-text'>去记录</Text>
        </View>
      </View>
    </View>
  )
}
