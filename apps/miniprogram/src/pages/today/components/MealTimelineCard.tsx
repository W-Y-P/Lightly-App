import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './MealTimelineCard.scss'

export default function MealTimelineCard() {
  const { timeline } = useTodayData()

  return (
    <View className='timeline-card'>
      <View className='timeline-header'>
        <Text className='timeline-icon'>📋</Text>
        <Text className='timeline-title'>今日饮食明细</Text>
      </View>
      <View className='timeline-list'>
        {timeline.map((item, idx) => (
          <View key={item.id} className='timeline-item'>
            <View className='timeline-dot-col'>
              <View className='timeline-dot' />
              {idx < timeline.length - 1 && <View className='timeline-line' />}
            </View>
            <View className='timeline-content'>
              <View className='timeline-row'>
                <Text className='timeline-emoji'>{item.emoji}</Text>
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
    </View>
  )
}
