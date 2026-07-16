import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './QuickActionCards.scss'

export default function QuickActionCards() {
  const { entitlement } = useTodayData()

  const handleWeight = () => {
    Taro.setStorageSync('pendingRecordAction', { type: 'weight' })
    Taro.switchTab({ url: '/pages/record/index' })
  }

  const handlePhoto = () => {
    // If entitlement data is not loaded yet, let the record page handle quota
    if (!entitlement) {
      Taro.setStorageSync('pendingRecordAction', { type: 'meal', slot: 'other', mode: 'photo' })
      Taro.switchTab({ url: '/pages/record/index' })
      return
    }

    const { freeRemaining, pointBalance } = entitlement

    if (freeRemaining > 0) {
      // Has free quota → go to record page with photo mode
      Taro.setStorageSync('pendingRecordAction', { type: 'meal', slot: 'other', mode: 'photo' })
      Taro.switchTab({ url: '/pages/record/index' })
    } else if (pointBalance > 0) {
      // No free quota but has points → gentle prompt, then navigate on confirm
      Taro.showModal({
        title: 'AI 拍照识别',
        content: `今日免费识别已用完，可通过达标积分兑换额外次数。（当前积分：${pointBalance}）`,
        showCancel: true,
        confirmText: '去兑换',
        cancelText: '取消',
      }).then((res) => {
        if (res.confirm) {
          Taro.setStorageSync('pendingRecordAction', { type: 'meal', slot: 'other', mode: 'photo' })
          Taro.switchTab({ url: '/pages/record/index' })
        }
      })
    } else {
      // No free quota and no points
      Taro.showModal({
        title: 'AI 拍照识别',
        content: '今日免费识别已用完，可通过达标积分兑换额外次数。',
        showCancel: false,
        confirmText: '知道了',
      })
    }
  }

  return (
    <View className='action-cards'>
      <View className='action-card' onClick={handleWeight}>
        <View className='action-icon-circle action-icon--weight'>
          <Text className='action-icon'>kg</Text>
        </View>
        <Text className='action-title'>体重打卡</Text>
        <Text className='action-subtitle'>记录今日体重，追踪变化趋势</Text>
        <View className='action-btn action-btn--weight'>
          <Text className='action-btn-text'>去打卡</Text>
        </View>
      </View>
      <View className='action-card' onClick={handlePhoto}>
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
