import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lightbulb } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function TipCard() {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Lightbulb size={20} color="#FFC107" />
      </View>
      <Text style={styles.text}>{mockTodayData.tip}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFDE7',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF9C4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
