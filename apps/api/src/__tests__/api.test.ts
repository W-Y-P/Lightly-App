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
    const path = urlWithQuery.split("?")[0];
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
