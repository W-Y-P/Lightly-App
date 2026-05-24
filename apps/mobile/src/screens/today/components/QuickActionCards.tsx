import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Scale, Camera } from 'lucide-react-native';
import { mockTodayData } from '../mockTodayData';

export default function QuickActionCards() {
  const { currentWeight, weightUnit } = mockTodayData;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        onPress={() => console.log('weight checkin')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
          <Scale size={24} color="#4CAF50" />
        </View>
        <Text style={styles.title}>今日体重</Text>
        <Text style={styles.weightValue}>
          {currentWeight} <Text style={styles.weightUnit}>{weightUnit}</Text>
        </Text>
        <View style={[styles.button, { backgroundColor: '#E8F5E9' }]}>
          <Text style={[styles.buttonText, { color: '#4CAF50' }]}>去打卡</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => console.log('photo recognition')}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: '#E3F2FD' }]}>
          <Camera size={24} color="#2196F3" />
        </View>
        <Text style={styles.title}>AI 拍照识别</Text>
        <Text style={styles.subtitle}>拍照识别食物热量，更快更准记录</Text>
        <View style={[styles.button, { backgroundColor: '#E3F2FD' }]}>
          <Text style={[styles.buttonText, { color: '#2196F3' }]}>去记录</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  weightValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2E7D32',
    marginTop: 4,
    marginBottom: 8,
  },
  weightUnit: {
    fontSize: 13,
    fontWeight: '400',
    color: '#888',
  },
  subtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
