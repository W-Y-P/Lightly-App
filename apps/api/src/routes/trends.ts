import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import { weightMovingAverage } from "../domain.js";

export async function trendRoutes(app: FastifyInstance) {
  // ── GET /trends/weight ──────────────────────────────────────────
  app.get("/trends/weight", { preHandler: [authGuard] }, async (request) => {
    const { days } = request.query as { days?: string };
    const lookbackDays = Math.min(Number(days) || 30, 180);
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const weights = await prisma.weightEntry.findMany({
      where: { userId: request.userId!, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const points = weights.map((w) => ({
      date: w.date.toISOString().slice(0, 10),
      weightKg: w.weightKg,
    }));

    const movingAverage = weightMovingAverage(points);

    // Get plan target weight line
    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });

    return {
      points,
      movingAverage,
      planTarget: plan?.targetWeightKg ?? null,
      planStart: plan?.currentWeightKg ?? null,
    };
  });

  // ── GET /trends/deficit ─────────────────────────────────────────
  app.get("/trends/deficit", { preHandler: [authGuard] }, async (request) => {
    const { days } = request.query as { days?: string };
    const lookbackDays = Math.min(Number(days) || 30, 180);
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const summaries = await prisma.dailySummary.findMany({
      where: { userId: request.userId!, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: summaries.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        intakeKcal: s.intakeKcal,
        exerciseKcal: s.exerciseKcal,
        actualDeficitKcal: s.actualDeficitKcal,
        targetDeficitKcal: s.targetDeficitKcal,
      })),
      targetDeficitKcal: plan?.dailyDeficitTargetKcal ?? null,
    };
  });

  // ── GET /trends/macros ──────────────────────────────────────────
  app.get("/trends/macros", { preHandler: [authGuard] }, async (request) => {
    const { days } = request.query as { days?: string };
    const lookbackDays = Math.min(Number(days) || 30, 180);
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const meals = await prisma.mealEntry.findMany({
      where: { userId: request.userId!, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    // Group by date
    const byDate = new Map<string, { carbG: number; proteinG: number; fatG: number }>();
    for (const m of meals) {
      const dateStr = m.date.toISOString().slice(0, 10);
      const existing = byDate.get(dateStr) ?? { carbG: 0, proteinG: 0, fatG: 0 };
      existing.carbG += m.carbG;
      existing.proteinG += m.proteinG;
      existing.fatG += m.fatG;
      byDate.set(dateStr, existing);
    }

    return {
      data: [...byDate.entries()].sort().map(([date, macros]) => ({
        date,
        carbG: macros.carbG,
        proteinG: macros.proteinG,
        fatG: macros.fatG,
      })),
    };
  });

  // ── GET /trends/stars ───────────────────────────────────────────
  app.get("/trends/stars", { preHandler: [authGuard] }, async (request) => {
    const { days } = request.query as { days?: string };
    const lookbackDays = Math.min(Number(days) || 30, 180);
    const since = new Date(Date.now() - lookbackDays * 86_400_000);

    const summaries = await prisma.dailySummary.findMany({
      where: { userId: request.userId!, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    const totalStars = summaries.filter((s) => s.starAwarded).length;
    const totalDays = summaries.length;

    // Streak: consecutive star days from most recent
    let currentStreak = 0;
    for (let i = summaries.length - 1; i >= 0; i--) {
      if (summaries[i].starAwarded) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      data: summaries.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        starAwarded: s.starAwarded,
        isRecordComplete: s.isRecordComplete,
        actualDeficitKcal: s.actualDeficitKcal,
        targetDeficitKcal: s.targetDeficitKcal,
      })),
      stats: {
        totalStars,
        totalDays,
        currentStreak,
      },
    };
  });
}
