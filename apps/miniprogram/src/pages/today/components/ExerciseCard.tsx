import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import { openRecord } from '../../../utils/recordIntent'
import './ExerciseCard.scss'

export default function ExerciseCard() {
  const d = useTodayData()

  const handleExercise = () => {
    openRecord({ type: 'exercise' })
  }

  return (
    <View className='exercise-card' onClick={handleExercise}>
      <View className='exercise-header'>
        <View className='exercise-icon-circle'>
          <View className='exercise-icon-line' />
        </View>
        <Text className='exercise-title'>运动记录</Text>
        <Text className='exercise-link'>记录 ›</Text>
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
