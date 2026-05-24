import { lookupFood, type FoodEntry } from "./foodLibrary.js";

// ── Types ────────────────────────────────────────────────────────────

export type AiFoodEstimate = {
  foodName: string;
  quantityG: number;
  kcal: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  confidence: number;
  source: "food_library" | "ai_estimate";
};

export type MealEstimateResult = {
  items: AiFoodEstimate[];
  totalKcal: number;
  totalCarbG: number;
  totalProteinG: number;
  totalFatG: number;
  method: "text" | "photo";
};

export interface AiAdapter {
  estimateFromText(description: string): Promise<MealEstimateResult>;
  estimateFromPhoto(base64Image: string, mimeType: string): Promise<MealEstimateResult>;
}

// ── Mock adapter (for testing) ───────────────────────────────────────

export class MockAiAdapter implements AiAdapter {
  async estimateFromText(description: string): Promise<MealEstimateResult> {
    // Simple: try to parse "food x g" patterns
    const items = parseTextToItems(description);
    const totals = sumItems(items);
    return { items, ...totals, method: "text" };
  }

  async estimateFromPhoto(_base64Image: string, _mimeType: string): Promise<MealEstimateResult> {
    // Mock: return a fixed rice + egg estimate
    const items: AiFoodEstimate[] = [
      { foodName: "白米饭", quantityG: 200, kcal: 232, carbG: 51.8, proteinG: 5.2, fatG: 0.6, confidence: 0.8, source: "food_library" },
      { foodName: "西红柿炒蛋", quantityG: 150, kcal: 147, carbG: 7.8, proteinG: 11.3, fatG: 8.3, confidence: 0.7, source: "ai_estimate" },
    ];
    const totals = sumItems(items);
    return { items, ...totals, method: "photo" };
  }
}

// ── Real OpenAI-compatible adapter ───────────────────────────────────

export class OpenAiAdapter implements AiAdapter {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    this.baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
    this.apiKey = process.env.AI_API_KEY ?? "";
    this.model = process.env.AI_MODEL ?? "gpt-4o-mini";

    if (!this.apiKey) {
      throw new AiNotConfiguredError();
    }
  }

  async estimateFromText(description: string): Promise<MealEstimateResult> {
    const prompt = buildTextPrompt(description);
    const raw = await this.callChat(prompt, false);
    const items = parseAiResponseItems(raw);
    const enriched = enrichWithFoodLibrary(items);
    const totals = sumItems(enriched);
    return { items: enriched, ...totals, method: "text" };
  }

  async estimateFromPhoto(base64Image: string, mimeType: string): Promise<MealEstimateResult> {
    const prompt = buildPhotoPrompt();
    const raw = await this.callVisionChat(prompt, base64Image, mimeType);
    const items = parseAiResponseItems(raw);
    const enriched = enrichWithFoodLibrary(items);
    const totals = sumItems(enriched);
    return { items: enriched, ...totals, method: "photo" };
  }

  private async callChat(userContent: string, _isPhoto: boolean): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`AI API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as any;
    return data.choices?.[0]?.message?.content ?? "{}";
  }

  private async callVisionChat(prompt: string, base64Image: string, mimeType: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`AI API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as any;
    return data.choices?.[0]?.message?.content ?? "{}";
  }
}

// ── Error class ──────────────────────────────────────────────────────

export class AiNotConfiguredError extends Error {
  code = "ai_not_configured" as const;
  constructor() {
    super("AI 服务未配置，请设置 AI_BASE_URL 和 AI_API_KEY 环境变量。");
    this.name = "AiNotConfiguredError";
  }
}

// ── Prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个营养估算助手。用户会描述食物或发送食物照片，请估算每种食物的：
- foodName: 食物名称（中文）
- quantityG: 估计克重
- kcal: 总热量（千卡）
- carbG: 碳水化合物（克）
- proteinG: 蛋白质（克）
- fatG: 脂肪（克）
- confidence: 置信度 0-1

返回 JSON 格式: { "items": [ ... ] }
所有数值保留一位小数。不要编造不存在的食物。如果无法确定，降低 confidence。`;

function buildTextPrompt(description: string): string {
  return `请估算以下食物描述的营养成分（返回 JSON）:\n"${description}"`;
}

function buildPhotoPrompt(): string {
  return "请识别照片中的食物，估算每种食物的重量和营养成分（返回 JSON）。";
}

// ── Text parsing (no AI needed) ──────────────────────────────────────

function parseTextToItems(description: string): AiFoodEstimate[] {
  const items: AiFoodEstimate[] = [];
  // Patterns like "200g米饭" or "米饭200g" or "一碗米饭"
  const segments = description.split(/[,，、;；\n]+/).map((s) => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const gMatch = seg.match(/(\d+)\s*[gG克]/);
    const quantityG = gMatch ? parseInt(gMatch[1], 10) : 150; // default serving
    const nameMatch = seg.replace(/\d+\s*[gG克]/g, "").replace(/[碗盘份杯个块]+/g, "").trim();
    const foodName = nameMatch || seg;

    const lookup = lookupFood(foodName, quantityG);
    if (lookup) {
      items.push({
        foodName: lookup.entry.name,
        quantityG,
        kcal: lookup.scaled.kcal,
        carbG: lookup.scaled.carbG,
        proteinG: lookup.scaled.proteinG,
        fatG: lookup.scaled.fatG,
        confidence: 0.7,
        source: "food_library",
      });
    } else {
      items.push({
        foodName,
        quantityG,
        kcal: Math.round(quantityG * 1.5), // rough fallback
        carbG: Math.round(quantityG * 0.2 * 10) / 10,
        proteinG: Math.round(quantityG * 0.1 * 10) / 10,
        fatG: Math.round(quantityG * 0.05 * 10) / 10,
        confidence: 0.3,
        source: "ai_estimate",
      });
    }
  }

  return items.length > 0 ? items : [{
    foodName: description,
    quantityG: 100,
    kcal: 150,
    carbG: 20,
    proteinG: 5,
    fatG: 5,
    confidence: 0.2,
    source: "ai_estimate",
  }];
}

// ── Parse AI JSON response ───────────────────────────────────────────

function parseAiResponseItems(raw: string): AiFoodEstimate[] {
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.map((item: any) => ({
      foodName: String(item.foodName ?? "未知食物"),
      quantityG: Number(item.quantityG ?? 100),
      kcal: Math.round(Number(item.kcal ?? 0)),
      carbG: Math.round(Number(item.carbG ?? 0) * 10) / 10,
      proteinG: Math.round(Number(item.proteinG ?? 0) * 10) / 10,
      fatG: Math.round(Number(item.fatG ?? 0) * 10) / 10,
      confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.5))),
      source: "ai_estimate" as const,
    }));
  } catch {
    return [];
  }
}

// ── Enrich AI results with food library ──────────────────────────────

function enrichWithFoodLibrary(items: AiFoodEstimate[]): AiFoodEstimate[] {
  return items.map((item) => {
    const match = lookupFood(item.foodName, item.quantityG);
    if (match) {
      return {
        ...item,
        kcal: match.scaled.kcal,
        carbG: match.scaled.carbG,
        proteinG: match.scaled.proteinG,
        fatG: match.scaled.fatG,
        source: "food_library" as const,
        confidence: Math.max(item.confidence, 0.75),
      };
    }
    return item;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function sumItems(items: AiFoodEstimate[]) {
  return {
    totalKcal: items.reduce((s, i) => s + i.kcal, 0),
    totalCarbG: Math.round(items.reduce((s, i) => s + i.carbG, 0) * 10) / 10,
    totalProteinG: Math.round(items.reduce((s, i) => s + i.proteinG, 0) * 10) / 10,
    totalFatG: Math.round(items.reduce((s, i) => s + i.fatG, 0) * 10) / 10,
  };
}

/** Create adapter based on env config.
 *  Default: real OpenAI-compatible adapter (throws AiNotConfiguredError if no key).
 *  Set AI_ADAPTER=mock to use MockAiAdapter (for testing / demos).
 */
export function createAiAdapter(): AiAdapter {
  if (process.env.AI_ADAPTER === "mock") {
    return new MockAiAdapter();
  }
  return new OpenAiAdapter();
}
