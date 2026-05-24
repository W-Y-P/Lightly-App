import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { mockTodayData, MealRecord } from '../mockTodayData';

function MealCard({ meal }: { meal: MealRecord }) {
  return (
    <TouchableOpacity
      style={[styles.card, !meal.recorded && styles.cardUnrecorded]}
      onPress={() => console.log(`meal: ${meal.name}`)}
      activeOpacity={0.7}
    >
      <Text style={styles.emoji}>{meal.emoji}</Text>
      <Text style={styles.name}>{meal.name}</Text>
      {meal.recorded ? (
        <Text style={styles.calories}>{meal.calories} kcal</Text>
      ) : (
        <Text style={styles.unrecorded}>未记录</Text>
      )}
      {meal.time && <Text style={styles.time}>{meal.time}</Text>}
    </TouchableOpacity>
  );
}

export default function MealQuickCards() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>餐段记录</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {mockTodayData.meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    width: 90,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardUnrecorded: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  name: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  calories: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 4,
  },
  unrecorded: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 4,
  },
  time: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
});
