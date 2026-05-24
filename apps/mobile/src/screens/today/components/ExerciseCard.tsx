import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Dumbbell } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function ExerciseCard() {
  const { exerciseCaloriesTotal, exerciseDuration, exerciseType } = mockTodayData;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => console.log('exercise record')}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Dumbbell size={24} color="#FF9800" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title}>运动记录</Text>
        <Text style={styles.detail}>
          {exerciseType} · {exerciseDuration}分钟 · 消耗 {exerciseCaloriesTotal} kcal
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>+{exerciseCaloriesTotal}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
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
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF3E0',
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
  detail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF9800',
  },
});
