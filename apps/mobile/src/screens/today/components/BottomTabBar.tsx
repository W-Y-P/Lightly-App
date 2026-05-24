import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, PenLine, TrendingUp, CalendarCheck, User } from 'lucide-react-native';
import { useApp, TabKey } from '../../../state/AppStateProvider';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Home;
}

const TABS: TabDef[] = [
  { key: 'today', label: '今日', icon: Home },
  { key: 'record', label: '记录', icon: PenLine },
  { key: 'trend', label: '趋势', icon: TrendingUp },
  { key: 'plan', label: '计划', icon: CalendarCheck },
  { key: 'profile', label: '我的', icon: User },
];

export default function BottomTabBar() {
  const insets = useSafeAreaInsets();
  const { activeTab, setActiveTab } = useApp();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 8 }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        const Icon = tab.icon;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => setActiveTab(tab.key)}
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
