import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './ExerciseCard.scss'

export default function ExerciseCard() {
  const d = useTodayData()

  const handleExercise = () => {
    Taro.setStorageSync('pendingRecordAction', { type: 'exercise' })
    Taro.switchTab({ url: '/pages/record/index' })
  }

  return (
    <View className='exercise-card' onClick={handleExercise}>
      <View className='exercise-header'>
        <View className='exercise-icon-circle'>
          <View className='exercise-icon-line' />
        </View>
        <Text className='exercise-title'>运动记录</Text>
        <Text className='exercise-link'>查看 ›</Text>
      </View>
      <View className='exercise-stats'>
        <View className='exercise-stat'>
          <Text className='exercise-stat-value'>{d.exerciseCaloriesTotal}</Text>
          <Text className='exercise-stat-unit'>kcal</Text>
        </View>
        <View className='exercise-divider' />
        <View className='exercise-stat'>
          <Text className='exercise-stat-value'>{d.exerciseDuration}</Text>
          <Text className='exercise-stat-unit'>分钟</Text>
        </View>
        <View className='exercise-divider' />
        <View className='exercise-stat'>
          <Text className='exercise-stat-value'>{d.exerciseType}</Text>
          <Text className='exercise-stat-unit'>类型</Text>
        </View>
      </View>
      <View className='exercise-status'>
        <View className='exercise-status-dot' />
        <Text className='exercise-status-text'>运动会按保守比例计入今日可吃余额</Text>
      </View>
    </View>
  )
}
