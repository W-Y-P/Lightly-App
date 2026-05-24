import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Star } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function StarRewardCard() {
  const { consecutiveDays, totalStars } = mockTodayData;

  return (
    <View style={styles.card}>
      <View style={styles.starsVisual}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Star
            key={i}
            size={i === 1 ? 28 : 22}
            color="#FFD700"
            fill="#FFD700"
            style={i === 1 ? styles.starCenter : styles.starSide}
          />
        ))}
      </View>
      <Text style={styles.label}>今日之星</Text>
      <View style={styles.row}>
        <Text style={styles.days}>连续达标</Text>
        <Text style={styles.daysNum}>{consecutiveDays} 天</Text>
      </View>
      <View style={styles.row}>
        <Star size={12} color="#FFD700" fill="#FFD700" />
        <Text style={styles.total}>累计 {totalStars} 星</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFDE7',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  starsVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  starSide: {
    opacity: 0.7,
  },
  starCenter: {
    marginHorizontal: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  days: {
    fontSize: 12,
    color: '#888',
  },
  daysNum: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9800',
  },
  total: {
    fontSize: 11,
    color: '#FFD700',
    fontWeight: '600',
  },
});
