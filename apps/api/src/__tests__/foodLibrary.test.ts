import { describe, it, expect } from "vitest";
import { searchFood, lookupFood, foodLibrary } from "../foodLibrary.js";

describe("foodLibrary", () => {
  it("has a reasonable dataset size", () => {
    expect(foodLibrary.length).toBeGreaterThanOrEqual(30);
  });

  it("each entry has required fields", () => {
    for (const food of foodLibrary) {
      expect(food.name).toBeTruthy();
      expect(food.kcal).toBeGreaterThan(0);
      expect(food.carbG).toBeGreaterThanOrEqual(0);
      expect(food.proteinG).toBeGreaterThanOrEqual(0);
      expect(food.fatG).toBeGreaterThanOrEqual(0);
      expect(food.category).toBeTruthy();
    }
  });
});

describe("searchFood", () => {
  it("finds food by exact name", () => {
    const results = searchFood("白米饭");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("白米饭");
  });

  it("finds food by alias", () => {
    const results = searchFood("米饭");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("白米饭");
  });

  it("returns empty for unknown food", () => {
    const results = searchFood("火星食物");
    expect(results).toHaveLength(0);
  });

  it("matches case-insensitively", () => {
    const results = searchFood("可乐");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("lookupFood", () => {
  it("scales nutrition to given quantity", () => {
    const result = lookupFood("白米饭", 200);
    expect(result).not.toBeNull();
    if (result) {
      // 白米饭: 116kcal/100g → 200g = 232kcal
      expect(result.scaled.kcal).toBe(232);
      // 25.9g carb/100g → 200g = 51.8g
      expect(result.scaled.carbG).toBeCloseTo(51.8, 0);
    }
  });

  it("returns null for unknown food", () => {
    const result = lookupFood("不存在的食物", 100);
    expect(result).toBeNull();
  });

  it("handles small quantities", () => {
    const result = lookupFood("鸡蛋", 50);
    expect(result).not.toBeNull();
    if (result) {
      // 144kcal/100g → 50g = 72kcal
      expect(result.scaled.kcal).toBe(72);
    }
  });
});
