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
    "GET /subscription/entitlement",
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
  });

  it("gets subscription entitlement", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/subscription/entitlement",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tier).toBe("free");
  });
});

describeIntegration("meal status handling", () => {
  let token: string;

  beforeAll(async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    token = res.json().token;

    // Create a plan so daily-summary works
    await app!.inject({
      method: "POST",
      url: "/plans",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sex: "male",
        age: 30,
        heightCm: 170,
        currentWeightKg: 75,
        targetWeightKg: 65,
        activityMultiplier: 1.4,
        weeklyLossKg: 0.5,
      },
    });
  });

  const today = new Date().toISOString().slice(0, 10);

  it("POST /meals with status=skipped and no items succeeds", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "breakfast",
        status: "skipped",
      },
    });
    expect(res.statusCode).toBe(201);
    const meal = res.json().meal;
    expect(meal.status).toBe("skipped");
    expect(meal.items).toHaveLength(0);
    expect(meal.totalKcal).toBe(0);
    expect(meal.carbG).toBe(0);
    expect(meal.proteinG).toBe(0);
    expect(meal.fatG).toBe(0);
  });

  it("POST /meals with status=fasting and no items succeeds", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "lunch",
        status: "fasting",
      },
    });
    expect(res.statusCode).toBe(201);
    const meal = res.json().meal;
    expect(meal.status).toBe("fasting");
    expect(meal.items).toHaveLength(0);
    expect(meal.totalKcal).toBe(0);
  });

  it("POST /meals with status=skipped and empty items array succeeds", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "drink",
        status: "skipped",
        items: [],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().meal.status).toBe("skipped");
    expect(res.json().meal.items).toHaveLength(0);
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

    // We created: breakfast (skipped), lunch (fasting), drink (skipped), other (recorded→skipped),
    // dinner (recorded→fasting), plus one other (recorded) from a different test
    // At minimum 4+ distinct meal slots touched
    expect(body.hasPlan).toBe(true);
    // intake should be 0 since all meals ended up skipped/fasting
    // (the recorded ones were patched to skipped/fasting)
    expect(body.intake.totalKcal).toBe(0);
    // star.recordedMealSlots should reflect all touched slots (recorded + skipped + fasting)
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

  it("POST /ai/meal-photo-estimate returns estimate", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64-data", mimeType: "image/jpeg" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.estimate).toBeTruthy();
    expect(body.remaining).toBeDefined();
    expect(body.note).toContain("照片");
  });
});
