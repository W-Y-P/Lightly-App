import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, UtensilsCrossed, Compass, User } from 'lucide-react-native';

interface TabItem {
  key: string;
  label: string;
  icon: typeof Home;
  onPress: () => void;
}

export default function BottomTabBar() {
  const insets = useSafeAreaInsets();

  const tabs: TabItem[] = [
    { key: 'today', label: '今日', icon: Home, onPress: () => console.log('tab: today') },
    { key: 'record', label: '记录', icon: UtensilsCrossed, onPress: () => console.log('tab: record') },
    { key: 'discover', label: '发现', icon: Compass, onPress: () => console.log('tab: discover') },
    { key: 'profile', label: '我的', icon: User, onPress: () => console.log('tab: profile') },
  ];

  const activeKey = 'today';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 8 }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const Icon = tab.icon;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={tab.onPress}
            activeOpacity={0.7}
          >
            <Icon
              size={24}
              color={isActive ? '#4CAF50' : '#999'}
              strokeWidth={isActive ? 2.2 : 1.8}
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  labelActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
});
