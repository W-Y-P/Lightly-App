import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AppStateProvider, { useApp } from './src/state/AppStateProvider';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TodayScreen from './src/screens/TodayScreen';
import RecordScreen from './src/screens/RecordScreen';
import TrendScreen from './src/screens/TrendScreen';
import PlanScreen from './src/screens/PlanScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import BottomTabBar from './src/screens/today/components/BottomTabBar';

// ── Main shell ────────────────────────────────────────────────────

function MainShell() {
  const { activeTab, showOnboarding, login } = useApp();

  // Login on mount
  useEffect(() => {
    login();
  }, []);

  if (showOnboarding) {
    return <OnboardingScreen />;
  }

  let Screen: React.ComponentType;
  switch (activeTab) {
    case 'record':
      Screen = RecordScreen;
      break;
    case 'trend':
      Screen = TrendScreen;
      break;
    case 'plan':
      Screen = PlanScreen;
      break;
    case 'profile':
      Screen = ProfileScreen;
      break;
    case 'today':
    default:
      Screen = TodayScreen;
      break;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.screenContainer}>
        <Screen />
      </View>
      <BottomTabBar />
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppStateProvider>
        <MainShell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
});
