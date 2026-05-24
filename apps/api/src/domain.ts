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
  { name: "爬山", met: 6.0 }
];

export function calculateBmr(input: Pick<PlanInput, "sex" | "age" | "heightCm" | "currentWeightKg">) {
  const base = 10 * input.currentWeightKg + 6.25 * input.heightCm - 5 * input.age;
  return Math.round(input.sex === "male" ? base + 5 : base - 161);
}

export function calculateDailyDeficit(input: Pick<PlanInput, "currentWeightKg" | "targetWeightKg" | "weeklyLossKg" | "targetDate">) {
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

export function calculateMacroTargets(weightKg: number, recommendedIntakeKcal: number): MacroTargets {
  const proteinMinG = Math.round(weightKg * 1.2);
  const proteinMaxG = Math.round(weightKg * 1.6);
  const carbMinG = Math.round((recommendedIntakeKcal * 0.35) / 4);
  const carbMaxG = Math.round((recommendedIntakeKcal * 0.55) / 4);
  const fatMinG = Math.max(Math.round((recommendedIntakeKcal * 0.2) / 9), Math.round(weightKg * 0.6));
  const fatMaxG = Math.round((recommendedIntakeKcal * 0.3) / 9);

  return { proteinMinG, proteinMaxG, carbMinG, carbMaxG, fatMinG, fatMaxG };
}

export function buildPlan(input: PlanInput) {
  const exerciseReturnRatio = input.exerciseReturnRatio ?? 0.7;
  const plannedExerciseKcal = input.plannedExerciseKcal ?? 0;
  const bmrKcal = calculateBmr(input);
  const tdeeKcal = Math.round(bmrKcal * input.activityMultiplier);
  const dailyDeficitTargetKcal = calculateDailyDeficit(input);
  const recommendedIntakeKcal = Math.round(tdeeKcal + plannedExerciseKcal * exerciseReturnRatio - dailyDeficitTargetKcal);
  const macroTargets = calculateMacroTargets(input.currentWeightKg, recommendedIntakeKcal);
  const warnings: string[] = [];

  if (dailyDeficitTargetKcal > (input.currentWeightKg * 7700 * 0.01) / 7) {
    warnings.push("目标减重速度偏激进，建议关注疲劳、饥饿和长期可持续性。");
  }

  if ((input.sex === "female" && recommendedIntakeKcal < 1200) || (input.sex === "male" && recommendedIntakeKcal < 1500)) {
    warnings.push("建议摄入低于常见保护阈值，请谨慎确认。");
  }

  return {
    bmrKcal,
    tdeeKcal,
    dailyDeficitTargetKcal,
    recommendedIntakeKcal,
    macroTargets,
    warnings
  };
}

export function estimateExerciseKcal(met: number, weightKg: number, durationMin: number) {
  return Math.round(met * weightKg * (durationMin / 60));
}

export function summarizeDay(input: {
  tdeeKcal: number;
  targetDeficitKcal: number;
  intakeKcal: number;
  exerciseKcal: number;
  exerciseReturnRatio?: number;
  recordedMealSlots: number;
}) {
  const exerciseReturnRatio = input.exerciseReturnRatio ?? 0.7;
  const effectiveExerciseKcal = Math.round(input.exerciseKcal * exerciseReturnRatio);
  const actualDeficitKcal = Math.round(input.tdeeKcal + input.exerciseKcal - input.intakeKcal);
  const remainingIntakeKcal = Math.round(input.tdeeKcal + effectiveExerciseKcal - input.targetDeficitKcal - input.intakeKcal);
  const achievementRate = Math.round((actualDeficitKcal / input.targetDeficitKcal) * 100);
  const isRecordComplete = input.recordedMealSlots >= 2;
  const starAwarded = isRecordComplete && actualDeficitKcal >= input.targetDeficitKcal * 0.8;

  return {
    effectiveExerciseKcal,
    actualDeficitKcal,
    remainingIntakeKcal,
    achievementRate,
    isRecordComplete,
    starAwarded
  };
}
