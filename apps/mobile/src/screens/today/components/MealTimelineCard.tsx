import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function MealTimelineCard() {
  const { timeline } = mockTodayData;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>今日饮食明细</Text>
      {timeline.map((item, index) => (
        <View key={item.id} style={styles.timelineRow}>
          <View style={styles.timeCol}>
            <Text style={styles.time}>{item.time}</Text>
          </View>
          <View style={styles.lineCol}>
            <View style={styles.dot} />
            {index < timeline.length - 1 && <View style={styles.line} />}
          </View>
          <View style={styles.contentCol}>
            <View style={styles.mealCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.emoji}>{item.emoji}</Text>
                <Text style={styles.mealName}>{item.meal}</Text>
                <Text style={styles.calories}>
                  {item.calories > 0 ? `${item.calories} kcal` : '0 kcal'}
                </Text>
              </View>
              {item.items.map((food, i) => (
                <Text key={i} style={styles.foodItem}>
                  · {food}
                </Text>
              ))}
            </View>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={styles.viewAll}
        onPress={() => console.log('view all records')}
        activeOpacity={0.7}
      >
        <Text style={styles.viewAllText}>查看全部记录</Text>
        <ChevronRight size={14} color="#4CAF50" />
      </TouchableOpacity>
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
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timeCol: {
    width: 48,
    paddingTop: 4,
  },
  time: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  lineCol: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginTop: 6,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  contentCol: {
    flex: 1,
    marginLeft: 8,
    marginBottom: 12,
  },
  mealCard: {
    backgroundColor: '#F8FFF8',
    borderRadius: 12,
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  emoji: {
    fontSize: 18,
    marginRight: 6,
  },
  mealName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  calories: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },
  foodItem: {
    fontSize: 13,
    color: '#777',
    lineHeight: 20,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
});
