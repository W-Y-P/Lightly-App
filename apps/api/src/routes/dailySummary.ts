import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import { summarizeDay, evaluateStarRule } from "../domain.js";

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

/**
 * Award 1 point for a star day. Idempotent: uses a unique constraint
 * on (userId, reason="star_reward", refDate=YYYY-MM-DD) to prevent double-awarding.
 * Both the PointTransaction creation and User balance update run inside a single
 * Prisma interactive transaction so they either both succeed or both roll back.
 * Returns true if newly awarded, false if already awarded (unique constraint hit).
 * Re-throws any non-unique-constraint DB errors so callers can handle them.
 */
async function awardStarPoint(userId: string, dateStr: string): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pointTransaction.create({
        data: {
          userId,
          amount: 1,
          reason: "star_reward",
          refDate: dateStr,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { pointBalance: { increment: 1 } },
      });
    });
    return true; // newly awarded
  } catch (err: any) {
    // P2002 = Prisma unique constraint violation → already awarded today
    if (err?.code === "P2002") {
      return false;
    }
    // All other DB errors must surface to the caller
    throw err;
  }
}

export async function dailySummaryRoutes(app: FastifyInstance) {
  // ── GET /daily-summary?date=YYYY-MM-DD ──────────────────────────
  app.get("/daily-summary", { preHandler: [authGuard] }, async (request) => {
    const { date } = request.query as { date?: string };
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    const dateFilter = startOfDay(dateStr);

    // Get active plan
    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });

    if (!plan) {
      return {
        date: dateStr,
        hasPlan: false,
        message: "还没有创建计划，无法生成每日总结。",
      };
    }

    // Get meals for the day
    const meals = await prisma.mealEntry.findMany({
      where: { userId: request.userId!, date: dateFilter },
      include: { items: true },
    });

    // Get exercises for the day
    const exercises = await prisma.exerciseEntry.findMany({
      where: { userId: request.userId!, date: dateFilter },
    });

    // Count distinct meal slots that are recorded (not just skipped)
    const recordedSlots = new Set(
      meals.filter((m) => m.status === "recorded").map((m) => m.mealSlot),
    );
    // Also count skipped/fasting slots toward "complete" tracking
    const allTouchedSlots = new Set(meals.map((m) => m.mealSlot));

    const intakeKcal = meals.reduce((s, m) => s + m.totalKcal, 0);
    const exerciseKcal = exercises.reduce((s, e) => s + e.confirmedKcal, 0);

    const summary = summarizeDay({
      tdeeKcal: plan.tdeeKcal,
      targetDeficitKcal: plan.dailyDeficitTargetKcal,
      intakeKcal,
      exerciseKcal,
      recordedMealSlots: Math.max(recordedSlots.size, allTouchedSlots.size),
    });

    const starRule = evaluateStarRule(
      Math.max(recordedSlots.size, allTouchedSlots.size),
      summary.actualDeficitKcal,
      plan.dailyDeficitTargetKcal,
    );

    // Upsert daily summary cache
    await prisma.dailySummary.upsert({
      where: { userId_date: { userId: request.userId!, date: dateFilter } },
      create: {
        userId: request.userId!,
        date: dateFilter,
        intakeKcal,
        exerciseKcal,
        actualDeficitKcal: summary.actualDeficitKcal,
        targetDeficitKcal: plan.dailyDeficitTargetKcal,
        recordedMealSlots: Math.max(recordedSlots.size, allTouchedSlots.size),
        isRecordComplete: summary.isRecordComplete,
        starAwarded: starRule.starAwarded,
      },
      update: {
        intakeKcal,
        exerciseKcal,
        actualDeficitKcal: summary.actualDeficitKcal,
        targetDeficitKcal: plan.dailyDeficitTargetKcal,
        recordedMealSlots: Math.max(recordedSlots.size, allTouchedSlots.size),
        isRecordComplete: summary.isRecordComplete,
        starAwarded: starRule.starAwarded,
      },
    });

    // Award point if star earned (idempotent)
    let pointAwarded = false;
    if (starRule.starAwarded) {
      pointAwarded = await awardStarPoint(request.userId!, dateStr);
    }

    // Get current point balance
    const user = await prisma.user.findUnique({
      where: { id: request.userId! },
      select: { pointBalance: true },
    });

    return {
      date: dateStr,
      hasPlan: true,
      plan: {
        tdeeKcal: plan.tdeeKcal,
        targetDeficitKcal: plan.dailyDeficitTargetKcal,
        recommendedIntakeKcal: plan.recommendedIntakeKcal,
      },
      intake: {
        totalKcal: intakeKcal,
        carbG: meals.reduce((s, m) => s + m.carbG, 0),
        proteinG: meals.reduce((s, m) => s + m.proteinG, 0),
        fatG: meals.reduce((s, m) => s + m.fatG, 0),
      },
      exercise: {
        totalKcal: exerciseKcal,
        count: exercises.length,
      },
      summary: {
        actualDeficitKcal: summary.actualDeficitKcal,
        remainingIntakeKcal: summary.remainingIntakeKcal,
        achievementRate: summary.achievementRate,
        effectiveExerciseKcal: summary.effectiveExerciseKcal,
      },
      star: {
        awarded: starRule.starAwarded,
        isRecordComplete: starRule.isRecordComplete,
        recordedMealSlots: recordedSlots.size,
        pointAwarded,
        warnings: [...summary.warnings, ...starRule.warnings],
      },
      pointBalance: user?.pointBalance ?? 0,
    };
  });
}
