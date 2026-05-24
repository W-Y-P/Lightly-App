import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mockTodayData } from '../mockTodayData';

interface Metric {
  label: string;
  value: string;
  color: string;
}

export default function MetricRow() {
  const { consumed, baseExpenditure, exerciseCalories, targetGap, targetIntake } = mockTodayData;

  const metrics: Metric[] = [
    { label: '已摄入', value: `${consumed}`, color: '#333' },
    { label: '基础消耗', value: `${baseExpenditure}`, color: '#333' },
    { label: '运动', value: `${exerciseCalories}`, color: '#4CAF50' },
    { label: '目标缺口', value: `${targetGap}`, color: '#FF5722' },
    { label: '目标摄入', value: `${targetIntake}`, color: '#333' },
  ];

  return (
    <View style={styles.container}>
      {metrics.map((m, index) => (
        <View key={index} style={styles.item}>
          <Text style={styles.label}>{m.label}</Text>
          <Text style={[styles.value, { color: m.color }]}>{m.value}</Text>
          <Text style={styles.unit}>kcal</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 4,
    gap: 4,
  },
  item: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  unit: {
    fontSize: 9,
    color: '#bbb',
    marginTop: 2,
  },
});
