import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Droplets, Flame } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function MetricRow() {
  const { waterIntake, waterTarget, waterUnit, exerciseCaloriesTotal, exerciseDuration, exerciseType } = mockTodayData;
  const waterPercent = Math.round((waterIntake / waterTarget) * 100);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Droplets size={20} color="#2196F3" />
        </View>
        <Text style={styles.label}>饮水</Text>
        <Text style={styles.value}>{waterIntake}<Text style={styles.unit}>{waterUnit}</Text></Text>
        <View style={styles.miniBar}>
          <View style={[styles.miniBarFill, { width: `${waterPercent}%`, backgroundColor: '#2196F3' }]} />
        </View>
        <Text style={styles.subLabel}>目标 {waterTarget}{waterUnit}</Text>
      </View>

      <View style={styles.card}>
        <View style={[styles.iconCircle, { backgroundColor: '#FFF3E0' }]}>
          <Flame size={20} color="#FF9800" />
        </View>
        <Text style={styles.label}>运动</Text>
        <Text style={styles.value}>{exerciseCaloriesTotal}<Text style={styles.unit}>kcal</Text></Text>
        <Text style={styles.subLabel}>{exerciseType} · {exerciseDuration}分钟</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#888',
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  unit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#888',
  },
  miniBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  subLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
});
