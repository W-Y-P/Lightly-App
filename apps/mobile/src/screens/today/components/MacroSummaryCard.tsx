import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mockTodayData } from '../mockTodayData';

export default function MacroSummaryCard() {
  const { nutrients } = mockTodayData;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>三大营养素</Text>
      {nutrients.map((n) => {
        const percent = Math.round((n.current / n.target) * 100);
        return (
          <View key={n.name} style={styles.row}>
            <View style={styles.labelCol}>
              <View style={[styles.dot, { backgroundColor: n.color }]} />
              <Text style={styles.name}>{n.name}</Text>
            </View>
            <View style={styles.barCol}>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(percent, 100)}%`, backgroundColor: n.color },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.value}>
              {n.current}/{n.target} {n.unit}
            </Text>
            <Text style={[styles.percent, { color: n.color }]}>{percent}%</Text>
          </View>
        );
      })}
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  labelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  name: {
    fontSize: 13,
    color: '#555',
  },
  barCol: {
    flex: 1,
    marginHorizontal: 10,
  },
  barBg: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  value: {
    fontSize: 12,
    color: '#666',
    width: 70,
    textAlign: 'right',
  },
  percent: {
    fontSize: 13,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
});
