import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './QuickActionCards.scss'

export default function QuickActionCards() {
  const { entitlement } = useTodayData()

  const handleWeight = () => {
    console.log('weight checkin')
    Taro.showToast({ title: '体重打卡', icon: 'none' })
  }

  const handlePhoto = () => {
    if (!entitlement) {
      Taro.showToast({ title: '正在加载额度信息…', icon: 'none' })
      return
    }

    const { freeRemaining, pointBalance } = entitlement

    if (freeRemaining > 0) {
      Taro.showModal({
        title: 'AI 拍照识别',
        content: `今日还有 ${freeRemaining} 次免费识别机会，是否使用？（拍照功能开发中）`,
        showCancel: true,
        confirmText: '好的',
      })
    } else if (pointBalance > 0) {
      Taro.showModal({
        title: 'AI 拍照识别',
        content: `今日免费次数已用完。可使用 1 积分兑换额外识别次数（当前积分：${pointBalance}）。拍照功能开发中。`,
        showCancel: true,
        confirmText: '了解',
      })
    } else {
      Taro.showModal({
        title: 'AI 拍照识别',
        content: '今日免费次数已用完，且积分不足。坚持每日打卡达标即可获取积分奖励！',
        showCancel: false,
        confirmText: '知道了',
      })
    }
  }

  return (
    <View className='action-cards'>
      <View className='action-card' onClick={handleWeight}>
        <View className='action-icon-circle action-icon--weight'>
          <Text className='action-icon'>⚖️</Text>
        </View>
        <Text className='action-title'>体重打卡</Text>
        <Text className='action-subtitle'>记录今日体重，追踪变化趋势</Text>
        <View className='action-btn action-btn--weight'>
          <Text className='action-btn-text'>去打卡</Text>
        </View>
      </View>
      <View className='action-card' onClick={handlePhoto}>
        <View className='action-icon-circle action-icon--photo'>
          <Text className='action-icon'>📸</Text>
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
