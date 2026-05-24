import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { mockTodayData } from '../mockTodayData';

export default function CalorieBalanceCard() {
  const { remainingCalories, suggestedRange, consumed, baseExpenditure, exerciseCalories, targetGap, targetIntake } = mockTodayData;
  const progress = consumed / targetIntake;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  return (
    <LinearGradient
      colors={['#E8F5E9', '#C8E6C9']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <Text style={styles.title}>今日可吃余额</Text>
      
      <View style={styles.mainContent}>
        <View style={styles.circleContainer}>
          <Svg width={110} height={110}>
            <Circle
              cx={55}
              cy={55}
              r={45}
              stroke="#E0E0E0"
              strokeWidth={8}
              fill="none"
            />
            <Circle
              cx={55}
              cy={55}
              r={45}
              stroke="#4CAF50"
              strokeWidth={8}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90, 55, 55)"
            />
          </Svg>
          <View style={styles.circleText}>
            <Text style={styles.calorieNumber}>{remainingCalories}</Text>
            <Text style={styles.calorieUnit}>kcal</Text>
          </View>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.rangeLabel}>建议范围</Text>
          <Text style={styles.rangeValue}>{suggestedRange.min}-{suggestedRange.max} kcal</Text>
          
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>已摄入</Text>
              <Text style={styles.detailValue}>{consumed}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>基础消耗</Text>
              <Text style={styles.detailValue}>{baseExpenditure}</Text>
            </View>
          </View>
          
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>运动</Text>
              <Text style={[styles.detailValue, { color: '#4CAF50' }]}>+{exerciseCalories}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>目标缺口</Text>
              <Text style={[styles.detailValue, { color: targetGap < 0 ? '#FF5722' : '#4CAF50' }]}>
                {targetGap > 0 ? '+' : ''}{targetGap}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
      </View>
      <Text style={styles.progressText}>目标摄入 {targetIntake} kcal</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 16,
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleText: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calorieNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1B5E20',
  },
  calorieUnit: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: -2,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 20,
  },
  rangeLabel: {
    fontSize: 13,
    color: '#666',
  },
  rangeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 20,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
