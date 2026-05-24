import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Target, Flame, Utensils, Save, RefreshCw } from 'lucide-react-native';
import { useApp } from '../state/AppStateProvider';
import * as api from '../api/client';
import type { PlanRecord } from '../api/client';

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { plan, refreshPlan, setPlan, isUsingMockData } = useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable goal fields
  const [targetWeight, setTargetWeight] = useState('');
  const [weeklyLoss, setWeeklyLoss] = useState('');

  // Editable macro fields
  const [proteinMin, setProteinMin] = useState('');
  const [proteinMax, setProteinMax] = useState('');
  const [carbMin, setCarbMin] = useState('');
  const [carbMax, setCarbMax] = useState('');
  const [fatMin, setFatMin] = useState('');
  const [fatMax, setFatMax] = useState('');

  // Load plan
  const loadPlan = useCallback(async () => {
    setLoading(true);
    if (!isUsingMockData) {
      await refreshPlan();
    }
    setLoading(false);
  }, [isUsingMockData, refreshPlan]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // Sync editable fields when plan changes
  useEffect(() => {
    if (plan) {
      setTargetWeight(String(plan.targetWeightKg));
      setWeeklyLoss(String(plan.weeklyLossKg ?? 0.5));
      setProteinMin(String(plan.proteinMinG));
      setProteinMax(String(plan.proteinMaxG));
      setCarbMin(String(plan.carbMinG));
      setCarbMax(String(plan.carbMaxG));
      setFatMin(String(plan.fatMinG));
      setFatMax(String(plan.fatMaxG));
    }
  }, [plan]);

  const handleSaveGoal = async () => {
    if (isUsingMockData) {
      Alert.alert('提示', '演示模式下无法保存，请先连接服务器');
      return;
    }
    setSaving(true);
    const res = await api.updatePlanGoal({
      targetWeightKg: parseFloat(targetWeight) || undefined,
      weeklyLossKg: parseFloat(weeklyLoss) || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setPlan(res.data.plan);
      Alert.alert('已保存', '目标已更新');
    } else {
      Alert.alert('保存失败', res.error);
    }
  };

  const handleSaveMacros = async () => {
    if (isUsingMockData) {
      Alert.alert('提示', '演示模式下无法保存，请先连接服务器');
      return;
    }
    setSaving(true);
    const res = await api.updatePlanMacros({
      proteinMinG: parseInt(proteinMin, 10) || undefined,
      proteinMaxG: parseInt(proteinMax, 10) || undefined,
      carbMinG: parseInt(carbMin, 10) || undefined,
      carbMaxG: parseInt(carbMax, 10) || undefined,
      fatMinG: parseInt(fatMin, 10) || undefined,
      fatMaxG: parseInt(fatMax, 10) || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setPlan(res.data.plan);
      Alert.alert('已保存', '宏量营养素已更新');
    } else {
      Alert.alert('保存失败', res.error);
    }
  };

  if (loading && !plan) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>暂无计划</Text>
        <Text style={styles.emptyDesc}>请先完成初始问卷创建计划</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>计划</Text>
        <Text style={styles.headerSub}>管理你的减脂方案</Text>
      </View>

      {isUsingMockData && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>📱 本地演示数据 · 连接服务器后可编辑保存</Text>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── BMR / TDEE / Deficit ──────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>基础数据</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Flame size={20} color="#FF9800" />
              <Text style={styles.infoValue}>{plan.bmrKcal}</Text>
              <Text style={styles.infoLabel}>BMR (kcal)</Text>
            </View>
            <View style={styles.infoItem}>
              <Flame size={20} color="#F44336" />
              <Text style={styles.infoValue}>{plan.tdeeKcal}</Text>
              <Text style={styles.infoLabel}>TDEE (kcal)</Text>
            </View>
            <View style={styles.infoItem}>
              <Target size={20} color="#4CAF50" />
              <Text style={styles.infoValue}>{plan.dailyDeficitTargetKcal}</Text>
              <Text style={styles.infoLabel}>目标缺口 (kcal)</Text>
            </View>
            <View style={styles.infoItem}>
              <Utensils size={20} color="#2196F3" />
              <Text style={styles.infoValue}>{plan.recommendedIntakeKcal}</Text>
              <Text style={styles.infoLabel}>建议摄入 (kcal)</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {plan.sex === 'male' ? '男' : '女'} · {plan.age}岁 · {plan.heightCm}cm
            </Text>
            <Text style={styles.metaText}>
              活动系数 ×{plan.activityLevel}
            </Text>
          </View>
        </View>

        {/* ── Goal editor ───────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>目标设置</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>目标体重 (kg)</Text>
              <TextInput
                style={styles.input}
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
                placeholder="65"
              />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>每周减重 (kg)</Text>
              <TextInput
                style={styles.input}
                value={weeklyLoss}
                onChangeText={setWeeklyLoss}
                keyboardType="decimal-pad"
                placeholder="0.5"
              />
            </View>
          </View>
          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>当前体重</Text>
            <Text style={styles.rangeValue}>{plan.currentWeightKg} kg</Text>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGoal} activeOpacity={0.7} disabled={saving}>
            <Save size={16} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存目标'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Macro editor ──────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>宏量营养素范围</Text>
          <Text style={styles.cardDesc}>建议范围基于你的计划自动计算，可自行微调</Text>

          {/* Protein */}
          <Text style={styles.macroTitle}>蛋白质 (g)</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最小</Text>
              <TextInput style={styles.input} value={proteinMin} onChangeText={setProteinMin} keyboardType="number-pad" />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最大</Text>
              <TextInput style={styles.input} value={proteinMax} onChangeText={setProteinMax} keyboardType="number-pad" />
            </View>
          </View>

          {/* Carbs */}
          <Text style={styles.macroTitle}>碳水 (g)</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最小</Text>
              <TextInput style={styles.input} value={carbMin} onChangeText={setCarbMin} keyboardType="number-pad" />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最大</Text>
              <TextInput style={styles.input} value={carbMax} onChangeText={setCarbMax} keyboardType="number-pad" />
            </View>
          </View>

          {/* Fat */}
          <Text style={styles.macroTitle}>脂肪 (g)</Text>
          <View style={styles.fieldRow}>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最小</Text>
              <TextInput style={styles.input} value={fatMin} onChangeText={setFatMin} keyboardType="number-pad" />
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.fieldLabel}>最大</Text>
              <TextInput style={styles.input} value={fatMax} onChangeText={setFatMax} keyboardType="number-pad" />
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMacros} activeOpacity={0.7} disabled={saving}>
            <Save size={16} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存宏量'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Current ranges summary ────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>当前碳蛋脂范围</Text>
          <View style={styles.macroSummaryRow}>
            <View style={styles.macroSummaryItem}>
              <Text style={styles.macroSummaryEmoji}>🥩</Text>
              <Text style={styles.macroSummaryName}>蛋白质</Text>
              <Text style={styles.macroSummaryRange}>{plan.proteinMinG}–{plan.proteinMaxG}g</Text>
            </View>
            <View style={styles.macroSummaryItem}>
              <Text style={styles.macroSummaryEmoji}>🍚</Text>
              <Text style={styles.macroSummaryName}>碳水</Text>
              <Text style={styles.macroSummaryRange}>{plan.carbMinG}–{plan.carbMaxG}g</Text>
            </View>
            <View style={styles.macroSummaryItem}>
              <Text style={styles.macroSummaryEmoji}>🥑</Text>
              <Text style={styles.macroSummaryName}>脂肪</Text>
              <Text style={styles.macroSummaryRange}>{plan.fatMinG}–{plan.fatMaxG}g</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FDF8',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSub: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  demoBanner: {
    backgroundColor: '#FFF8E1',
    paddingVertical: 6,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  demoText: {
    fontSize: 12,
    color: '#795548',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  cardDesc: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
    marginTop: -4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoItem: {
    flex: 1,
    minWidth: '40%',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
  },
  infoValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginTop: 4,
  },
  infoLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
  },
  metaText: {
    fontSize: 12,
    color: '#999',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
  },
  rangeLabel: {
    fontSize: 13,
    color: '#666',
  },
  rangeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    paddingVertical: 12,
    marginTop: 12,
    gap: 6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  macroTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginTop: 12,
    marginBottom: 4,
  },
  macroSummaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  macroSummaryItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingVertical: 12,
  },
  macroSummaryEmoji: {
    fontSize: 24,
  },
  macroSummaryName: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  macroSummaryRange: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});
