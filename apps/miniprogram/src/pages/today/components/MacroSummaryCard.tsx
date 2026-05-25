import { View, Text } from '@tarojs/components'
import { useTodayData } from '../../../store/todayDataStore'
import './MacroSummaryCard.scss'

export default function MacroSummaryCard() {
  const { nutrients } = useTodayData()

  return (
    <View className='macro-card'>
      <View className='macro-header'>
        <Text className='macro-icon'>📊</Text>
        <Text className='macro-title'>三大营养素</Text>
      </View>
      <View className='macro-list'>
        {nutrients.map((n) => {
          const pct = n.target > 0 ? Math.round((n.current / n.target) * 100) : 0
          return (
            <View key={n.name} className='macro-item'>
              <View className='macro-item-header'>
                <Text className='macro-name'>{n.name}</Text>
                <Text className='macro-amount'>{n.current} / {n.target} {n.unit}</Text>
              </View>
              <View className='macro-bar-bg'>
                <View className='macro-bar-fill' style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: n.color }} />
              </View>
              <Text className='macro-pct' style={{ color: n.color }}>{pct}%</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
