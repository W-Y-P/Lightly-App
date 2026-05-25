import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

// Skip integration tests if Prisma engine cannot be loaded
let prismaAvailable = false;
let app: FastifyInstance | null = null;

try {
  const { PrismaClient } = await import("@prisma/client");
  const testClient = new PrismaClient();
  await testClient.$connect();
  await testClient.$disconnect();
  prismaAvailable = true;
} catch {
  // Prisma engine not loadable
}

const describeIntegration = prismaAvailable ? describe : describe.skip;

beforeAll(async () => {
  if (!prismaAvailable) return;
  process.env.JWT_SECRET = "test-secret";
  process.env.AI_ADAPTER = "mock";
  process.env.AI_API_KEY = "";
  // Ensure WECHAT vars are empty so mock mode activates
  delete process.env.WECHAT_APP_ID;
  delete process.env.WECHAT_APP_SECRET;
  const { buildServer } = await import("../server.js");
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

// ── WeChat Login Mock ──────────────────────────────────────────────

describeIntegration("POST /auth/wechat (mock mode)", () => {
  it("creates a new user with mock openid from code", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "test-wx-code-001" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.userId).toBeTruthy();
    expect(body.isNew).toBe(true);
  });

  it("returns existing user for same code (idempotent login)", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "test-wx-code-001" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isNew).toBe(false);
  });

  it("returns 400 when code is missing", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_input");
  });

  it("different codes create different users", async () => {
    const res1 = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "code-user-a" },
    });
    const res2 = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "code-user-b" },
    });
    expect(res1.json().userId).not.toBe(res2.json().userId);
  });
});

// ── Photo Quota & Points ───────────────────────────────────────────

describeIntegration("Photo quota: free 1/day + point-based extras", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "photo-test-user" },
    });
    token = res.json().token;
    userId = res.json().userId;
  });

  it("first photo of the day uses free slot", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64", mimeType: "image/jpeg" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.usedPoint).toBe(false);
    expect(body.freeRemaining).toBe(0);
    expect(body.estimate).toBeTruthy();
  });

  it("second photo without usePoint returns requires_point", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64", mimeType: "image/jpeg" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("requires_point");
  });

  it("second photo with usePoint=true but 0 points returns insufficient_points", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64", mimeType: "image/jpeg", usePoint: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("insufficient_points");
  });

  it("after earning a point via star, can spend it on photo", async () => {
    // Manually insert a point for this user (simulating star reward)
    const { prisma } = await import("../prisma.js");
    await prisma.user.update({
      where: { id: userId },
      data: { pointBalance: { increment: 1 } },
    });

    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64", mimeType: "image/jpeg", usePoint: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.usedPoint).toBe(true);
    expect(body.pointBalance).toBe(0); // spent the 1 point
  });

  it("balance 0 with usePoint=true returns insufficient_points and balance stays 0", async () => {
    // At this point balance is 0 (from the previous test spending the only point)
    const { prisma } = await import("../prisma.js");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { pointBalance: true } });
    expect(user?.pointBalance).toBe(0);

    const res = await app!.inject({
      method: "POST",
      url: "/ai/meal-photo-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { imageBase64: "fake-base64", mimeType: "image/jpeg", usePoint: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("insufficient_points");

    // Balance must remain 0 — never go negative
    const after = await prisma.user.findUnique({ where: { id: userId }, select: { pointBalance: true } });
    expect(after?.pointBalance).toBe(0);
  });

  it("GET /points/entitlement returns point balance and quota", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/points/entitlement",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pointBalance).toBe(0);
    expect(body.photoQuota).toBeDefined();
    expect(body.photoQuota.freeRemaining).toBe(0);
    expect(body.photoQuota.totalToday).toBeGreaterThanOrEqual(2);
  });
});

// ── Star Point Idempotency ─────────────────────────────────────────

describeIntegration("Star point award is idempotent", () => {
  it("awards point on first star summary and skips on repeat", async () => {
    // Create a fresh user for this test
    const regRes = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "star-idempotent-user" },
    });
    const token = regRes.json().token;
    const userId = regRes.json().userId;

    // Create a plan with a low deficit target so it's easy to earn a star
    const planRes = await app!.inject({
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
        weeklyLossKg: 0.1, // very low target → easy to hit
      },
    });
    expect(planRes.statusCode).toBe(200);

    const today = new Date().toISOString().slice(0, 10);

    // Record 2 meals so isRecordComplete = true
    await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "breakfast",
        status: "recorded",
        items: [{ foodName: "白米饭", quantityG: 100, kcal: 50, carbG: 10, proteinG: 2, fatG: 0 }],
      },
    });
    await app!.inject({
      method: "POST",
      url: "/meals",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: today,
        mealSlot: "lunch",
        status: "recorded",
        items: [{ foodName: "白米饭", quantityG: 100, kcal: 50, carbG: 10, proteinG: 2, fatG: 0 }],
      },
    });

    // First summary request → should award point
    const sum1 = await app!.inject({
      method: "GET",
      url: `/daily-summary?date=${today}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sum1.statusCode).toBe(200);
    const body1 = sum1.json();
    expect(body1.star.awarded).toBe(true);
    expect(body1.star.pointAwarded).toBe(true);
    expect(body1.pointBalance).toBe(1);

    // Second summary request → should NOT award again
    const sum2 = await app!.inject({
      method: "GET",
      url: `/daily-summary?date=${today}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body2 = sum2.json();
    expect(body2.star.awarded).toBe(true);
    expect(body2.star.pointAwarded).toBe(false);
    expect(body2.pointBalance).toBe(1); // still 1, not 2
  });
});

// ── AI Not Configured ──────────────────────────────────────────────

describe("AI adapter not configured", () => {
  it("POST /ai/meal-photo-estimate returns 503 when AI key is missing", async () => {
    if (!app) return;
    // Register a user first
    const regRes = await app.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "ai-error-user" },
    });
    const token = regRes.json().token;

    // Temporarily switch AI adapter to real (no key → error)
    const savedAdapter = process.env.AI_ADAPTER;
    process.env.AI_ADAPTER = "real";
    process.env.AI_API_KEY = "";

    // Need to reimport to pick up the env change, but createAiAdapter reads env at call time
    // So this should work with the existing server instance
    const res = await app.inject({
      method: "POST",
      url: "/ai/meal-text-estimate",
      headers: { authorization: `Bearer ${token}` },
      payload: { description: "200g白米饭" },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("ai_not_configured");

    // Restore
    if (savedAdapter) process.env.AI_ADAPTER = savedAdapter;
    else delete process.env.AI_ADAPTER;
  });
});

// ── Account Delete Cleanup ─────────────────────────────────────────

describeIntegration("Account deletion cleans up points and logs", () => {
  it("deletes user and all related data including point transactions", async () => {
    // Create user
    const regRes = await app!.inject({
      method: "POST",
      url: "/auth/wechat",
      payload: { code: "delete-test-user" },
    });
    const token = regRes.json().token;
    const userId = regRes.json().userId;

    // Give them a point
    const { prisma } = await import("../prisma.js");
    await prisma.pointTransaction.create({
      data: { userId, amount: 1, reason: "star_reward", refDate: "2025-01-01" },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { pointBalance: 1 },
    });

    // Verify point exists
    const txBefore = await prisma.pointTransaction.count({ where: { userId } });
    expect(txBefore).toBeGreaterThan(0);

    // Delete account
    const delRes = await app!.inject({
      method: "DELETE",
      url: "/account",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().deleted).toBe(true);

    // Verify all cleaned up
    const txAfter = await prisma.pointTransaction.count({ where: { userId } });
    expect(txAfter).toBe(0);
    const userAfter = await prisma.user.findUnique({ where: { id: userId } });
    expect(userAfter).toBeNull();
  });
});

// ── Guest login still works ────────────────────────────────────────

describeIntegration("POST /auth/guest still works", () => {
  it("creates guest user without tier field", async () => {
    const res = await app!.inject({ method: "POST", url: "/auth/guest" });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.userId).toBeTruthy();
    expect(body.isNew).toBe(true);
    // tier should NOT be in the response
    expect(body.tier).toBeUndefined();
  });
});
