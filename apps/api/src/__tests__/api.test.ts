import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

// Skip integration tests if Prisma engine cannot be loaded (macOS code-signing env issue)
let prismaAvailable = false;
let app: FastifyInstance | null = null;

try {
  // Quick check: can we load the prisma client?
  const { PrismaClient } = await import("@prisma/client");
  const testClient = new PrismaClient();
  await testClient.$connect();
  await testClient.$disconnect();
  prismaAvailable = true;
} catch {
  // Prisma engine not loadable (code-signing, no DB, etc.)
}

const describeIntegration = prismaAvailable ? describe : describe.skip;

beforeAll(async () => {
  if (!prismaAvailable) return;
  process.env.JWT_SECRET = "test-secret";
  process.env.AI_ADAPTER = "mock";
  process.env.AI_API_KEY = "";
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("fat-loss-api");
  });
});

describe("GET /exercise-types", () => {
  it("returns exercise catalog without auth", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/exercise-types" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exerciseTypes.length).toBeGreaterThan(0);
  });
});

describe("protected routes without auth", () => {
  const routes = [
    "GET /plans/current",
    "GET /meals?date=2025-01-01",
    "GET /exercises?date=2025-01-01",
    "GET /weights",
    "GET /daily-summary?date=2025-01-01",
    "GET /trends/weight",
    "GET /points/entitlement",
  ];

  for (const route of routes) {
    const [method, urlWithQuery] = route.split(" ");
    it(`${route} returns 401 without token`, async () => {
      if (!app) return;
      const res = await app.inject({ method: method as any, url: urlWithQuery });
      expect(res.statusCode).toBe(401);
    });
  }
});

describeIntegration("full flow: guest → plan → meal → summary", () => {
  let token: string;

  it("creates guest", async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    expect(res.statusCode).toBe(201);
    token = res.json().token;
    expect(token).toBeTruthy();
    // No tier in response
    expect(res.json().tier).toBeUndefined();
  });

  it("creates a plan", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sex: "male",
        age: 28,
        heightCm: 175,
        currentWeightKg: 80,
        targetWeightKg: 70,
        activityMultiplier: 1.4,
        weeklyLossKg: 0.5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan).toBeTruthy();
    expect(body.plan.bmrKcal).toBeGreaterThan(0);
  });

  it("gets current plan", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/plans/current",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan).toBeTruthy();
  });

  it("records a meal", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "breakfast",
        items: [
          { foodName: "白米饭", quantityG: 200, kcal: 232, carbG: 51.8, proteinG: 5.2, fatG: 0.6 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().meal).toBeTruthy();
  });

  it("gets meals for today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app!.inject({
      method: "GET",
      url: `/meals?date=${today}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meals.length).toBeGreaterThan(0);
  });

  it("gets daily summary", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app!.inject({
      method: "GET",
      url: `/daily-summary?date=${today}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasPlan).toBe(true);
    expect(body.intake.totalKcal).toBeGreaterThanOrEqual(0);
    // pointBalance should be present
    expect(body.pointBalance).toBeDefined();
  });

  it("gets entitlement (points/quota)", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/points/entitlement",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // No tier field — now returns point/quota info
    expect(body.tier).toBeUndefined();
    expect(body.pointBalance).toBeDefined();
    expect(body.photoQuota).toBeDefined();
  });
});

describeIntegration("full flow: weight → trends → calibration", () => {
  let token: string;

  beforeAll(async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    token = res.json().token;

    // Create plan
    await app!.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sex: "male",
        age: 30,
        heightCm: 180,
        currentWeightKg: 90,
        targetWeightKg: 80,
        activityMultiplier: 1.3,
        weeklyLossKg: 0.5,
      },
    });
  });

  it("records weight", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app!.inject({
      method: "POST",
      url: "/weights",
      headers: { authorization: `Bearer ${token}` },
      payload: { date: today, weightKg: 89.5 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("gets weight trends", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/trends/weight?days=30",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().points.length).toBeGreaterThan(0);
  });

  it("gets deficit trends", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/trends/deficit?days=30",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("gets star trends", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/trends/stars?days=30",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stats).toBeDefined();
  });

  it("gets calibration suggestion", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/plans/current/calibration",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describeIntegration("meal PATCH status transitions", () => {
  let token: string;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    token = res.json().token;

    await app!.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sex: "female",
        age: 25,
        heightCm: 163,
        currentWeightKg: 60,
        targetWeightKg: 55,
        activityMultiplier: 1.3,
        weeklyLossKg: 0.3,
      },
    });
  });

  it("POST /meals with status=recorded and no items fails", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "dinner",
        status: "recorded",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("invalid_meal_input");
  });

  it("POST /meals with status=recorded and empty items array fails", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "dinner",
        status: "recorded",
        items: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH recorded→skipped clears items and zeros macros", async () => {
    // First create a recorded meal with items
    const createRes = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "other",
        status: "recorded",
        items: [
          { foodName: "鸡胸肉", quantityG: 200, kcal: 330, carbG: 0, proteinG: 40, fatG: 18 },
          { foodName: "糙米饭", quantityG: 150, kcal: 165, carbG: 35, proteinG: 4, fatG: 1 },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const mealId = createRes.json().meal.id;
    expect(createRes.json().meal.totalKcal).toBe(495);

    // Now patch to skipped
    const patchRes = await app!.inject({
      method: "PATCH",
      url: `/meals/${mealId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "skipped" },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json().meal;
    expect(patched.status).toBe("skipped");
    expect(patched.items).toHaveLength(0);
    expect(patched.totalKcal).toBe(0);
    expect(patched.carbG).toBe(0);
    expect(patched.proteinG).toBe(0);
    expect(patched.fatG).toBe(0);
  });

  it("PATCH recorded→fasting clears items and zeros macros", async () => {
    const createRes = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "dinner",
        status: "recorded",
        items: [
          { foodName: "沙拉", quantityG: 200, kcal: 120, carbG: 10, proteinG: 5, fatG: 7 },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const mealId = createRes.json().meal.id;

    const patchRes = await app!.inject({
      method: "PATCH",
      url: `/meals/${mealId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "fasting" },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = patchRes.json().meal;
    expect(patched.status).toBe("fasting");
    expect(patched.items).toHaveLength(0);
    expect(patched.totalKcal).toBe(0);
  });

  it("daily-summary counts skipped/fasting meals toward completion", async () => {
    const res = await app!.inject({
      method: "GET",
      url: `/daily-summary?date=${today}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasPlan).toBe(true);
    expect(body.intake.totalKcal).toBe(0);
    expect(body.star.recordedMealSlots).toBeGreaterThanOrEqual(3);
  });
});

describeIntegration("AI endpoints", () => {
  let token: string;

  beforeAll(async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    token = res.json().token;
  });

  it("POST /ai/meal-text-estimate returns estimate", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-text-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { description: "200g白米饭, 100g鸡胸肉" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.estimate).toBeTruthy();
    expect(body.estimate.totalKcal).toBeGreaterThan(0);
    expect(body.note).toBeTruthy();
  });

  it("POST /ai/meal-photo-estimate returns estimate (free slot)", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64-data", mimeType: "image/jpeg" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.estimate).toBeTruthy();
    expect(body.usedPoint).toBe(false);
    expect(body.freeRemaining).toBeDefined();
    expect(body.note).toContain("照片");
  });

  it("second photo returns requires_point", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64-data", mimeType: "image/jpeg" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("requires_point");
  });
});
