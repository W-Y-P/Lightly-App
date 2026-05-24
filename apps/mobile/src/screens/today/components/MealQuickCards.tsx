import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { mockTodayData, MealRecord } from '../mockTodayData';

function MealCard({ meal }: { meal: MealRecord }) {
  const hasCalories = meal.recorded && meal.calories > 0;
  const isRecorded = meal.recorded;
  const isUnrecorded = !meal.recorded;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => console.log(`meal: ${meal.name}`)}
      activeOpacity={0.7}
    >
      {/* Status indicator - top right */}
      <View style={styles.statusDot}>
        {hasCalories ? (
          <View style={styles.checkCircle}>
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        ) : isRecorded ? (
          <View style={styles.yellowDot} />
        ) : (
          <View style={styles.emptyDot} />
        )}
      </View>

      <Text style={styles.emoji}>{meal.emoji}</Text>
      <Text style={styles.name}>{meal.name}</Text>
      {hasCalories ? (
        <Text style={styles.calories}>{meal.calories} kcal</Text>
      ) : isRecorded ? (
        <Text style={styles.minorRecord}>少量记录</Text>
      ) : (
        <Text style={styles.unrecorded}>未记录</Text>
      )}
    </TouchableOpacity>
  );
}

export default function MealQuickCards() {
  return (
    <View style={styles.container}>
      {mockTodayData.meals.map((meal) => (
        <MealCard key={meal.id} meal={meal} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  yellowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFC107',
  },
  emptyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  emoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  calories: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  minorRecord: {
    fontSize: 10,
    color: '#FFC107',
    marginTop: 4,
  },
  unrecorded: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 4,
  },
});
