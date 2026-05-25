import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import './index.scss'

interface TrendPoint {
  date: string
  value: number
}

const MOCK_WEIGHT: TrendPoint[] = [
  { date: '04/27', value: 74.2 },
  { date: '04/30', value: 74.0 },
  { date: '05/03', value: 73.8 },
  { date: '05/06', value: 73.5 },
  { date: '05/09', value: 73.3 },
  { date: '05/12', value: 73.5 },
  { date: '05/15', value: 73.0 },
  { date: '05/18', value: 72.8 },
  { date: '05/21', value: 72.7 },
  { date: '05/24', value: 72.6 },
  { date: '05/26', value: 72.6 },
]

const MOCK_DEFICIT: { date: string; intake: number; exercise: number; deficit: number }[] = [
  { date: '05/20', intake: 1200, exercise: 200, deficit: 468 },
  { date: '05/21', intake: 1350, exercise: 150, deficit: 368 },
  { date: '05/22', intake: 1100, exercise: 250, deficit: 618 },
  { date: '05/23', intake: 1400, exercise: 100, deficit: 268 },
  { date: '05/24', intake: 1250, exercise: 300, deficit: 518 },
  { date: '05/25', intake: 1150, exercise: 180, deficit: 498 },
  { date: '05/26', intake: 868, exercise: 210, deficit: 610 },
]

const PERIODS = [
  { key: '7', label: '7天' },
  { key: '14', label: '14天' },
  { key: '30', label: '30天' },
]

export default function TrendPage() {
  const [period, setPeriod] = useState('30')

  const weightMin = Math.min(...MOCK_WEIGHT.map(p => p.value))
  const weightMax = Math.max(...MOCK_WEIGHT.map(p => p.value))
  const weightRange = weightMax - weightMin || 1

  const deficitMax = Math.max(...MOCK_DEFICIT.map(d => Math.max(d.intake, d.deficit)))

  return (
    <View className='trend-page'>
      <ScrollView className='trend-scroll' scrollY enhanced showScrollbar={false}>
        {/* Period selector */}
        <View className='trend-period'>
          {PERIODS.map(p => (
            <View
              key={p.key}
              className={`trend-period-btn ${period === p.key ? 'trend-period-btn--active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              <Text className='trend-period-text'>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Weight trend card */}
        <View className='trend-card'>
          <View className='trend-card-header'>
            <Text className='trend-card-title'>📊 体重趋势</Text>
            <Text className='trend-card-value'>{MOCK_WEIGHT[MOCK_WEIGHT.length - 1].value} kg</Text>
          </View>
          <View className='trend-chart'>
            {MOCK_WEIGHT.map((p) => {
              const h = Math.max(((p.value - weightMin) / weightRange) * 120 + 30, 30)
              return (
                <View key={p.date} className='trend-bar-col'>
                  <Text className='trend-bar-val'>{p.value}</Text>
                  <View className='trend-bar' style={{ height: `${h}rpx` }} />
                  <Text className='trend-bar-date'>{p.date.slice(5)}</Text>
                </View>
              )
            })}
          </View>
          <View className='trend-legend'>
            <View className='trend-legend-item'>
              <View className='trend-legend-dot' style={{ background: '#4CAF50' }} />
              <Text className='trend-legend-text'>体重</Text>
            </View>
            <View className='trend-legend-item'>
              <View className='trend-legend-dot' style={{ background: '#FF9800' }} />
              <Text className='trend-legend-text'>均线</Text>
            </View>
          </View>
        </View>

        {/* Deficit trend card */}
        <View className='trend-card'>
          <View className='trend-card-header'>
            <Text className='trend-card-title'>🔥 热量缺口趋势</Text>
            <Text className='trend-card-subtitle'>近 7 天</Text>
          </View>
          <View className='trend-chart'>
            {MOCK_DEFICIT.map((d) => {
              const intakeH = Math.max((d.intake / deficitMax) * 120, 20)
              const deficitH = Math.max((d.deficit / deficitMax) * 120, 20)
              return (
                <View key={d.date} className='trend-group-col'>
                  <View className='trend-group-bars'>
                    <View className='trend-bar-intake' style={{ height: `${intakeH}rpx` }} />
                    <View className='trend-bar-deficit' style={{ height: `${deficitH}rpx` }} />
                  </View>
                  <Text className='trend-bar-date'>{d.date.slice(5)}</Text>
                </View>
              )
            })}
          </View>
          <View className='trend-legend'>
            <View className='trend-legend-item'>
              <View className='trend-legend-dot' style={{ background: '#2196F3' }} />
              <Text className='trend-legend-text'>摄入</Text>
            </View>
            <View className='trend-legend-item'>
              <View className='trend-legend-dot' style={{ background: '#4CAF50' }} />
              <Text className='trend-legend-text'>缺口</Text>
            </View>
          </View>
        </View>

        {/* Stats summary */}
        <View className='trend-stats'>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: '#4CAF50' }}>-1.6</Text>
            <Text className='trend-stat-label'>近 30 天变化 (kg)</Text>
          </View>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: '#2196F3' }}>0.5</Text>
            <Text className='trend-stat-label'>周均减重 (kg)</Text>
          </View>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: '#FF9800' }}>455</Text>
            <Text className='trend-stat-label'>日均缺口 (kcal)</Text>
          </View>
        </View>

        <View className='trend-bottom-spacer' />
      </ScrollView>
    </View>
  )
}
