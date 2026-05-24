import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingDown } from 'lucide-react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { mockTodayData } from '../mockTodayData';

export default function WeightTrendCard() {
  const { currentWeight, weightUnit, weightTrend } = mockTodayData;
  const weights = weightTrend.map((d) => d.weight);
  const minW = Math.min(...weights) - 0.5;
  const maxW = Math.max(...weights) + 0.5;
  const range = maxW - minW || 1;
  const chartW = 260;
  const chartH = 60;

  const points = weights.map((w, i) => {
    const x = (i / (weights.length - 1)) * chartW;
    const y = chartH - ((w - minW) / range) * chartH;
    return `${x},${y}`;
  }).join(' ');

  const lastX = ((weights.length - 1) / (weights.length - 1)) * chartW;
  const lastY = chartH - ((weights[weights.length - 1] - minW) / range) * chartH;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <TrendingDown size={22} color="#4CAF50" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>体重趋势</Text>
          <Text style={styles.currentWeight}>
            当前 <Text style={styles.weightNum}>{currentWeight}</Text> {weightUnit}
          </Text>
        </View>
      </View>
      <View style={styles.chartContainer}>
        <Svg width={chartW} height={chartH}>
          <Polyline
            points={points}
            fill="none"
            stroke="#4CAF50"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <Circle cx={lastX} cy={lastY} r={4} fill="#4CAF50" />
        </Svg>
        <View style={styles.dateRow}>
          {weightTrend.map((d) => (
            <Text key={d.date} style={styles.dateLabel}>{d.date.slice(3)}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  currentWeight: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  weightNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2E7D32',
  },
  chartContainer: {
    alignItems: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 260,
    marginTop: 6,
  },
  dateLabel: {
    fontSize: 10,
    color: '#aaa',
  },
});
