import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Utensils,
  Dumbbell,
  Scale,
} from 'lucide-react-native';
import { useApp } from '../state/AppStateProvider';
import * as api from '../api/client';

// ── Helpers ───────────────────────────────────────────────────────

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function weekdayShort(d: Date) {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

// ── Mock calendar data ────────────────────────────────────────────

interface DayData {
  date: string;
  intake: number;
  exercise: number;
  deficit: number;
  target: number;
  achieved: boolean;
  star: boolean;
  meals: { slot: string; kcal: number; items: string[] }[];
  exercises: { type: string; min: number; kcal: number }[];
  weight: number | null;
}

function generateMockCalendar(): DayData[] {
  const result: DayData[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    const intake = 1000 + Math.round(Math.random() * 600);
    const exercise = Math.round(Math.random() * 300);
    const deficit = 1500 - intake + exercise;
    const achieved = deficit >= 400 && deficit <= 700;
    result.push({
      date: fmt(d),
      intake,
      exercise,
      deficit,
      target: 500,
      achieved,
      star: achieved && Math.random() > 0.3,
      meals:
        i < 3
          ? [
              { slot: '早餐', kcal: 280, items: ['燕麦粥', '鸡蛋'] },
              { slot: '午餐', kcal: 420, items: ['米饭', '鸡胸肉'] },
              { slot: '晚餐', kcal: 300, items: ['蔬菜沙拉', '豆腐'] },
            ]
          : [],
      exercises: i < 3 ? [{ type: '快走', min: 30, kcal: 150 }] : [],
      weight: 73.5 - i * 0.08 + (Math.random() - 0.5) * 0.3,
    });
  }
  return result;
}

// ── Meal slot options ─────────────────────────────────────────────

const MEAL_SLOTS = [
  { key: 'breakfast', label: '早餐', emoji: '🌅' },
  { key: 'lunch', label: '午餐', emoji: '☀️' },
  { key: 'dinner', label: '晚餐', emoji: '🌙' },
  { key: 'other', label: '其它', emoji: '🍪' },
  { key: 'drink', label: '饮品', emoji: '🥤' },
] as const;

const MEAL_STATUS = [
  { key: 'recorded', label: '已记录' },
  { key: 'skipped', label: '跳过' },
  { key: 'fasting', label: '轻断食' },
] as const;

const EXERCISE_TYPES = [
  '快走', '慢跑', '游泳', '骑行', '跳绳', '瑜伽', '力量训练', 'HIIT', '舞蹈', '其它',
];

const WEIGHING_CONTEXTS = [
  { key: 'morning_fasted', label: '早起空腹' },
  { key: 'after_meal', label: '饭后' },
  { key: 'evening', label: '晚上' },
  { key: 'other', label: '其它' },
] as const;

// ── RecordScreen ──────────────────────────────────────────────────

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const { plan, isUsingMockData } = useApp();

  const [calendarData, setCalendarData] = useState<DayData[]>([]);
  const [selectedDate, setSelectedDate] = useState(fmt(new Date()));
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalType, setModalType] = useState<'meal' | 'exercise' | 'weight' | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    if (isUsingMockData || !api.getToken()) {
      setCalendarData(generateMockCalendar());
    } else {
      // Try real API for recent 14 days
      const mock = generateMockCalendar();
      try {
        const to = fmt(new Date());
        const from = fmt(daysAgo(13));
        const [weightRes, mealsRes] = await Promise.all([
          api.getWeights(from, to),
          api.getMeals(selectedDate),
        ]);
        if (weightRes.ok) {
          for (const w of weightRes.data.weights) {
            const day = mock.find((d) => d.date === w.date.slice(0, 10));
            if (day) day.weight = w.weightKg;
          }
        }
        if (mealsRes.ok) {
          const day = mock.find((d) => d.date === selectedDate);
          if (day) {
            day.meals = mealsRes.data.meals.map((m) => ({
              slot: MEAL_SLOTS.find((s) => s.key === m.mealSlot)?.label ?? m.mealSlot,
              kcal: m.totalKcal,
              items: m.items.map((i) => i.foodName),
            }));
            day.intake = mealsRes.data.totals.totalKcal;
          }
        }
      } catch {
        // Use mock fallback
      }
      setCalendarData(mock);
    }
    setLoading(false);
  }, [selectedDate, isUsingMockData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedDay = calendarData.find((d) => d.date === selectedDate);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>记录</Text>
        <Text style={styles.headerSub}>坚持记录，看见变化</Text>
      </View>

      {/* Calendar strip */}
      <View style={styles.calendarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarScroll}
        >
          {calendarData.map((day) => {
            const d = new Date(day.date + 'T00:00:00');
            const isSelected = day.date === selectedDate;
            return (
              <TouchableOpacity
                key={day.date}
                style={[styles.dayCard, isSelected && styles.dayCardActive]}
                onPress={() => setSelectedDate(day.date)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayWeekday, isSelected && styles.dayTextActive]}>
                  {weekdayShort(d)}
                </Text>
                <Text style={[styles.dayNum, isSelected && styles.dayTextActive]}>
                  {d.getDate()}
                </Text>
                {day.star ? (
                  <Text style={styles.dayStar}>⭐</Text>
                ) : day.achieved ? (
                  <Text style={styles.dayCheck}>✓</Text>
                ) : (
                  <View style={styles.dayDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Day summary */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#4CAF50" />
        </View>
      ) : selectedDay ? (
        <ScrollView
          style={styles.detailScroll}
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary stats */}
          <View style={styles.statsRow}>
            <StatBox label="摄入" value={`${selectedDay.intake}`} unit="kcal" color="#4CAF50" />
            <StatBox label="运动" value={`${selectedDay.exercise}`} unit="kcal" color="#2196F3" />
            <StatBox
              label="缺口"
              value={`${selectedDay.deficit}`}
              unit="kcal"
              color={selectedDay.achieved ? '#FF9800' : '#999'}
            />
            {selectedDay.weight && (
              <StatBox label="体重" value={selectedDay.weight.toFixed(1)} unit="kg" color="#7C4DFF" />
            )}
          </View>

          {/* Meals */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🍽️ 餐食记录</Text>
            {selectedDay.meals.length > 0 ? (
              selectedDay.meals.map((m, i) => (
                <View key={i} style={styles.mealRow}>
                  <Text style={styles.mealSlot}>{m.slot}</Text>
                  <Text style={styles.mealItems}>{m.items.join('、')}</Text>
                  <Text style={styles.mealKcal}>{m.kcal} kcal</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>暂无记录，点击下方按钮添加</Text>
            )}
          </View>

          {/* Exercises */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🏃 运动记录</Text>
            {selectedDay.exercises.length > 0 ? (
              selectedDay.exercises.map((e, i) => (
                <View key={i} style={styles.mealRow}>
                  <Text style={styles.mealSlot}>{e.type}</Text>
                  <Text style={styles.mealItems}>{e.min} 分钟</Text>
                  <Text style={styles.mealKcal}>{e.kcal} kcal</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>暂无运动记录</Text>
            )}
          </View>

          {/* Add buttons */}
          <View style={styles.addRow}>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalType('meal')}
              activeOpacity={0.7}
            >
              <Utensils size={18} color="#4CAF50" />
              <Text style={styles.addBtnText}>添加餐食</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalType('exercise')}
              activeOpacity={0.7}
            >
              <Dumbbell size={18} color="#2196F3" />
              <Text style={styles.addBtnText}>添加运动</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalType('weight')}
              activeOpacity={0.7}
            >
              <Scale size={18} color="#7C4DFF" />
              <Text style={styles.addBtnText}>体重打卡</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      ) : null}

      {/* Modals */}
      <AddMealModal
        visible={modalType === 'meal'}
        date={selectedDate}
        onClose={() => setModalType(null)}
        onSaved={loadData}
        isUsingMockData={isUsingMockData}
      />
      <AddExerciseModal
        visible={modalType === 'exercise'}
        date={selectedDate}
        onClose={() => setModalType(null)}
        onSaved={loadData}
        isUsingMockData={isUsingMockData}
      />
      <AddWeightModal
        visible={modalType === 'weight'}
        date={selectedDate}
        onClose={() => setModalType(null)}
        onSaved={loadData}
        isUsingMockData={isUsingMockData}
      />
    </View>
  );
}

// ── StatBox ───────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  );
}

// ── AddMealModal ──────────────────────────────────────────────────

function AddMealModal({
  visible,
  date,
  onClose,
  onSaved,
  isUsingMockData,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  isUsingMockData: boolean;
}) {
  const [slot, setSlot] = useState<(typeof MEAL_SLOTS)[number]['key']>('breakfast');
  const [status, setStatus] = useState<'recorded' | 'skipped' | 'fasting'>('recorded');
  const [foodName, setFoodName] = useState('');
  const [quantityG, setQuantityG] = useState('');
  const [kcal, setKcal] = useState('');
  const [carbG, setCarbG] = useState('');
  const [proteinG, setProteinG] = useState('');
  const [fatG, setFatG] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (isUsingMockData) {
      Alert.alert('演示模式', '当前使用本地演示数据，记录不会保存到服务器。');
      onClose();
      return;
    }

    setSaving(true);
    const items =
      status === 'recorded'
        ? [
            {
              foodName: foodName || '未命名食物',
              quantityG: parseFloat(quantityG) || 100,
              kcal: parseInt(kcal, 10) || 0,
              carbG: parseFloat(carbG) || 0,
              proteinG: parseFloat(proteinG) || 0,
              fatG: parseFloat(fatG) || 0,
            },
          ]
        : undefined;

    const res = await api.createMeal({
      date,
      mealSlot: slot,
      status,
      items,
    });

    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
      resetForm();
    } else {
      Alert.alert('保存失败', res.error);
    }
  };

  const resetForm = () => {
    setFoodName('');
    setQuantityG('');
    setKcal('');
    setCarbG('');
    setProteinG('');
    setFatG('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>添加餐食</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Meal slot */}
            <Text style={styles.modalLabel}>餐段</Text>
            <View style={styles.chipRow}>
              {MEAL_SLOTS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, slot === s.key && styles.chipActive]}
                  onPress={() => setSlot(s.key)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{s.emoji}</Text>
                  <Text style={[styles.chipText, slot === s.key && styles.chipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status */}
            <Text style={styles.modalLabel}>状态</Text>
            <View style={styles.chipRow}>
              {MEAL_STATUS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, status === s.key && styles.chipActive]}
                  onPress={() => setStatus(s.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, status === s.key && styles.chipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Items (only if recorded) */}
            {status === 'recorded' && (
              <>
                <Text style={styles.modalLabel}>食物信息</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="食物名称"
                  placeholderTextColor="#ccc"
                  value={foodName}
                  onChangeText={setFoodName}
                />
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.modalInput, styles.inputHalf]}
                    placeholder="克重"
                    placeholderTextColor="#ccc"
                    keyboardType="decimal-pad"
                    value={quantityG}
                    onChangeText={setQuantityG}
                  />
                  <TextInput
                    style={[styles.modalInput, styles.inputHalf]}
                    placeholder="千卡"
                    placeholderTextColor="#ccc"
                    keyboardType="number-pad"
                    value={kcal}
                    onChangeText={setKcal}
                  />
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.modalInput, styles.inputThird]}
                    placeholder="碳水(g)"
                    placeholderTextColor="#ccc"
                    keyboardType="decimal-pad"
                    value={carbG}
                    onChangeText={setCarbG}
                  />
                  <TextInput
                    style={[styles.modalInput, styles.inputThird]}
                    placeholder="蛋白(g)"
                    placeholderTextColor="#ccc"
                    keyboardType="decimal-pad"
                    value={proteinG}
                    onChangeText={setProteinG}
                  />
                  <TextInput
                    style={[styles.modalInput, styles.inputThird]}
                    placeholder="脂肪(g)"
                    placeholderTextColor="#ccc"
                    keyboardType="decimal-pad"
                    value={fatG}
                    onChangeText={setFatG}
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.saveBtnText}>{saving ? '保存中...' : '保存'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── AddExerciseModal ──────────────────────────────────────────────

function AddExerciseModal({
  visible,
  date,
  onClose,
  onSaved,
  isUsingMockData,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  isUsingMockData: boolean;
}) {
  const [exerciseType, setExerciseType] = useState('快走');
  const [durationMin, setDurationMin] = useState('30');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (isUsingMockData) {
      Alert.alert('演示模式', '当前使用本地演示数据，记录不会保存到服务器。');
      onClose();
      return;
    }
    setSaving(true);
    const res = await api.createExercise({
      date,
      exerciseType,
      durationMin: parseInt(durationMin, 10) || 30,
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      Alert.alert('保存失败', res.error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>添加运动</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>运动类型</Text>
            <View style={styles.chipRow}>
              {EXERCISE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, exerciseType === t && styles.chipActive]}
                  onPress={() => setExerciseType(t)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, exerciseType === t && styles.chipTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>时长（分钟）</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="30"
              placeholderTextColor="#ccc"
              keyboardType="number-pad"
              value={durationMin}
              onChangeText={setDurationMin}
            />
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#2196F3' }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.saveBtnText}>{saving ? '保存中...' : '保存'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── AddWeightModal ────────────────────────────────────────────────

function AddWeightModal({
  visible,
  date,
  onClose,
  onSaved,
  isUsingMockData,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  isUsingMockData: boolean;
}) {
  const [weight, setWeight] = useState('');
  const [context, setContext] = useState<(typeof WEIGHING_CONTEXTS)[number]['key']>('morning_fasted');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const w = parseFloat(weight);
    if (isNaN(w) || w < 20 || w > 300) {
      Alert.alert('请输入有效体重', '体重范围 20-300 kg');
      return;
    }
    if (isUsingMockData) {
      Alert.alert('演示模式', '当前使用本地演示数据，记录不会保存到服务器。');
      onClose();
      return;
    }
    setSaving(true);
    const res = await api.createWeight({
      date,
      weightKg: w,
      weighingContext: context,
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
      setWeight('');
    } else {
      Alert.alert('保存失败', res.error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>体重打卡</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalLabel}>体重 (kg)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="72.5"
            placeholderTextColor="#ccc"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            autoFocus
          />
          <Text style={styles.modalLabel}>称重场景</Text>
          <View style={styles.chipRow}>
            {WEIGHING_CONTEXTS.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, context === c.key && styles.chipActive]}
                onPress={() => setContext(c.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, context === c.key && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: '#7C4DFF' }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中...' : '打卡'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FDF8',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
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
  calendarContainer: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  calendarScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  dayCard: {
    width: 48,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  dayCardActive: {
    backgroundColor: '#4CAF50',
  },
  dayWeekday: {
    fontSize: 11,
    color: '#999',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  dayTextActive: {
    color: '#fff',
  },
  dayStar: {
    fontSize: 10,
    marginTop: 2,
  },
  dayCheck: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 2,
    fontWeight: '700',
  },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailScroll: {
    flex: 1,
  },
  detailContent: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  statUnit: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  mealSlot: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    width: 50,
  },
  mealItems: {
    flex: 1,
    fontSize: 13,
    color: '#666',
  },
  mealKcal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#ccc',
    textAlign: 'center',
    paddingVertical: 16,
  },
  addRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipText: {
    fontSize: 13,
    color: '#666',
  },
  chipTextActive: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputHalf: {
    flex: 1,
  },
  inputThird: {
    flex: 1,
  },
  saveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
