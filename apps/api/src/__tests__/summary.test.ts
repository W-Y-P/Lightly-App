import { describe, it, expect } from "vitest";
import { summarizeDay } from "../domain.js";

describe("summarizeDay", () => {
  it("calculates daily summary correctly", () => {
    const result = summarizeDay({
      tdeeKcal: 2500,
      targetDeficitKcal: 550,
      intakeKcal: 1800,
      exerciseKcal: 300,
      recordedMealSlots: 3,
    });

    // effectiveExercise = 300 * 0.7 = 210
    expect(result.effectiveExerciseKcal).toBe(210);
    // actualDeficit = 2500 + 300 - 1800 = 1000
    expect(result.actualDeficitKcal).toBe(1000);
    // remaining = 2500 + 210 - 550 - 1800 = 360
    expect(result.remainingIntakeKcal).toBe(360);
    // achievement = 1000/550 * 100 = 181
    expect(result.achievementRate).toBe(182);
    expect(result.isRecordComplete).toBe(true);
    expect(result.starAwarded).toBe(true);
  });

  it("handles zero exercise", () => {
    const result = summarizeDay({
      tdeeKcal: 2000,
      targetDeficitKcal: 500,
      intakeKcal: 1800,
      exerciseKcal: 0,
      recordedMealSlots: 2,
    });

    expect(result.effectiveExerciseKcal).toBe(0);
    expect(result.actualDeficitKcal).toBe(200); // 2000 + 0 - 1800
    expect(result.isRecordComplete).toBe(true);
    // 200 < 500 * 0.8 = 400 → no star
    expect(result.starAwarded).toBe(false);
  });

  it("applies custom exercise return ratio", () => {
    const result = summarizeDay({
      tdeeKcal: 2500,
      targetDeficitKcal: 550,
      intakeKcal: 2000,
      exerciseKcal: 400,
      exerciseReturnRatio: 0.5,
      recordedMealSlots: 2,
    });

    expect(result.effectiveExerciseKcal).toBe(200); // 400 * 0.5
  });

  it("marks incomplete when fewer than 2 meal slots", () => {
    const result = summarizeDay({
      tdeeKcal: 2500,
      targetDeficitKcal: 550,
      intakeKcal: 800,
      exerciseKcal: 0,
      recordedMealSlots: 1,
    });

    expect(result.isRecordComplete).toBe(false);
    expect(result.starAwarded).toBe(false);
  });

  it("gives warning when deficit is overly large", () => {
    const result = summarizeDay({
      tdeeKcal: 2500,
      targetDeficitKcal: 500,
      intakeKcal: 500,
      exerciseKcal: 200,
      recordedMealSlots: 3,
    });

    // actualDeficit = 2500 + 200 - 500 = 2200, target * 1.5 = 750
    expect(result.actualDeficitKcal).toBe(2200);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
