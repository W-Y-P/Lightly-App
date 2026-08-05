import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './ExerciseCard.scss'

interface ExerciseCardProps {
  onRecord: () => void
}

export default function ExerciseCard({ onRecord }: ExerciseCardProps) {
  const d = useTodayData()

  return (
    <View className='exercise-card' onClick={onRecord}>
      <View className='exercise-header'>
        <View className='exercise-icon-circle'>
          <View className='exercise-icon-line' />
        </View>
        <Text className='exercise-title'>运动记录</Text>
        <Text className='exercise-link'>记录 ›</Text>
      </View>
      <View className='exercise-summary'>
        <Text className='exercise-summary-main'>{d.exerciseCaloriesTotal} kcal</Text>
        <Text className='exercise-summary-sub'>共 {d.exerciseDuration} 分钟</Text>
      </View>
      <View className='exercise-entry-list'>
        {d.exerciseEntries.length === 0 ? (
          <Text className='exercise-entry-empty'>还没有运动记录，点这里添加</Text>
        ) : d.exerciseEntries.map((entry) => (
          <View className='exercise-entry' key={entry.id}>
            <Text className='exercise-entry-name'>{entry.exerciseType}</Text>
            <Text className='exercise-entry-value'>{entry.durationMin} 分钟</Text>
            <Text className='exercise-entry-value exercise-entry-kcal'>{entry.kcal} kcal</Text>
          </View>
        ))}
      </View>
      <View className='exercise-status'>
        <View className='exercise-status-dot' />
        <Text className='exercise-status-text'>运动会按保守比例计入今日可吃余额</Text>
      </View>
    </View>
  )
}
