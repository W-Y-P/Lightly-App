import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, Bell } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function HeaderSection() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.left}>
        <Text style={styles.greeting}>{mockTodayData.greeting}，</Text>
        <Text style={styles.userName}>{mockTodayData.userName}</Text>
        <Text style={styles.date}>{mockTodayData.date}</Text>
      </View>
      <View style={styles.right}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => console.log('open calendar')}
        >
          <Calendar size={24} color="#4CAF50" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconButton}>
          <Bell size={24} color="#4CAF50" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  left: {
    flex: 1,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 2,
  },
  date: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  right: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
