import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Star, Trophy } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function StarRewardCard() {
  const { consecutiveDays, totalStars } = mockTodayData;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Trophy size={22} color="#FFD700" />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>今日之星</Text>
          <Text style={styles.subtitle}>连续达标 <Text style={styles.highlight}>{consecutiveDays} 天</Text></Text>
        </View>
        <View style={styles.starsContainer}>
          <Star size={18} color="#FFD700" fill="#FFD700" />
          <Text style={styles.starsText}>累计 {totalStars} 星</Text>
        </View>
      </View>
      <View style={styles.streakBar}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < consecutiveDays ? styles.dotActive : styles.dotInactive]}
          >
            {i < consecutiveDays && <Star size={10} color="#fff" fill="#fff" />}
          </View>
        ))}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFDE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  highlight: {
    color: '#FF9800',
    fontWeight: '600',
  },
  starsContainer: {
    alignItems: 'center',
  },
  starsText: {
    fontSize: 11,
    color: '#FFD700',
    fontWeight: '500',
    marginTop: 2,
  },
  streakBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    backgroundColor: '#FFD700',
  },
  dotInactive: {
    backgroundColor: '#E0E0E0',
  },
});
