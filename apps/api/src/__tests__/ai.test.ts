import { describe, it, expect } from "vitest";
import { MockAiAdapter, createAiAdapter, AiNotConfiguredError, OpenAiAdapter } from "../ai.js";

describe("MockAiAdapter", () => {
  it("estimates from text by parsing food names", async () => {
    const adapter = new MockAiAdapter();
    const result = await adapter.estimateFromText("200g白米饭");

    expect(result.method).toBe("text");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.totalKcal).toBeGreaterThan(0);
    // Should match food library
    expect(result.items[0].foodName).toBe("白米饭");
    expect(result.items[0].source).toBe("food_library");
  });

  it("returns structured photo estimate", async () => {
    const adapter = new MockAiAdapter();
    const result = await adapter.estimateFromPhoto("fake-base64", "image/jpeg");

    expect(result.method).toBe("photo");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.totalKcal).toBeGreaterThan(0);
  });

  it("handles unknown food with fallback", async () => {
    const adapter = new MockAiAdapter();
    const result = await adapter.estimateFromText("神秘食物");

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].confidence).toBeLessThan(0.5);
    expect(result.items[0].source).toBe("ai_estimate");
  });

  it("handles multi-food text input", async () => {
    const adapter = new MockAiAdapter();
    const result = await adapter.estimateFromText("200g白米饭, 150g鸡胸肉");

    expect(result.items.length).toBe(2);
    expect(result.totalKcal).toBeGreaterThan(200);
  });
});

describe("createAiAdapter", () => {
  it("returns MockAiAdapter when AI_API_KEY is not set", () => {
    const originalKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;

    const adapter = createAiAdapter();
    expect(adapter).toBeInstanceOf(MockAiAdapter);

    process.env.AI_API_KEY = originalKey;
  });
});
