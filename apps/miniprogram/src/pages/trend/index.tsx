import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ensureAuthReady, getCurrentPlan, getDeficitTrend, getWeightTrend } from '../../api/client'
import './index.scss'

interface WeightPoint { date: string; value: number }
interface DeficitPoint { date: string; deficit: number }
interface ChartPoint { x: number; y: number }
interface DateRange { start: number; end: number }
type DataState = 'loading' | 'real' | 'empty' | 'failed'

const PLOT_WIDTH_RPX = 560
const WEIGHT_PLOT_HEIGHT_RPX = 300
const DEFICIT_PLOT_HEIGHT_RPX = 250

const PERIODS = [15, 30, 90]

function dateToDay(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isFinite(day) ? day : null
}

function selectedDateRange(days: number): DateRange {
  const now = new Date()
  const end = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return { start: end - (days - 1) * 86400000, end }
}

function displayDay(day: number): string {
  const date = new Date(day)
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`
}

function datePosition(date: string, range: DateRange): number {
  const day = dateToDay(date)
  if (day == null || range.end === range.start) return 50
  return Math.max(0, Math.min(100, ((day - range.start) / (range.end - range.start)) * 100))
}

function inDateRange(date: string, range: DateRange): boolean {
  const day = dateToDay(date)
  return day != null && day >= range.start && day <= range.end
}

function dateSpanDays(points: WeightPoint[]): number {
  if (points.length < 2) return 1
  const start = new Date(`${points[0].date.slice(0, 10)}T00:00:00`).getTime()
  const end = new Date(`${points[points.length - 1].date.slice(0, 10)}T00:00:00`).getTime()
  const days = Math.round((end - start) / 86400000)
  return Number.isFinite(days) && days > 0 ? days : Math.max(1, points.length - 1)
}

function movingAverage(points: WeightPoint[]): WeightPoint[] {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 2), index + 1)
    return {
      date: point.date,
      value: window.reduce((sum, item) => sum + item.value, 0) / window.length,
    }
  })
}

function mapToChart(points: WeightPoint[], min: number, max: number, dateRange: DateRange): ChartPoint[] {
  const range = max - min || 1
  return points.map((point) => ({
    x: datePosition(point.date, dateRange),
    y: ((point.value - min) / range) * 100,
  }))
}

function segmentStyle(from: ChartPoint, to: ChartPoint, heightRpx: number) {
  const dx = ((to.x - from.x) / 100) * PLOT_WIDTH_RPX
  const dy = ((to.y - from.y) / 100) * heightRpx
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = -(Math.atan2(dy, dx) * 180) / Math.PI
  return {
    left: `${from.x}%`,
    bottom: `${from.y}%`,
    width: `${length}rpx`,
    transform: `rotate(${angle}deg)`,
    transformOrigin: '0 50%',
  }
}

function rangeLabels(range: DateRange): string[] {
  return [range.start, range.start + (range.end - range.start) / 2, range.end].map(displayDay)
}

export default function TrendPage() {
  const [period, setPeriod] = useState(15)
  const [reloadKey, setReloadKey] = useState(0)
  const [weightData, setWeightData] = useState<WeightPoint[]>([])
  const [deficitData, setDeficitData] = useState<DeficitPoint[]>([])
  const [weightState, setWeightState] = useState<DataState>('loading')
  const [deficitState, setDeficitState] = useState<DataState>('loading')
  const [targetWeight, setTargetWeight] = useState<number | null>(null)
  const [targetDeficit, setTargetDeficit] = useState<number | null>(null)
  const [planUnavailable, setPlanUnavailable] = useState(false)
  const chartRange = useMemo(() => selectedDateRange(period), [period, reloadKey])

  useDidShow(() => {
    setReloadKey((key) => key + 1)
  })

  useEffect(() => {
    let active = true
    setWeightState('loading')
    setDeficitState('loading')
    setPlanUnavailable(false)

    ;(async () => {
      try {
        const authed = await ensureAuthReady()
        if (!authed) throw new Error('auth_unavailable')

        const [weightRes, deficitRes, planRes] = await Promise.all([
          getWeightTrend(period),
          getDeficitTrend(period),
          getCurrentPlan(),
        ])
        if (!active) return

        if (weightRes.ok) {
          const points = (weightRes.data.points || []).map((point) => ({
            date: point.date,
            value: Number(point.weightKg),
          }))
            .filter((point) => Number.isFinite(point.value) && inDateRange(point.date, chartRange))
            .sort((a, b) => a.date.localeCompare(b.date))
          setWeightData(points)
          setWeightState(points.length ? 'real' : 'empty')
        } else {
          setWeightData([])
          setWeightState('failed')
        }

        if (deficitRes.ok) {
          const points = (deficitRes.data.data || []).map((point) => ({
            date: point.date,
            deficit: Number(point.actualDeficitKcal),
          }))
            .filter((point) => Number.isFinite(point.deficit) && inDateRange(point.date, chartRange))
            .sort((a, b) => a.date.localeCompare(b.date))
          setDeficitData(points)
          setDeficitState(points.length ? 'real' : 'empty')
        } else {
          setDeficitData([])
          setDeficitState('failed')
        }

        if (planRes.ok && planRes.data.plan) {
          setTargetWeight(planRes.data.plan.targetWeightKg)
          setTargetDeficit(planRes.data.plan.dailyDeficitTargetKcal)
        } else {
          setTargetWeight(null)
          setTargetDeficit(null)
          setPlanUnavailable(!planRes.ok)
        }
      } catch {
        if (!active) return
        setWeightData([])
        setDeficitData([])
        setTargetWeight(null)
        setTargetDeficit(null)
        setPlanUnavailable(true)
        setWeightState('failed')
        setDeficitState('failed')
      }
    })()

    return () => { active = false }
  }, [chartRange, period, reloadKey])

  const averageData = useMemo(() => movingAverage(weightData), [weightData])
  const weightScale = useMemo(() => {
    const values = [...weightData.map((point) => point.value), ...averageData.map((point) => point.value)]
    if (targetWeight != null) values.push(targetWeight)
    const rawMin = values.length ? Math.min(...values) : 0
    const rawMax = values.length ? Math.max(...values) : 1
    const padding = Math.max(0.3, (rawMax - rawMin) * 0.08)
    return { min: rawMin - padding, max: rawMax + padding }
  }, [averageData, targetWeight, weightData])

  const weightPoints = mapToChart(weightData, weightScale.min, weightScale.max, chartRange)
  const averagePoints = mapToChart(averageData, weightScale.min, weightScale.max, chartRange)
  const targetWeightY = targetWeight == null
    ? null
    : ((targetWeight - weightScale.min) / (weightScale.max - weightScale.min || 1)) * 100

  const deficitScale = useMemo(() => {
    const values = deficitData.map((point) => point.deficit)
    if (targetDeficit != null) values.push(targetDeficit)
    const rawMin = Math.min(0, ...(values.length ? values : [0]))
    const rawMax = Math.max(1, ...(values.length ? values : [1]))
    const padding = Math.max(40, (rawMax - rawMin) * 0.08)
    return { min: rawMin < 0 ? rawMin - padding : 0, max: rawMax + padding }
  }, [deficitData, targetDeficit])

  const deficitRange = deficitScale.max - deficitScale.min || 1
  const deficitZeroY = ((0 - deficitScale.min) / deficitRange) * 100
  const targetDeficitY = targetDeficit == null ? null : ((targetDeficit - deficitScale.min) / deficitRange) * 100
  const weightChange = weightData.length > 1
    ? Number((weightData[weightData.length - 1].value - weightData[0].value).toFixed(1))
    : 0
  const weeklyChange = weightData.length > 1
    ? Number((weightChange / dateSpanDays(weightData) * 7).toFixed(1))
    : 0
  const averageDeficit = deficitData.length
    ? Math.round(deficitData.reduce((sum, point) => sum + point.deficit, 0) / deficitData.length)
    : 0
  const isLoading = weightState === 'loading' || deficitState === 'loading'

  const goRecord = () => Taro.switchTab({ url: '/pages/record/index' })

  return (
    <View className='trend-page'>
      <View className='trend-toolbar'>
        <View className='trend-period' aria-label='趋势时间范围'>
          {PERIODS.map((days) => (
            <View
              key={days}
              className={`trend-period-btn ${period === days ? 'trend-period-btn--active' : ''}`}
              onClick={() => setPeriod(days)}
            >
              <Text>{days}天</Text>
            </View>
          ))}
        </View>
      </View>

      {planUnavailable && !isLoading && (
        <View className='trend-notice'>
          <View className='trend-notice-copy'>
            <Text className='trend-notice-title'>计划目标暂时无法读取</Text>
            <Text className='trend-notice-text'>已读取的真实记录仍可查看，目标线将在恢复后显示。</Text>
          </View>
          <View className='trend-notice-action' onClick={() => setReloadKey((key) => key + 1)}>
            <Text>重试</Text>
          </View>
        </View>
      )}

      <View className='trend-card'>
        <View className='trend-card-header'>
          <View>
            <Text className='trend-card-title'>体重趋势</Text>
            <Text className='trend-card-caption'>短期起伏很常见，均线更适合看方向</Text>
          </View>
          {weightData.length > 0 && weightState !== 'loading' && (
            <View className='trend-current'>
              <Text className='trend-current-value'>{weightData[weightData.length - 1].value.toFixed(1)}</Text>
              <Text className='trend-current-unit'>kg</Text>
            </View>
          )}
        </View>

        {weightState === 'loading' ? (
          <View className='trend-loading'><View className='trend-loading-mark' /><Text>正在读取体重记录</Text></View>
        ) : weightState === 'failed' ? (
          <View className='trend-empty'>
            <Text className='trend-empty-title'>体重趋势读取失败</Text>
            <Text className='trend-empty-text'>请检查网络后重试，当前未展示任何替代数据。</Text>
            <View className='trend-empty-action' onClick={() => setReloadKey((key) => key + 1)}><Text>重新加载</Text></View>
          </View>
        ) : weightState === 'empty' ? (
          <View className='trend-empty'>
            <Text className='trend-empty-title'>这段时间还没有体重记录</Text>
            <Text className='trend-empty-text'>有记录后，这里会显示真实点位和变化方向。</Text>
            <View className='trend-empty-action' onClick={goRecord}><Text>记录体重</Text></View>
          </View>
        ) : (
          <>
            <View className='trend-weight-chart'>
              <View className='trend-y-label trend-y-label--top'><Text>{weightScale.max.toFixed(1)}</Text></View>
              <View className='trend-y-label trend-y-label--bottom'><Text>{weightScale.min.toFixed(1)}</Text></View>
              <View className='trend-plot trend-plot--weight'>
                <View className='trend-grid-line trend-grid-line--top' />
                <View className='trend-grid-line trend-grid-line--middle' />
                <View className='trend-grid-line trend-grid-line--bottom' />
                {targetWeightY != null && (
                  <View className='trend-target-line trend-target-line--weight' style={{ bottom: `${targetWeightY}%` }}>
                    <Text className='trend-target-label'>目标 {targetWeight?.toFixed(1)}</Text>
                  </View>
                )}
                {weightPoints.slice(0, -1).map((point, index) => (
                  <View key={`actual-line-${weightData[index].date}`} className='trend-segment trend-segment--actual' style={segmentStyle(point, weightPoints[index + 1], WEIGHT_PLOT_HEIGHT_RPX)} />
                ))}
                {averagePoints.slice(0, -1).map((point, index) => (
                  <View key={`average-line-${averageData[index].date}`} className='trend-segment trend-segment--average' style={segmentStyle(point, averagePoints[index + 1], WEIGHT_PLOT_HEIGHT_RPX)} />
                ))}
                {weightPoints.map((point, index) => (
                  <View key={`point-${weightData[index].date}`} className='trend-weight-point' style={{ left: `${point.x}%`, bottom: `${point.y}%` }} />
                ))}
              </View>
            </View>
            <View className='trend-x-axis'>
              {rangeLabels(chartRange).map((label, index) => <Text key={`${label}-${index}`}>{label}</Text>)}
            </View>
            <View className='trend-legend'>
              <View className='trend-legend-item'><View className='trend-legend-dot' /><Text>记录点</Text></View>
              <View className='trend-legend-item'><View className='trend-legend-line trend-legend-line--average' /><Text>3 点均线</Text></View>
              {targetWeight != null && <View className='trend-legend-item'><View className='trend-legend-line trend-legend-line--target' /><Text>目标线</Text></View>}
            </View>
            <View className='trend-summary'>
              <View className='trend-summary-item'><Text className='trend-summary-value'>{weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg</Text><Text className='trend-summary-label'>区间变化</Text></View>
              <View className='trend-summary-divider' />
              <View className='trend-summary-item'><Text className='trend-summary-value'>{weeklyChange > 0 ? '+' : ''}{weeklyChange.toFixed(1)} kg</Text><Text className='trend-summary-label'>折算周变化</Text></View>
            </View>
          </>
        )}
      </View>

      <View className='trend-card'>
        <View className='trend-card-header'>
          <View>
            <Text className='trend-card-title'>能量缺口</Text>
            <Text className='trend-card-caption'>不必每天完全一致，观察一段时间的平均即可</Text>
          </View>
          <Text className='trend-card-period'>近 {period} 天</Text>
        </View>

        {deficitState === 'loading' ? (
          <View className='trend-loading'><View className='trend-loading-mark' /><Text>正在读取饮食记录</Text></View>
        ) : deficitState === 'failed' ? (
          <View className='trend-empty'>
            <Text className='trend-empty-title'>能量缺口读取失败</Text>
            <Text className='trend-empty-text'>请检查网络后重试，当前未展示任何替代数据。</Text>
            <View className='trend-empty-action' onClick={() => setReloadKey((key) => key + 1)}><Text>重新加载</Text></View>
          </View>
        ) : deficitState === 'empty' ? (
          <View className='trend-empty'>
            <Text className='trend-empty-title'>这段时间还没有完整记录</Text>
            <Text className='trend-empty-text'>记录饮食后，实际缺口会在这里逐日出现。</Text>
            <View className='trend-empty-action' onClick={goRecord}><Text>开始记录</Text></View>
          </View>
        ) : (
          <>
            <View className='trend-deficit-chart'>
              <View className='trend-y-label trend-y-label--top'><Text>{Math.round(deficitScale.max)}</Text></View>
              <View className='trend-y-label trend-y-label--bottom'><Text>{Math.round(deficitScale.min)}</Text></View>
              <View className='trend-plot trend-plot--deficit'>
                <View className='trend-grid-line trend-grid-line--top' />
                <View className='trend-grid-line trend-grid-line--middle' />
                <View className='trend-grid-line trend-grid-line--bottom' />
                <View className='trend-zero-line' style={{ bottom: `${deficitZeroY}%` }} />
                {targetDeficitY != null && (
                  <View className='trend-target-line trend-target-line--deficit' style={{ bottom: `${targetDeficitY}%` }}>
                    <Text className='trend-target-label'>目标 {Math.round(targetDeficit || 0)}</Text>
                  </View>
                )}
                {deficitData.map((point) => {
                  const valueY = ((point.deficit - deficitScale.min) / deficitRange) * 100
                  const height = Math.abs(valueY - deficitZeroY) / 100 * DEFICIT_PLOT_HEIGHT_RPX
                  const x = datePosition(point.date, chartRange)
                  return (
                    <View
                      key={point.date}
                      className={`trend-deficit-bar ${point.deficit < 0 ? 'trend-deficit-bar--negative' : ''}`}
                      style={{ left: `${x}%`, bottom: `${Math.min(valueY, deficitZeroY)}%`, height: `${Math.max(4, height)}rpx` }}
                    />
                  )
                })}
              </View>
            </View>
            <View className='trend-x-axis'>
              {rangeLabels(chartRange).map((label, index) => <Text key={`${label}-${index}`}>{label}</Text>)}
            </View>
            <View className='trend-legend'>
              <View className='trend-legend-item'><View className='trend-legend-bar' /><Text>实际缺口</Text></View>
              {targetDeficit != null && <View className='trend-legend-item'><View className='trend-legend-line trend-legend-line--target' /><Text>目标缺口</Text></View>}
            </View>
            <View className='trend-summary'>
              <View className='trend-summary-item'><Text className='trend-summary-value'>{averageDeficit} kcal</Text><Text className='trend-summary-label'>有记录日均值</Text></View>
              <View className='trend-summary-divider' />
              <View className='trend-summary-item'><Text className='trend-summary-value'>{targetDeficit == null ? '未设置' : `${Math.round(targetDeficit)} kcal`}</Text><Text className='trend-summary-label'>每日目标</Text></View>
            </View>
          </>
        )}
      </View>

      <View className='trend-bottom-spacer' />
    </View>
  )
}
