import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { mockTodayData } from '../mockTodayData';

export default function CalorieBalanceCard() {
  const { remainingCalories, suggestedRange, consumed, targetIntake } = mockTodayData;
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
        {/* Left: ring + number */}
        <View style={styles.leftCol}>
          <View style={styles.circleContainer}>
            <Svg width={120} height={120}>
              <Circle
                cx={60}
                cy={60}
                r={48}
                stroke="rgba(255,255,255,0.6)"
                strokeWidth={10}
                fill="none"
              />
              <Circle
                cx={60}
                cy={60}
                r={48}
                stroke="#4CAF50"
                strokeWidth={10}
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90, 60, 60)"
              />
            </Svg>
            <View style={styles.circleText}>
              <Text style={styles.calorieNumber}>{remainingCalories}</Text>
              <Text style={styles.calorieUnit}>kcal</Text>
            </View>
          </View>
          <Text style={styles.rangeLabel}>
            建议范围 {suggestedRange.min}-{suggestedRange.max} kcal
          </Text>
        </View>

        {/* Right: bubble + illustration placeholder */}
        <View style={styles.rightCol}>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>做得不错，保持住哦！</Text>
          </View>
          <View style={styles.bubbleTail} />
          <View style={styles.illustrationPlaceholder}>
            <Text style={styles.illustrationEmoji}>🥗</Text>
            <Text style={styles.illustrationEmoji2}>🥤</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
    marginBottom: 16,
  },
  mainContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCol: {
    alignItems: 'center',
    flex: 1,
  },
  circleContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleText: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calorieNumber: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1B5E20',
  },
  calorieUnit: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: -2,
  },
  rangeLabel: {
    fontSize: 12,
    color: '#558B2F',
    marginTop: 8,
  },
  rightCol: {
    flex: 1,
    alignItems: 'center',
    paddingLeft: 8,
  },
  bubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    maxWidth: 160,
  },
  bubbleText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#fff',
    alignSelf: 'flex-start',
    marginLeft: 30,
  },
  illustrationPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  illustrationEmoji: {
    fontSize: 36,
  },
  illustrationEmoji2: {
    fontSize: 30,
  },
});
