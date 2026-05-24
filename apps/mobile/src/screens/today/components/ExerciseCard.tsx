import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Dumbbell, ChevronRight, PartyPopper } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function ExerciseCard() {
  const { exerciseCaloriesTotal, exerciseDuration } = mockTodayData;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => console.log('exercise record')}
      activeOpacity={0.7}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>运动记录</Text>
        <View style={styles.kcalBadge}>
          <Text style={styles.kcalText}>{exerciseCaloriesTotal} kcal</Text>
          <ChevronRight size={14} color="#FF9800" />
        </View>
      </View>

      {/* Illustration area */}
      <View style={styles.illustrationRow}>
        <View style={styles.iconCircle}>
          <Dumbbell size={32} color="#FF9800" />
        </View>
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseMain}>今日运动 {exerciseDuration} 分钟</Text>
          <Text style={styles.exerciseSub}>消耗 {exerciseCaloriesTotal} kcal</Text>
        </View>
      </View>

      {/* Status footer */}
      <View style={styles.statusRow}>
        <PartyPopper size={16} color="#4CAF50" />
        <Text style={styles.statusText}>今日目标已达成</Text>
      </View>
      <Text style={styles.encouragement}>再接再厉，越来越棒！</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  kcalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  kcalText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9800',
  },
  illustrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseMain: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  exerciseSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F8E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },
  encouragement: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    textAlign: 'center',
  },
});
