import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { useApp } from '../state/AppStateProvider';
import * as api from '../api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 48;
const CHART_HEIGHT = 160;

const INTERVAL_OPTIONS = [
  { label: '7天', value: 7 },
  { label: '15天', value: 15 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
];

// ── Mock data generators ──────────────────────────────────────────

function mockWeightData(days: number) {
  const points: { date: string; weightKg: number }[] = [];
  const movingAverage: { date: string; weightKg: number }[] = [];
  const base = 73.5;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().slice(0, 10);
    const w = base - i * 0.06 + (Math.random() - 0.5) * 0.4;
    points.push({ date: dateStr, weightKg: Math.round(w * 10) / 10 });
    movingAverage.push({
      date: dateStr,
      weightKg: Math.round((base - i * 0.06) * 10) / 10,
    });
  }
  return { points, movingAverage, planTarget: 65, planStart: 73.5 };
}

function mockDeficitData(days: number): api.DeficitTrendResponse {
  const data: api.DeficitTrendResponse['data'] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const intake = 1000 + Math.round(Math.random() * 600);
    const exercise = Math.round(Math.random() * 300);
    data.push({
      date: d.toISOString().slice(0, 10),
      intakeKcal: intake,
      exerciseKcal: exercise,
      actualDeficitKcal: 1500 - intake + exercise,
      targetDeficitKcal: 500,
    });
  }
  return { data, targetDeficitKcal: 500 };
}

// ── Stats helpers (derived from data, not API fields) ─────────────

function deriveStats(data: api.DeficitTrendResponse['data']) {
  if (data.length === 0) return { avgIntake: 0, avgDeficit: 0, starDays: 0 };
  const avgIntake = Math.round(data.reduce((s, d) => s + d.intakeKcal, 0) / data.length);
  const avgDeficit = Math.round(data.reduce((s, d) => s + d.actualDeficitKcal, 0) / data.length);
  const starDays = data.filter((d) => d.actualDeficitKcal >= d.targetDeficitKcal).length;
  return { avgIntake, avgDeficit, starDays };
}

// ── Simple line chart ─────────────────────────────────────────────

function LineChart({
  data,
  average,
  target,
  height = CHART_HEIGHT,
  lineColor = '#4CAF50',
  avgColor = '#FF9800',
  targetColor = '#F44336',
}: {
  data: { date: string; value: number }[];
  average?: { date: string; value: number }[];
  target?: number;
  height?: number;
  lineColor?: string;
  avgColor?: string;
  targetColor?: string;
}) {
  if (data.length < 2) return null;

  const allValues = data.map((d) => d.value);
  if (average) allValues.push(...average.map((d) => d.value));
  if (target !== undefined) allValues.push(target);

  const minV = Math.min(...allValues) - 0.5;
  const maxV = Math.max(...allValues) + 0.5;
  const range = maxV - minV || 1;

  const toX = (i: number) => 30 + (i / (data.length - 1)) * (CHART_WIDTH - 50);
  const toY = (v: number) => 10 + ((maxV - v) / range) * (height - 30);

  return (
    <Svg width={CHART_WIDTH} height={height}>
      {target !== undefined && (
        <>
          <Line
            x1={30}
            y1={toY(target)}
            x2={CHART_WIDTH - 20}
            y2={toY(target)}
            stroke={targetColor}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <SvgText x={CHART_WIDTH - 18} y={toY(target) + 4} fontSize={9} fill={targetColor}>
            目标
          </SvgText>
        </>
      )}
      {data.map((d, i) => {
        if (i === 0) return null;
        return (
          <Line
            key={i}
            x1={toX(i - 1)}
            y1={toY(data[i - 1].value)}
            x2={toX(i)}
            y2={toY(d.value)}
            stroke={lineColor}
            strokeWidth={2}
          />
        );
      })}
      {data.map((d, i) => (
        <Circle key={`p${i}`} cx={toX(i)} cy={toY(d.value)} r={2.5} fill={lineColor} />
      ))}
      {average &&
        average.map((d, i) => {
          if (i === 0) return null;
          return (
            <Line
              key={`a${i}`}
              x1={toX(i - 1)}
              y1={toY(average[i - 1].value)}
              x2={toX(i)}
              y2={toY(d.value)}
              stroke={avgColor}
              strokeWidth={1.5}
              strokeDasharray="6,3"
            />
          );
        })}
    </Svg>
  );
}

// ── Bar chart for deficit ─────────────────────────────────────────

function BarChart({
  data,
  target,
  height = CHART_HEIGHT,
}: {
  data: { date: string; value: number }[];
  target?: number;
  height?: number;
}) {
  if (data.length === 0) return null;

  const allValues = data.map((d) => d.value);
  if (target !== undefined) allValues.push(target);
  const minV = Math.min(0, ...allValues);
  const maxV = Math.max(...allValues);
  const range = maxV - minV || 1;

  const barW = Math.max(4, (CHART_WIDTH - 50) / data.length - 2);
  const toX = (i: number) => 30 + (i / data.length) * (CHART_WIDTH - 50) + 1;
  const toY = (v: number) => 10 + ((maxV - v) / range) * (height - 30);
  const zeroY = toY(0);

  return (
    <Svg width={CHART_WIDTH} height={height}>
      {target !== undefined && (
        <>
          <Line
            x1={30}
            y1={toY(target)}
            x2={CHART_WIDTH - 20}
            y2={toY(target)}
            stroke="#F44336"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          <SvgText x={CHART_WIDTH - 18} y={toY(target) + 4} fontSize={9} fill="#F44336">
            目标
          </SvgText>
        </>
      )}
      <Line x1={30} y1={zeroY} x2={CHART_WIDTH - 20} y2={zeroY} stroke="#E0E0E0" strokeWidth={0.5} />
      {data.map((d, i) => {
        const y = toY(d.value);
        const barH = Math.abs(y - zeroY);
        const isPositive = d.value >= 0;
        return (
          <Rect
            key={i}
            x={toX(i)}
            y={isPositive ? y : zeroY}
            width={barW}
            height={Math.max(1, barH)}
            fill={d.value >= (target ?? 0) ? '#C8E6C9' : '#FFCDD2'}
            rx={2}
          />
        );
      })}
    </Svg>
  );
}

// ── TrendScreen ───────────────────────────────────────────────────

export default function TrendScreen() {
  const insets = useSafeAreaInsets();
  const { plan, isUsingMockData } = useApp();
  const [days, setDays] = useState(15);
  const [weightData, setWeightData] = useState<api.WeightTrendResponse | null>(null);
  const [deficitData, setDeficitData] = useState<api.DeficitTrendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (isUsingMockData) {
      setWeightData(mockWeightData(days));
      setDeficitData(mockDeficitData(days));
    } else {
      const [wRes, dRes] = await Promise.all([
        api.getWeightTrend(days),
        api.getDeficitTrend(days),
      ]);
      if (wRes.ok) setWeightData(wRes.data);
      else setWeightData(mockWeightData(days));
      if (dRes.ok) setDeficitData(dRes.data);
      else setDeficitData(mockDeficitData(days));
    }
    setLoading(false);
  }, [days, isUsingMockData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const weightPoints = weightData?.points.map((p) => ({ date: p.date, value: p.weightKg })) ?? [];
  const weightAvg = weightData?.movingAverage.map((p) => ({ date: p.date, value: p.weightKg })) ?? [];

  const deficitPoints = deficitData?.data.map((d) => ({ date: d.date, value: d.actualDeficitKcal })) ?? [];
  const intakePoints = deficitData?.data.map((d) => ({ date: d.date, value: d.intakeKcal })) ?? [];

  const stats = deficitData ? deriveStats(deficitData.data) : null;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>趋势</Text>
        <Text style={styles.headerSub}>查看你的体重和热量缺口变化</Text>
      </View>

      {/* Interval selector */}
      <View style={styles.intervalRow}>
        {INTERVAL_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.intervalBtn, days === opt.value && styles.intervalBtnActive]}
            onPress={() => setDays(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.intervalText, days === opt.value && styles.intervalTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Demo banner */}
      {isUsingMockData && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>📱 本地演示数据 · 连接服务器后显示真实数据</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>加载中…</Text>
          </View>
        )}

        {/* Weight chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>体重变化</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.legendText}>实际体重</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
              <Text style={styles.legendText}>移动均线</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
              <Text style={styles.legendText}>目标</Text>
            </View>
          </View>
          {weightData && (
            <View style={styles.chartSummary}>
              <Text style={styles.summaryItem}>
                起始 <Text style={styles.summaryBold}>{weightData.points[0]?.weightKg ?? '-'} kg</Text>
              </Text>
              <Text style={styles.summaryItem}>
                最新 <Text style={styles.summaryBold}>{weightData.points[weightData.points.length - 1]?.weightKg ?? '-'} kg</Text>
              </Text>
              {weightData.planTarget != null && (
                <Text style={styles.summaryItem}>
                  目标 <Text style={styles.summaryBold}>{weightData.planTarget} kg</Text>
                </Text>
              )}
            </View>
          )}
          <LineChart data={weightPoints} average={weightAvg} target={weightData?.planTarget ?? undefined} />
        </View>

        {/* Deficit bar chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>每日热量缺口</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#C8E6C9' }]} />
              <Text style={styles.legendText}>达标</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#C8E6C9' }]} />
              <Text style={styles.legendText}>达标</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FFCDD2' }]} />
              <Text style={styles.legendText}>未达标</Text>
            </View>
          </View>
          <BarChart data={deficitPoints} target={plan?.dailyDeficitTargetKcal} />
        </View>

        {/* Intake chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>每日摄入</Text>
          <LineChart
            data={intakePoints}
            target={plan?.recommendedIntakeKcal}
            lineColor="#2196F3"
            targetColor="#F44336"
          />
        </View>

        {/* Stats summary */}
        {stats && (
          <View style={styles.statsCard}>
            <Text style={styles.chartTitle}>统计摘要</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{stats.avgIntake}</Text>
                <Text style={styles.statLabel}>日均摄入</Text>
                <Text style={styles.statUnit}>kcal</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{stats.avgDeficit}</Text>
                <Text style={styles.statLabel}>日均缺口</Text>
                <Text style={styles.statUnit}>kcal</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: '#FF9800' }]}>
                  {stats.starDays}
                </Text>
                <Text style={styles.statLabel}>达标天数</Text>
                <Text style={styles.statUnit}>天</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: '#7C4DFF' }]}>
                  {deficitData?.data.length ?? 0}
                </Text>
                <Text style={styles.statLabel}>记录天数</Text>
                <Text style={styles.statUnit}>天</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FDF8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSub: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  intervalRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 8,
  },
  intervalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  intervalBtnActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  intervalText: {
    fontSize: 13,
    color: '#666',
  },
  intervalTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  demoBanner: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 6,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  demoText: {
    fontSize: 12,
    color: '#795548',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLine: {
    width: 12,
    height: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
    color: '#999',
  },
  chartSummary: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  summaryItem: {
    fontSize: 13,
    color: '#666',
  },
  summaryBold: {
    fontWeight: '700',
    color: '#333',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '40%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statNum: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statUnit: {
    fontSize: 10,
    color: '#ccc',
  },
});
