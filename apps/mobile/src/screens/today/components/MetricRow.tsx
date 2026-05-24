import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Utensils, Flame, Dumbbell, Target, Scale } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

interface MetricItem {
  icon: typeof Flame;
  iconColor: string;
  label: string;
  value: string;
  unit: string;
  valueColor: string;
}

export default function MetricRow() {
  const { consumed, baseExpenditure, exerciseCalories, targetGap, targetIntake } = mockTodayData;

  const metrics: MetricItem[] = [
    { icon: Utensils, iconColor: '#4CAF50', label: '已摄入', value: `${consumed}`, unit: 'kcal', valueColor: '#333' },
    { icon: Flame, iconColor: '#FF9800', label: '基础消耗', value: `${baseExpenditure}`, unit: 'kcal', valueColor: '#333' },
    { icon: Dumbbell, iconColor: '#2196F3', label: '运动', value: `${exerciseCalories}`, unit: 'kcal', valueColor: '#2196F3' },
    { icon: Target, iconColor: '#FF5722', label: '目标缺口', value: `${targetGap}`, unit: 'kcal', valueColor: '#FF5722' },
    { icon: Scale, iconColor: '#9C27B0', label: '目标摄入', value: `${targetIntake}`, unit: 'kcal', valueColor: '#333' },
  ];

  return (
    <View style={styles.container}>
      {metrics.map((m, i) => {
        const Icon = m.icon;
        return (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.separator} />}
            <View style={styles.item}>
              <Icon size={14} color={m.iconColor} />
              <Text style={styles.label}>{m.label}</Text>
              <View style={styles.valueRow}>
                <Text style={[styles.value, { color: m.valueColor }]}>{m.value}</Text>
                <Text style={styles.unit}>{m.unit}</Text>
              </View>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: '#E0E0E0',
  },
  label: {
    fontSize: 10,
    color: '#999',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  value: {
    fontSize: 15,
    fontWeight: '700',
  },
  unit: {
    fontSize: 9,
    color: '#bbb',
  },
});
