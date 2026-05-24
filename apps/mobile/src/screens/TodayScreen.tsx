import React from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Text } from 'react-native';
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
import { useApp } from '../state/AppStateProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_LARGE_SCREEN = SCREEN_WIDTH >= 390; // iPhone 15/16

export default function TodayScreen() {
  const { isUsingMockData } = useApp();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#E8F5E9', '#F1F8E9', '#FFFFFF']}
        locations={[0, 0.25, 0.55]}
        style={styles.gradient}
      >
        {isUsingMockData && (
          <View style={styles.demoBanner}>
            <Text style={styles.demoText}>📱 本地演示数据 · 连接服务器后显示真实数据</Text>
          </View>
        )}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <HeaderSection />

          {/* Calorie main card */}
          <CalorieBalanceCard />

          {/* Metric bar below calorie card */}
          <MetricRow />

          {/* Five meal quick cards */}
          <MealQuickCards />

          {/* Exercise (left big) + Star/Weight (right stack) */}
          {IS_LARGE_SCREEN ? (
            <View style={styles.exerciseRow}>
              <View style={styles.exerciseLeft}>
                <ExerciseCard />
              </View>
              <View style={styles.rightStack}>
                <StarRewardCard />
                <WeightTrendCard />
              </View>
            </View>
          ) : (
            <>
              <ExerciseCard />
              <StarRewardCard />
              <WeightTrendCard />
            </>
          )}

          {/* Tip card */}
          <TipCard />

          {/* Macro nutrients overview */}
          <MacroSummaryCard />

          {/* Meal timeline */}
          <MealTimelineCard />

          {/* Quick actions */}
          <QuickActionCards />

          {/* Daily advice */}
          <DailyAdviceCard />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </LinearGradient>
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
  demoBanner: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 6,
    paddingHorizontal: 20,
    marginTop: 4,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  demoText: {
    fontSize: 12,
    color: '#795548',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  exerciseRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 12,
  },
  exerciseLeft: {
    flex: 1.15,
  },
  rightStack: {
    flex: 0.85,
    gap: 12,
  },
  bottomSpacer: {
    height: 24,
  },
});
