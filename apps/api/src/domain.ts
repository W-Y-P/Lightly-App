// ── Types ────────────────────────────────────────────────────────────

export type Sex = "male" | "female";

export type PlanInput = {
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityMultiplier: number;
  weeklyLossKg?: number;
  targetDate?: string;
  plannedExerciseKcal?: number;
  exerciseReturnRatio?: number;
};

export type MacroTargets = {
  proteinMinG: number;
  proteinMaxG: number;
  carbMinG: number;
  carbMaxG: number;
  fatMinG: number;
  fatMaxG: number;
};

// ── Exercise catalog ─────────────────────────────────────────────────

export const exerciseTypes = [
  { name: "走路", met: 3.0 },
  { name: "快走", met: 4.3 },
  { name: "跑步", met: 8.3 },
  { name: "骑行", met: 6.8 },
  { name: "动感单车", met: 7.5 },
  { name: "力量训练", met: 5.0 },
  { name: "HIIT", met: 8.0 },
  { name: "跳绳", met: 11.0 },
  { name: "游泳", met: 7.0 },
  { name: "瑜伽", met: 3.0 },
  { name: "普拉提", met: 3.5 },
  { name: "羽毛球", met: 5.5 },
  { name: "篮球", met: 6.5 },
  { name: "爬山", met: 6.0 },
];

// ── BMR / TDEE / Macros ──────────────────────────────────────────────

export function calculateBmr(
  input: Pick<PlanInput, "sex" | "age" | "heightCm" | "currentWeightKg">,
) {
  const base = 10 * input.currentWeightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === "male" ? base + 5 : base - 161);
}

export function calculateDailyDeficit(
  input: Pick<PlanInput, "currentWeightKg" | "targetWeightKg" | "weeklyLossKg" | "targetDate">,
) {
  if (input.weeklyLossKg) {
    return Math.round((input.weeklyLossKg * 7700) / 7);
  }

  if (!input.targetDate) {
    throw new Error("weeklyLossKg or targetDate is required");
  }

  const targetTime = new Date(input.targetDate).getTime();
  const now = Date.now();
  const days = Math.max(1, Math.ceil((targetTime - now) / 86_400_000));
  return Math.round(((input.currentWeightKg - input.targetWeightKg) * 7700) / days);
}

export function calculateMacroTargets(
  weightKg: number,
  recommendedIntakeKcal: number,
): MacroTargets {
  const proteinMinG = Math.round(weightKg * 1.2);
  const proteinMaxG = Math.round(weightKg * 1.6);
  const carbMinG = Math.round((recommendedIntakeKcal * 0.35) / 4);
  const carbMaxG = Math.round((recommendedIntakeKcal * 0.55) / 4);
  const fatMinG = Math.max(
    Math.round((recommendedIntakeKcal * 0.2) / 9),
    Math.round(weightKg * 0.6),
  );
  const fatMaxG = Math.round((recommendedIntakeKcal * 0.3) / 9);

  return { proteinMinG, proteinMaxG, carbMinG, carbMaxG, fatMinG, fatMaxG };
}

export function buildPlan(input: PlanInput) {
  const exerciseReturnRatio = input.exerciseReturnRatio ?? 0.7;
  const plannedExerciseKcal = input.plannedExerciseKcal ?? 0;
  const bmrKcal = calculateBmr(input);
  const tdeeKcal = Math.round(bmrKcal * input.activityMultiplier);
  const dailyDeficitTargetKcal = calculateDailyDeficit(input);
  const recommendedIntakeKcal = Math.round(
    tdeeKcal + plannedExerciseKcal * exerciseReturnRatio - dailyDeficitTargetKcal,
  );
  const macroTargets = calculateMacroTargets(input.currentWeightKg, recommendedIntakeKcal);
  const warnings: string[] = [];

  if (dailyDeficitTargetKcal > (input.currentWeightKg * 7700 * 0.01) / 7) {
    warnings.push("目标减重速度偏激进，建议关注疲劳、饥饿和长期可持续性。");
  }

  if (
    (input.sex === "female" && recommendedIntakeKcal < 1200) ||
    (input.sex === "male" && recommendedIntakeKcal < 1500)
  ) {
    warnings.push("建议摄入低于常见保护阈值，请谨慎确认。");
  }

  return {
    bmrKcal,
    tdeeKcal,
    dailyDeficitTargetKcal,
    recommendedIntakeKcal,
    macroTargets,
    warnings,
  };
}

// ── Exercise estimation ──────────────────────────────────────────────

export function estimateExerciseKcal(met: number, weightKg: number, durationMin: number) {
  return Math.round(met * weightKg * (durationMin / 60));
}

// ── Daily summary ────────────────────────────────────────────────────

export type DailySummaryInput = {
  tdeeKcal: number;
  targetDeficitKcal: number;
  intakeKcal: number;
  exerciseKcal: number;
  exerciseReturnRatio?: number;
  recordedMealSlots: number;
};

export function summarizeDay(input: DailySummaryInput) {
  const exerciseReturnRatio = input.exerciseReturnRatio ?? 0.7;
  const effectiveExerciseKcal = Math.round(input.exerciseKcal * exerciseReturnRatio);
  const actualDeficitKcal = Math.round(
    input.tdeeKcal + input.exerciseKcal - input.intakeKcal,
  );
  const remainingIntakeKcal = Math.round(
    input.tdeeKcal + effectiveExerciseKcal - input.targetDeficitKcal - input.intakeKcal,
  );
  const achievementRate = input.targetDeficitKcal > 0
    ? Math.round((actualDeficitKcal / input.targetDeficitKcal) * 100)
    : 0;
  const isRecordComplete = input.recordedMealSlots >= 2;
  const starAwarded = isRecordComplete && actualDeficitKcal >= input.targetDeficitKcal * 0.8;

  // gentle warning for overly large deficit
  const warnings: string[] = [];
  if (actualDeficitKcal > input.targetDeficitKcal * 1.5 && actualDeficitKcal > 0) {
    warnings.push("今天的缺口比目标大不少，适当多吃一点也没关系，保持长期可持续更重要。");
  }

  return {
    effectiveExerciseKcal,
    actualDeficitKcal,
    remainingIntakeKcal,
    achievementRate,
    isRecordComplete,
    starAwarded,
    warnings,
  };
}

// ── Weight moving average ────────────────────────────────────────────

export type WeightPoint = { date: string; weightKg: number };

export function weightMovingAverage(points: WeightPoint[], window = 7): WeightPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((pt, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = sorted.slice(start, i + 1);
    const avg = slice.reduce((sum, p) => sum + p.weightKg, 0) / slice.length;
    return { date: pt.date, weightKg: Math.round(avg * 100) / 100 };
  });
}

// ── Calibration suggestion ───────────────────────────────────────────

export type CalibrationInput = {
  weightDataDays: number;
  startWeightKg: number;
  endWeightKg: number;
  windowDays: number;
  avgIntakeKcal: number;
  avgExerciseKcal: number;
  planTdeeKcal: number;
  planDeficitTargetKcal: number;
};

export type CalibrationResult =
  | { status: "insufficient_data"; reason: string; weightDataDays: number; requiredDays: number }
  | {
      status: "ready";
      actualDailyDeficitKcal: number;
      plannedDailyDeficitKcal: number;
      deviationPct: number;
      suggestedTdeeAdjustmentKcal: number;
      message: string;
    };

const CALIBRATION_MIN_DAYS = 14;

export function suggestCalibration(input: CalibrationInput): CalibrationResult {
  if (input.weightDataDays < CALIBRATION_MIN_DAYS) {
    return {
      status: "insufficient_data",
      reason: `体重数据不足 ${CALIBRATION_MIN_DAYS} 天，暂时无法进行可靠的代谢校准建议。目前已有 ${input.weightDataDays} 天数据。`,
      weightDataDays: input.weightDataDays,
      requiredDays: CALIBRATION_MIN_DAYS,
    };
  }

  const weightChangeKg = input.endWeightKg - input.startWeightKg;
  // actual daily deficit as measured from weight: negative value = deficit (weight loss)
  const actualDeficitFromWeight = (weightChangeKg * 7700) / input.windowDays;
  const plannedDailyDeficit = input.planDeficitTargetKcal;

  // How much does the observed deficit differ from planned?
  // actualDeficitFromWeight is negative for weight loss.
  // We want: actualDeficit == -plannedDeficit (good).
  // Gap = actualDeficitFromWeight - (-plannedDeficit) = actualDeficitFromWeight + plannedDeficit
  // If gap < 0 → not losing enough → TDEE is lower than thought → negative adjustment
  // If gap > 0 → losing more than planned → TDEE is higher → positive adjustment
  const gap = -(actualDeficitFromWeight + plannedDailyDeficit);
  const deviationPct = plannedDailyDeficit > 0
    ? Math.round((gap / plannedDailyDeficit) * 100)
    : 0;

  // Conservative adjustment: cap at ±200 kcal
  // Positive adjustment → TDEE was underestimated → can eat more
  // Negative adjustment → TDEE was overestimated → eat less
  const suggestedTdeeAdjustmentKcal = Math.max(-200, Math.min(200, Math.round(gap)));

  let message: string;
  if (Math.abs(suggestedTdeeAdjustmentKcal) < 50) {
    message = "实际减重趋势和计划基本一致，暂时不需要调整。继续保持！";
  } else if (suggestedTdeeAdjustmentKcal < 0) {
    // TDEE was overestimated → need to eat less
    message = `根据近期体重变化，实际消耗可能比计划略低。建议每天减少约 ${Math.abs(suggestedTdeeAdjustmentKcal)} kcal 摄入，或增加等量运动。确认后新计划生效。`;
  } else {
    // TDEE was underestimated → can eat more
    message = `好消息！根据近期体重变化，你的实际消耗比计划略高。可以每天多摄入约 ${suggestedTdeeAdjustmentKcal} kcal，依然能达到目标。确认后新计划生效。`;
  }

  return {
    status: "ready",
    actualDailyDeficitKcal: Math.round(Math.abs(actualDeficitFromWeight)),
    plannedDailyDeficitKcal: plannedDailyDeficit,
    deviationPct,
    suggestedTdeeAdjustmentKcal,
    message,
  };
}

// ── Star rule (public helper) ────────────────────────────────────────

export function evaluateStarRule(
  recordedMealSlots: number,
  actualDeficitKcal: number,
  targetDeficitKcal: number,
): { starAwarded: boolean; isRecordComplete: boolean; warnings: string[] } {
  const isRecordComplete = recordedMealSlots >= 2;
  const starAwarded = isRecordComplete && actualDeficitKcal >= targetDeficitKcal * 0.8;
  const warnings: string[] = [];
  if (starAwarded && actualDeficitKcal > targetDeficitKcal * 1.5) {
    warnings.push("今天缺口比较大，给自己加颗星的同时也记得适当补充能量哦。");
  }
  return { starAwarded, isRecordComplete, warnings };
}
