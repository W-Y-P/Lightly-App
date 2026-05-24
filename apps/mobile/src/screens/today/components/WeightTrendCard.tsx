import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingDown } from 'lucide-react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { mockTodayData } from '../mockTodayData';

export default function WeightTrendCard() {
  const { currentWeight, weightUnit, weightTrend } = mockTodayData;
  const weights = weightTrend.map((d) => d.weight);
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const delta = firstWeight - lastWeight;
  const minW = Math.min(...weights) - 0.3;
  const maxW = Math.max(...weights) + 0.3;
  const range = maxW - minW || 1;
  const chartW = 200;
  const chartH = 48;

  const points = weights
    .map((w, i) => {
      const x = (i / (weights.length - 1)) * chartW;
      const y = chartH - ((w - minW) / range) * chartH;
      return `${x},${y}`;
    })
    .join(' ');

  const lastX = chartW;
  const lastY = chartH - ((lastWeight - minW) / range) * chartH;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>体重趋势</Text>
        <View style={styles.weightBadge}>
          <Text style={styles.weightNum}>{currentWeight}</Text>
          <Text style={styles.weightUnit}> {weightUnit}</Text>
        </View>
      </View>

      <View style={styles.chartArea}>
        <Svg width={chartW} height={chartH}>
          {/* Grid lines */}
          <Line x1={0} y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#F0F0F0" strokeWidth={1} />
          <Polyline points={points} fill="none" stroke="#4CAF50" strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={lastX} cy={lastY} r={3.5} fill="#4CAF50" />
        </Svg>
      </View>

      <View style={styles.dateRow}>
        {weightTrend.map((d) => (
          <Text key={d.date} style={styles.dateLabel}>
            {d.date.slice(3)}
          </Text>
        ))}
      </View>

      <View style={styles.footer}>
        <TrendingDown size={14} color="#4CAF50" />
        <Text style={styles.footerText}>近7天 ↓ {delta.toFixed(1)} {weightUnit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  weightNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
  },
  weightUnit: {
    fontSize: 12,
    color: '#888',
  },
  chartArea: {
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  dateLabel: {
    fontSize: 9,
    color: '#bbb',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
});
