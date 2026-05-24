import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HeartHandshake } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function TipCard() {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.iconCircle}>
          <HeartHandshake size={22} color="#FF8A65" />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.text}>{mockTodayData.tip}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF3E0',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  left: {
    marginRight: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,138,101,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    color: '#795548',
    lineHeight: 22,
  },
});
