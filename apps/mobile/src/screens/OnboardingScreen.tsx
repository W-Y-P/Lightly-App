import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, ChevronLeft, Leaf } from 'lucide-react-native';
import { useApp } from '../state/AppStateProvider';

const ACTIVITY_LEVELS = [
  { label: '久坐为主', value: 1.2, desc: '办公室工作，很少运动' },
  { label: '轻度活动', value: 1.375, desc: '每周运动 1-3 次' },
  { label: '中度活动', value: 1.55, desc: '每周运动 3-5 次' },
  { label: '高度活动', value: 1.725, desc: '每周运动 6-7 次' },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { submitOnboarding, completeOnboarding, isUsingMockData } = useApp();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState('28');
  const [height, setHeight] = useState('170');
  const [currentWeight, setCurrentWeight] = useState('72');
  const [targetWeight, setTargetWeight] = useState('65');
  const [weeklyLoss, setWeeklyLoss] = useState('0.5');
  const [activityIdx, setActivityIdx] = useState(1);

  const totalSteps = 4;

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) {
      const a = parseInt(age, 10);
      const h = parseFloat(height);
      return !isNaN(a) && a > 0 && a < 120 && !isNaN(h) && h > 0;
    }
    if (step === 2) {
      const cw = parseFloat(currentWeight);
      const tw = parseFloat(targetWeight);
      return !isNaN(cw) && cw > 20 && !isNaN(tw) && tw > 20;
    }
    return true;
  };

  const handleNext = async () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      // Submit
      setSubmitting(true);
      const result = await submitOnboarding({
        sex,
        age: parseInt(age, 10),
        heightCm: parseFloat(height),
        currentWeightKg: parseFloat(currentWeight),
        targetWeightKg: parseFloat(targetWeight),
        activityMultiplier: ACTIVITY_LEVELS[activityIdx].value,
        weeklyLossKg: parseFloat(weeklyLoss) || 0.5,
      });
      setSubmitting(false);

      if (result.warnings && result.warnings.length > 0) {
        Alert.alert('温馨提示', result.warnings.join('\n'), [{ text: '好的' }]);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
      {/* Progress */}
      <View style={styles.progressRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[styles.progressDot, i <= step && styles.progressDotActive]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View style={styles.stepContainer}>
            <Leaf size={48} color="#4CAF50" />
            <Text style={styles.stepTitle}>欢迎来到轻减</Text>
            <Text style={styles.stepDesc}>
              让我们一起制定科学的体重管理计划{'\n'}温和、有效、不焦虑
            </Text>
            <View style={styles.featureList}>
              <Text style={styles.featureItem}>📊  每日饮食运动记录</Text>
              <Text style={styles.featureItem}>📈  趋势分析与智能建议</Text>
              <Text style={styles.featureItem}>⭐  达标奖励与坚持打卡</Text>
              <Text style={styles.featureItem}>🤖  AI 识别食物热量</Text>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>基本信息</Text>
            <Text style={styles.stepDesc}>帮助我们更准确地计算你的需求</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>性别</Text>
              <View style={styles.sexRow}>
                {(['male', 'female'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sexButton, sex === s && styles.sexButtonActive]}
                    onPress={() => setSex(s)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.sexText, sex === s && styles.sexTextActive]}>
                      {s === 'male' ? '男' : '女'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>年龄</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="28"
                placeholderTextColor="#ccc"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>身高 (cm)</Text>
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="170"
                placeholderTextColor="#ccc"
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>体重目标</Text>
            <Text style={styles.stepDesc}>设定一个合理、可达的小目标</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>当前体重 (kg)</Text>
              <TextInput
                style={styles.input}
                value={currentWeight}
                onChangeText={setCurrentWeight}
                keyboardType="decimal-pad"
                placeholder="72"
                placeholderTextColor="#ccc"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>目标体重 (kg)</Text>
              <TextInput
                style={styles.input}
                value={targetWeight}
                onChangeText={setTargetWeight}
                keyboardType="decimal-pad"
                placeholder="65"
                placeholderTextColor="#ccc"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>每周减重 (kg)</Text>
              <View style={styles.weeklyRow}>
                {['0.25', '0.5', '0.75', '1.0'].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.weeklyButton, weeklyLoss === v && styles.weeklyButtonActive]}
                    onPress={() => setWeeklyLoss(v)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.weeklyText, weeklyLoss === v && styles.weeklyTextActive]}
                    >
                      {v}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>建议每周 0.5 kg，温和且可持续</Text>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>活动水平</Text>
            <Text style={styles.stepDesc}>选择最接近你日常的活动量</Text>

            {ACTIVITY_LEVELS.map((level, idx) => (
              <TouchableOpacity
                key={level.value}
                style={[
                  styles.activityCard,
                  activityIdx === idx && styles.activityCardActive,
                ]}
                onPress={() => setActivityIdx(idx)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.activityLabel,
                    activityIdx === idx && styles.activityLabelActive,
                  ]}
                >
                  {level.label}
                </Text>
                <Text style={styles.activityDesc}>{level.desc}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.riskNote}>
              <Text style={styles.riskText}>
                💡 温馨提示：体重管理是一个循序渐进的过程，建议根据自身情况合理设定目标。
                如有健康顾虑，请咨询专业医生。
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.buttonRow}>
          {step > 0 ? (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
              <ChevronLeft size={20} color="#666" />
              <Text style={styles.backText}>上一步</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backBtn} onPress={handleSkip} activeOpacity={0.7}>
              <Text style={styles.backText}>跳过</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, !canNext() && styles.nextBtnDisabled]}
            onPress={handleNext}
            activeOpacity={0.7}
            disabled={!canNext() || submitting}
          >
            <Text style={styles.nextText}>
              {submitting ? '创建中...' : step === totalSteps - 1 ? '开始计划' : '下一步'}
            </Text>
            {!submitting && <ChevronRight size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FDF8',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  progressDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
  },
  progressDotActive: {
    backgroundColor: '#4CAF50',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  stepContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  stepTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  featureList: {
    alignSelf: 'stretch',
    gap: 16,
    marginTop: 12,
  },
  featureItem: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  fieldGroup: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  sexRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sexButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  sexButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  sexText: {
    fontSize: 16,
    color: '#666',
  },
  sexTextActive: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  weeklyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  weeklyButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  weeklyButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  weeklyText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  weeklyTextActive: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  activityCard: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 12,
  },
  activityCardActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  activityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  activityLabelActive: {
    color: '#2E7D32',
  },
  activityDesc: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  riskNote: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  riskText: {
    fontSize: 13,
    color: '#795548',
    lineHeight: 20,
  },
  bottomBar: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    fontSize: 15,
    color: '#666',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 4,
  },
  nextBtnDisabled: {
    opacity: 0.5,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
