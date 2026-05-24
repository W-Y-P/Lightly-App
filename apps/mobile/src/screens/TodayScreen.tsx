import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import HeaderSection from './today/components/HeaderSection';
import CalorieBalanceCard from './today/components/CalorieBalanceCard';
import MetricRow from './today/components/MetricRow';
import MealQuickCards from './today/components/MealQuickCards';
import ExerciseCard from './today/components/ExerciseCard';
import StarRewardCard from './today/components/StarRewardCard';
import WeightTrendCard from './today/components/WeightTrendCard';
import TipCard from './today/components/TipCard';
import MacroSummaryCard from './today/components/MacroSummaryCard';
import MealTimelineCard from './today/components/MealTimelineCard';
import QuickActionCards from './today/components/QuickActionCards';
import DailyAdviceCard from './today/components/DailyAdviceCard';
import BottomTabBar from './today/components/BottomTabBar';

export default function TodayScreen() {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#E8F5E9', '#F1F8E9', '#FFFFFF']}
        locations={[0, 0.3, 0.6]}
        style={styles.gradient}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <HeaderSection />
          <CalorieBalanceCard />
          <MetricRow />
          <MealQuickCards />
          <ExerciseCard />
          <StarRewardCard />
          <WeightTrendCard />
          <TipCard />
          <MacroSummaryCard />
          <MealTimelineCard />
          <QuickActionCards />
          <DailyAdviceCard />
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </LinearGradient>
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#E8F5E9',
  },
  gradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  bottomSpacer: {
    height: 20,
  },
});
