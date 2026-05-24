import { describe, it, expect } from "vitest";
import { suggestCalibration } from "../domain.js";

describe("suggestCalibration", () => {
  it("returns insufficient_data when fewer than 14 days", () => {
    const result = suggestCalibration({
      weightDataDays: 10,
      startWeightKg: 80,
      endWeightKg: 79,
      windowDays: 10,
      avgIntakeKcal: 1800,
      avgExerciseKcal: 200,
      planTdeeKcal: 2500,
      planDeficitTargetKcal: 550,
    });

    expect(result.status).toBe("insufficient_data");
    if (result.status === "insufficient_data") {
      expect(result.requiredDays).toBe(14);
      expect(result.weightDataDays).toBe(10);
      expect(result.reason).toContain("10");
    }
  });

  it("suggests no change when on track", () => {
    // Weight loss matches plan: -1kg in 14 days → 7700/14 = 550 kcal/day deficit
    const result = suggestCalibration({
      weightDataDays: 14,
      startWeightKg: 80,
      endWeightKg: 79,
      windowDays: 14,
      avgIntakeKcal: 1900,
      avgExerciseKcal: 200,
      planTdeeKcal: 2500,
      planDeficitTargetKcal: 550,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(Math.abs(result.suggestedTdeeAdjustmentKcal)).toBeLessThan(50);
      expect(result.message).toContain("基本一致");
    }
  });

  it("suggests reducing intake (negative TDEE adj) when weight loss is slower than planned", () => {
    // Weight barely changed: 80 → 79.8 in 14 days
    // actual deficit from weight: -0.2 * 7700 / 14 = -110 kcal/day
    // gap = -110 + 550 = 440, capped to +200
    // Wait: gap is positive means actual deficit is less negative than expected
    // Actually: weightChangeKg = -0.2, actualDeficitFromWeight = (-0.2 * 7700)/14 = -110
    // gap = actualDeficitFromWeight + plannedDailyDeficit = -110 + 550 = 440
    // Since gap > 0 and large, suggestedTdeeAdjustmentKcal = +200
    // But wait, +200 means "TDEE was underestimated, can eat more" - that's WRONG for slow loss
    // 
    // Hmm, let me reconsider the formula...
    // If actual weight loss is slower than planned, the deficit is smaller than expected.
    // actualDeficitFromWeight = -110 (only 110 kcal deficit, but plan says 550)
    // gap = -110 - (-550) = 440 (actual deficit is 440 LESS than planned)
    // So gap > 0 means actual deficit < planned deficit (not losing enough)
    // This should map to negative TDEE adjustment (eat less)
    //
    // I need to fix: suggestedTdeeAdjustmentKcal should be -gap when gap > 0
    // Actually let me reconsider the sign convention entirely.

    const result = suggestCalibration({
      weightDataDays: 14,
      startWeightKg: 80,
      endWeightKg: 79.8,
      windowDays: 14,
      avgIntakeKcal: 2200,
      avgExerciseKcal: 100,
      planTdeeKcal: 2500,
      planDeficitTargetKcal: 550,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      // Weight loss is slower → TDEE is lower → negative adjustment (eat less)
      expect(result.suggestedTdeeAdjustmentKcal).toBeLessThan(0);
      expect(result.message).toContain("减少");
    }
  });

  it("suggests eating more (positive TDEE adj) when weight loss is faster than planned", () => {
    // Lost 2kg in 14 days, but plan was 1kg
    // weightChangeKg = -2, actualDeficitFromWeight = -2 * 7700 / 14 = -1100
    // gap = -1100 + 550 = -550
    // suggestedTdeeAdjustmentKcal = max(-200, min(200, round(-550))) = -200
    // Hmm, that would mean negative... but they're losing too fast.
    //
    // Wait, I'm confusing myself. Let me re-derive.
    // actualDeficitFromWeight = -1100 (large deficit, losing fast)
    // plannedDeficit = 550
    // gap = -1100 + 550 = -550 → actual deficit is 550 MORE than planned
    // This means TDEE is HIGHER than estimated → positive adjustment (can eat more)
    //
    // But gap = -550 → round(-550) → capped to -200. That's negative!
    //
    // I think the sign convention in the formula is wrong. Let me fix it.
    // gap should be: plannedDeficit - |actualDeficit|, not actualDeficit + plannedDeficit
    // 
    // Actually: actualDeficitFromWeight is negative (weight loss), plannedDeficit is positive.
    // We want to compare: |actual deficit| vs planned deficit
    // If |actual| > planned → losing too fast → TDEE is higher → positive adjustment
    // If |actual| < planned → losing too slow → TDEE is lower → negative adjustment
    //
    // adjustment = -(actualDeficitFromWeight + plannedDeficit) 
    //            = -(actualDeficitFromWeight) - plannedDeficit
    //            = |actual deficit| - planned deficit
    //
    // For fast loss: |1100| - 550 = 550 → positive → can eat more ✓
    // For slow loss: |110| - 550 = -440 → negative → eat less ✓
    // For on track: |550| - 550 = 0 → no change ✓
    //
    // So the formula should be: suggestedTdeeAdjustmentKcal = round(-(actualDeficitFromWeight + plannedDeficit))

    const result = suggestCalibration({
      weightDataDays: 14,
      startWeightKg: 80,
      endWeightKg: 78,
      windowDays: 14,
      avgIntakeKcal: 1500,
      avgExerciseKcal: 200,
      planTdeeKcal: 2500,
      planDeficitTargetKcal: 550,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.suggestedTdeeAdjustmentKcal).toBeGreaterThan(0);
      expect(result.message).toContain("好消息");
    }
  });

  it("caps adjustment at ±200 kcal", () => {
    const result = suggestCalibration({
      weightDataDays: 30,
      startWeightKg: 80,
      endWeightKg: 82, // gained weight!
      windowDays: 30,
      avgIntakeKcal: 3000,
      avgExerciseKcal: 0,
      planTdeeKcal: 2500,
      planDeficitTargetKcal: 550,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.suggestedTdeeAdjustmentKcal).toBeLessThanOrEqual(200);
      expect(result.suggestedTdeeAdjustmentKcal).toBeGreaterThanOrEqual(-200);
    }
  });
});
