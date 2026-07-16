import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './MealTimelineCard.scss'

export default function MealTimelineCard() {
  const { timeline } = useTodayData()

  return (
    <View className='timeline-card'>
      <View className='timeline-header'>
        <Text className='timeline-title'>今日饮食明细</Text>
        <Text className='timeline-count'>{timeline.length} 条</Text>
      </View>
      <View className='timeline-list'>
        {timeline.length === 0 && (
          <View className='timeline-empty'>
            <Text className='timeline-empty-title'>还没有饮食记录</Text>
            <Text className='timeline-empty-text'>从上方餐段开始记录今天的第一餐</Text>
          </View>
        )}
        {timeline.map((item, idx) => (
          <View key={item.id} className='timeline-item'>
            <View className='timeline-dot-col'>
              <View className='timeline-dot' />
              {idx < timeline.length - 1 && <View className='timeline-line' />}
            </View>
            <View className='timeline-content'>
              <View className='timeline-row'>
                <Text className='timeline-meal'>{item.meal}</Text>
                <Text className='timeline-time'>{item.time}</Text>
                <Text className='timeline-kcal'>{item.calories} kcal</Text>
              </View>
              <View className='timeline-items'>
                {item.items.map((food) => (
                  <Text key={food} className='timeline-food'>{food}</Text>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
      <View className='timeline-more' onClick={() => Taro.switchTab({ url: '/pages/record/index' })}>
        <Text className='timeline-more-text'>查看全部记录 ›</Text>
      </View>
    </View>
  )
}
