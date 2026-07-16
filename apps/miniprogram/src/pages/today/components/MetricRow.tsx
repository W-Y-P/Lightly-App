import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './MetricRow.scss'

export default function MetricRow() {
  const d = useTodayData()
  const items = [
    { label: '已摄入', value: `${d.consumed}`, unit: 'kcal', tone: 'brand' },
    { label: '总消耗', value: `${d.baseExpenditure}`, unit: 'kcal', tone: 'blue' },
    { label: '运动', value: `${d.exerciseCalories}`, unit: 'kcal', tone: 'amber' },
    { label: '实际缺口', value: `${Math.abs(d.targetGap)}`, unit: 'kcal', tone: 'brand' },
    { label: '目标摄入', value: `${d.targetIntake}`, unit: 'kcal', tone: 'ink' },
  ]

  return (
    <View className='metric-row'>
      {items.map((item) => (
        <View key={item.label} className={`metric-item metric-item--${item.tone}`}>
          <Text className='metric-label'>{item.label}</Text>
          <Text className='metric-value'>{item.value}</Text>
          <Text className='metric-unit'>{item.unit}</Text>
        </View>
      ))}
    </View>
  )
}
