import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './MetricRow.scss'

export default function MetricRow() {
  const d = useTodayData()
  const items = [
    { label: '已摄入', value: `${d.consumed}`, unit: 'kcal', color: '#4CAF50' },
    { label: '基础消耗', value: `${d.baseExpenditure}`, unit: 'kcal', color: '#2196F3' },
    { label: '运动消耗', value: `${d.exerciseCalories}`, unit: 'kcal', color: '#FF9800' },
    { label: '目标缺口', value: `${d.targetGap}`, unit: 'kcal', color: '#E91E63' },
    { label: '目标摄入', value: `${d.targetIntake}`, unit: 'kcal', color: '#9C27B0' },
  ]

  return (
    <View className='metric-row'>
      {items.map((item) => (
        <View key={item.label} className='metric-item'>
          <Text className='metric-value' style={{ color: item.color }}>{item.value}</Text>
          <Text className='metric-label'>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}
