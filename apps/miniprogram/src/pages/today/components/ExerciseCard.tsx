import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodayData } from '../../../store/todayDataStore'
import './ExerciseCard.scss'

export default function ExerciseCard() {
  const d = useTodayData()

  const handleExercise = () => {
    console.log('exercise record')
    Taro.showToast({ title: '运动记录', icon: 'none' })
  }

  return (
    <View className='exercise-card' onClick={handleExercise}>
      <View className='exercise-header'>
        <View className='exercise-icon-circle'>
          <Text className='exercise-icon'>🏃</Text>
        </View>
        <Text className='exercise-title'>运动记录</Text>
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
      <View className='exercise-btn'>
        <Text className='exercise-btn-text'>去记录</Text>
      </View>
    </View>
  )
}
