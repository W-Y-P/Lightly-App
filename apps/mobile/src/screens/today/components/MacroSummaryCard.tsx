import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mockTodayData } from '../mockTodayData';

export default function MacroSummaryCard() {
  const { nutrients } = mockTodayData;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>三大营养素概览</Text>
      <View style={styles.row}>
        {nutrients.map((n) => {
          const percent = Math.round((n.current / n.target) * 100);
          return (
            <View key={n.name} style={styles.col}>
              <Text style={styles.macroName}>{n.name}</Text>
              <View style={styles.progressOuter}>
                <View
                  style={[
                    styles.progressInner,
                    {
                      width: `${Math.min(percent, 100)}%`,
                      backgroundColor: n.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.macroValue}>
                {n.current}/{n.target}{n.unit}
              </Text>
              <Text style={[styles.macroPercent, { color: n.color }]}>{percent}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  macroName: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  progressOuter: {
    width: '100%',
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressInner: {
    height: '100%',
    borderRadius: 3,
  },
  macroValue: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  macroPercent: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
});
