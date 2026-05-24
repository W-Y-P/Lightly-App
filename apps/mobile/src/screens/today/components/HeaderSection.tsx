import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, CalendarDays } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function HeaderSection() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.left}>
        <Text style={styles.title}>今日</Text>
        <TouchableOpacity style={styles.dateRow} activeOpacity={0.7}>
          <Text style={styles.date}>{mockTodayData.date}</Text>
          <ChevronDown size={16} color="#666" style={styles.chevron} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.calendarButton}
        onPress={() => console.log('open calendar')}
        activeOpacity={0.7}
      >
        <CalendarDays size={16} color="#fff" />
        <Text style={styles.calendarButtonText}>打卡日历</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  left: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  chevron: {
    marginLeft: 4,
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  calendarButtonText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
});
