import { describe, it, expect } from "vitest";
import {
  calculateBmr,
  calculateDailyDeficit,
  calculateMacroTargets,
  buildPlan,
  estimateExerciseKcal,
  weightMovingAverage,
  evaluateStarRule,
} from "../domain.js";

describe("calculateBmr", () => {
  it("calculates male BMR with Mifflin-St Jeor", () => {
    // 80kg, 175cm, 28yo male: 10*80 + 6.25*175 - 5*28 + 5 = 800 + 1093.75 - 140 + 5 = 1758.75 -> 1759
    const bmr = calculateBmr({ sex: "male", age: 28, heightCm: 175, currentWeightKg: 80 });
    expect(bmr).toBe(1759);
  });

  it("calculates female BMR", () => {
    // 60kg, 163cm, 25yo female: 10*60 + 6.25*163 - 5*25 - 161 = 600 + 1018.75 - 125 - 161 = 1332.75 -> 1333
    const bmr = calculateBmr({ sex: "female", age: 25, heightCm: 163, currentWeightKg: 60 });
    expect(bmr).toBe(1333);
  });
});

describe("calculateDailyDeficit", () => {
  it("calculates from weekly loss target", () => {
    // 0.5kg/week * 7700 / 7 = 550
    const deficit = calculateDailyDeficit({
      currentWeightKg: 80,
      targetWeightKg: 70,
      weeklyLossKg: 0.5,
    });
    expect(deficit).toBe(550);
  });

  it("calculates from target date", () => {
    const futureDate = new Date(Date.now() + 70 * 86_400_000).toISOString();
    // (80 - 70) * 7700 / 70 = 1100
    const deficit = calculateDailyDeficit({
      currentWeightKg: 80,
      targetWeightKg: 70,
      targetDate: futureDate,
    });
    expect(deficit).toBe(1100);
  });

  it("throws if neither weeklyLossKg nor targetDate provided", () => {
    expect(() =>
      calculateDailyDeficit({ currentWeightKg: 80, targetWeightKg: 70 }),
    ).toThrow("weeklyLossKg or targetDate is required");
  });
});

describe("calculateMacroTargets", () => {
  it("returns reasonable macro ranges", () => {
    const macros = calculateMacroTargets(80, 1900);
    expect(macros.proteinMinG).toBe(96); // 80 * 1.2
    expect(macros.proteinMaxG).toBe(128); // 80 * 1.6
    expect(macros.carbMinG).toBe(166); // 1900 * 0.35 / 4
    expect(macros.carbMaxG).toBe(261); // 1900 * 0.55 / 4
    expect(macros.fatMinG).toBe(48); // max(1900*0.2/9=42, 80*0.6=48)
    expect(macros.fatMaxG).toBe(63); // 1900 * 0.3 / 9
  });
});

describe("buildPlan", () => {
  it("builds a complete plan from input", () => {
    const plan = buildPlan({
      sex: "male",
      age: 28,
      heightCm: 175,
      currentWeightKg: 80,
      targetWeightKg: 70,
      activityMultiplier: 1.4,
      weeklyLossKg: 0.5,
    });

    expect(plan.bmrKcal).toBe(1759);
    expect(plan.tdeeKcal).toBe(Math.round(1759 * 1.4)); // 2463
    expect(plan.dailyDeficitTargetKcal).toBe(550);
    expect(plan.recommendedIntakeKcal).toBe(Math.round(2463 - 550)); // 1913
    expect(plan.macroTargets).toBeDefined();
    expect(plan.warnings).toBeInstanceOf(Array);
  });

  it("warns on aggressive weekly loss", () => {
    const plan = buildPlan({
      sex: "male",
      age: 28,
      heightCm: 175,
      currentWeightKg: 80,
      targetWeightKg: 70,
      activityMultiplier: 1.4,
      weeklyLossKg: 1.5,
    });

    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("estimateExerciseKcal", () => {
  it("calculates MET-based calories", () => {
    // Running (8.3 MET) * 80kg * 0.5h = 332
    const kcal = estimateExerciseKcal(8.3, 80, 30);
    expect(kcal).toBe(332);
  });

  it("handles short duration", () => {
    const kcal = estimateExerciseKcal(3.0, 60, 10);
    expect(kcal).toBe(30); // 3 * 60 * 10/60
  });
});

describe("weightMovingAverage", () => {
  it("calculates 7-day moving average", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, "0")}`,
      weightKg: 80 - i * 0.1,
    }));

    const ma = weightMovingAverage(points, 7);
    expect(ma).toHaveLength(10);
    // First point should equal first weight (only 1 point avg)
    expect(ma[0].weightKg).toBe(points[0].weightKg);
    // 7th point should be avg of first 7
    const expected7 = points.slice(0, 7).reduce((s, p) => s + p.weightKg, 0) / 7;
    expect(ma[6].weightKg).toBeCloseTo(expected7, 1);
  });

  it("handles fewer points than window", () => {
    const points = [
      { date: "2025-01-01", weightKg: 80 },
      { date: "2025-01-03", weightKg: 79.5 },
    ];
    const ma = weightMovingAverage(points, 7);
    expect(ma).toHaveLength(2);
    expect(ma[0].weightKg).toBe(80);
    expect(ma[1].weightKg).toBeCloseTo(79.75, 1);
  });
});

describe("evaluateStarRule", () => {
  it("awards star when 2+ meal slots and deficit >= 80%", () => {
    const result = evaluateStarRule(2, 500, 550);
    expect(result.starAwarded).toBe(true);
    expect(result.isRecordComplete).toBe(true);
  });

  it("no star with fewer than 2 meal slots", () => {
    const result = evaluateStarRule(1, 600, 550);
    expect(result.starAwarded).toBe(false);
    expect(result.isRecordComplete).toBe(false);
  });

  it("no star when deficit < 80% of target", () => {
    const result = evaluateStarRule(3, 400, 550);
    expect(result.starAwarded).toBe(false);
  });

  it("gives gentle warning on overly large deficit", () => {
    const result = evaluateStarRule(2, 1000, 550);
    expect(result.starAwarded).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("no upper limit on deficit for star", () => {
    const result = evaluateStarRule(3, 2000, 550);
    expect(result.starAwarded).toBe(true);
  });
});
