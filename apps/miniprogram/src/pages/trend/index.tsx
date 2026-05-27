import { useState, useEffect, useCallback } from 'react'
import { View, Text } from '@tarojs/components'
import { ensureAuthReady, getWeightTrend, getDeficitTrend } from '../../api/client'
import './index.scss'

/* ── Types ── */
interface WeightPoint { date: string; value: number }
interface DeficitPoint { date: string; intake: number; exercise: number; deficit: number }

/* ── Mock fallback ── */
const MOCK_WEIGHT: WeightPoint[] = [
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

const MOCK_DEFICIT: DeficitPoint[] = [
  { date: '05/20', intake: 1200, exercise: 200, deficit: 468 },
  { date: '05/21', intake: 1350, exercise: 150, deficit: 368 },
  { date: '05/22', intake: 1100, exercise: 250, deficit: 618 },
  { date: '05/23', intake: 1400, exercise: 100, deficit: 268 },
  { date: '05/24', intake: 1250, exercise: 300, deficit: 518 },
  { date: '05/25', intake: 1150, exercise: 180, deficit: 498 },
  { date: '05/26', intake: 868, exercise: 210, deficit: 610 },
]

const PERIODS = [
  { key: 15, label: '15天' },
  { key: 30, label: '30天' },
  { key: 90, label: '90天' },
]

/** Format ISO date (YYYY-MM-DD) to MM/DD for display */
function fmtDate(d: string): string {
  if (d.length >= 10) return d.slice(5, 10).replace('-', '/')
  return d
}

/* ── Component ── */
export default function TrendPage() {
  const [period, setPeriod] = useState(15)
  const [weightData, setWeightData] = useState<WeightPoint[]>(MOCK_WEIGHT)
  const [deficitData, setDeficitData] = useState<DeficitPoint[]>(MOCK_DEFICIT)
  const [isMock, setIsMock] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async (days: number) => {
    setLoading(true)
    try {
      const authed = await ensureAuthReady()
      if (!authed) {
        setIsMock(true)
        return
      }

      const [wRes, dRes] = await Promise.all([
        getWeightTrend(days),
        getDeficitTrend(days),
      ])

      let usedReal = false

      if (wRes.ok && wRes.data.points && wRes.data.points.length > 0) {
        setWeightData(wRes.data.points.map(p => ({ date: fmtDate(p.date), value: p.weightKg })))
        usedReal = true
      } else {
        setWeightData(MOCK_WEIGHT)
      }

      if (dRes.ok && dRes.data.data && dRes.data.data.length > 0) {
        setDeficitData(dRes.data.data.map(d => ({
          date: fmtDate(d.date),
          intake: d.intakeKcal,
          exercise: d.exerciseKcal,
          deficit: d.actualDeficitKcal,
        })))
        usedReal = true
      } else {
        setDeficitData(MOCK_DEFICIT)
      }

      setIsMock(!usedReal)
    } catch {
      setWeightData(MOCK_WEIGHT)
      setDeficitData(MOCK_DEFICIT)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await fetchData(period)
      if (cancelled) return
    })()
    return () => { cancelled = true }
  }, [period, fetchData])

  const handlePeriod = (p: number) => {
    if (p !== period) setPeriod(p)
  }

  /* ── Compute stats from rendered data ── */
  const weightChange = weightData.length >= 2
    ? +(weightData[weightData.length - 1].value - weightData[0].value).toFixed(1)
    : 0
  const spanDays = weightData.length >= 2
    ? Math.max(1, weightData.length - 1)
    : 1
  const weeklyChange = +(weightChange / spanDays * 7).toFixed(1)
  const avgDeficit = deficitData.length > 0
    ? Math.round(deficitData.reduce((s, d) => s + d.deficit, 0) / deficitData.length)
    : 0

  /* ── Chart scales ── */
  const weightMin = Math.min(...weightData.map(p => p.value))
  const weightMax = Math.max(...weightData.map(p => p.value))
  const weightRange = weightMax - weightMin || 1

  const deficitMax = Math.max(
    ...deficitData.map(d => Math.max(d.intake, d.deficit)),
    1,
  )

  return (
    <View className='trend-page'>
      <View className='trend-scroll'>
        {/* Mock hint */}
        {isMock && !loading && (
          <View className='trend-mock-banner'>
            <Text className='trend-mock-text'>数据加载中失败，展示示例数据</Text>
          </View>
        )}

        {/* Period selector */}
        <View className='trend-period'>
          {PERIODS.map(p => (
            <View
              key={p.key}
              className={`trend-period-btn ${period === p.key ? 'trend-period-btn--active' : ''}`}
              onClick={() => handlePeriod(p.key)}
            >
              <Text className='trend-period-text'>{p.label}</Text>
            </View>
          ))}
        </View>

        {/* Weight trend card */}
        <View className='trend-card'>
          <View className='trend-card-header'>
            <Text className='trend-card-title'>📊 体重趋势</Text>
            <Text className='trend-card-value'>
              {weightData.length > 0 ? weightData[weightData.length - 1].value : '—'} kg
            </Text>
          </View>
          <View className='trend-chart'>
            {weightData.map((p) => {
              const h = Math.max(((p.value - weightMin) / weightRange) * 120 + 30, 30)
              return (
                <View key={p.date} className='trend-bar-col'>
                  <Text className='trend-bar-val'>{p.value}</Text>
                  <View className='trend-bar' style={{ height: `${h}rpx` }} />
                  <Text className='trend-bar-date'>{p.date}</Text>
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
            <Text className='trend-card-subtitle'>近 {period} 天</Text>
          </View>
          <View className='trend-chart'>
            {deficitData.map((d) => {
              const intakeH = Math.max((d.intake / deficitMax) * 120, 20)
              const deficitH = Math.max((d.deficit / deficitMax) * 120, 20)
              return (
                <View key={d.date} className='trend-group-col'>
                  <View className='trend-group-bars'>
                    <View className='trend-bar-intake' style={{ height: `${intakeH}rpx` }} />
                    <View className='trend-bar-deficit' style={{ height: `${deficitH}rpx` }} />
                  </View>
                  <Text className='trend-bar-date'>{d.date}</Text>
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

        {/* Stats summary — computed from rendered data */}
        <View className='trend-stats'>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: weightChange <= 0 ? '#4CAF50' : '#E91E63' }}>
              {weightChange > 0 ? '+' : ''}{weightChange}
            </Text>
            <Text className='trend-stat-label'>近 {period} 天变化 (kg)</Text>
          </View>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: '#2196F3' }}>
              {weeklyChange > 0 ? '+' : ''}{weeklyChange}
            </Text>
            <Text className='trend-stat-label'>周均变化 (kg)</Text>
          </View>
          <View className='trend-stat'>
            <Text className='trend-stat-value' style={{ color: '#FF9800' }}>{avgDeficit}</Text>
            <Text className='trend-stat-label'>日均缺口 (kcal)</Text>
          </View>
        </View>

        <View className='trend-bottom-spacer' />
      </View>
    </View>
  )
}
