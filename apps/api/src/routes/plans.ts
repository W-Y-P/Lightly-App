import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import {
  buildPlan,
  calculateBmr,
  calculateDailyDeficit,
  calculateMacroTargets,
  suggestCalibration,
  weightMovingAverage,
} from "../domain.js";

const createPlanSchema = z.object({
  sex: z.enum(["male", "female"]),
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(120).max(230),
  currentWeightKg: z.number().min(30).max(250),
  targetWeightKg: z.number().min(30).max(250),
  activityMultiplier: z.number().min(1.1).max(2.2),
  weeklyLossKg: z.number().min(0.1).max(2).optional(),
  targetDate: z.string().optional(),
  plannedExerciseKcal: z.number().min(0).max(2000).optional(),
  exerciseReturnRatio: z.number().min(0.5).max(1).optional(),
});

const goalPatchSchema = z.object({
  targetWeightKg: z.number().min(30).max(250).optional(),
  weeklyLossKg: z.number().min(0.1).max(2).optional(),
  targetDate: z.string().optional(),
});

const macrosPatchSchema = z.object({
  proteinMinG: z.number().int().min(0).optional(),
  proteinMaxG: z.number().int().min(0).optional(),
  carbMinG: z.number().int().min(0).optional(),
  carbMaxG: z.number().int().min(0).optional(),
  fatMinG: z.number().int().min(0).optional(),
  fatMaxG: z.number().int().min(0).optional(),
});

const activityPatchSchema = z.object({
  activityLevel: z.number().min(1.2).max(1.75),
});

export async function planRoutes(app: FastifyInstance) {
  // ── POST /plans ─────────────────────────────────────────────────
  app.post("/plans", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_plan_input", issues: parsed.error.flatten() });
    }

    if (!parsed.data.weeklyLossKg && !parsed.data.targetDate) {
      return reply.code(400).send({ error: "goal_required", message: "weeklyLossKg 或 targetDate 至少需要一个" });
    }

    const planResult = buildPlan(parsed.data);

    // Deactivate previous plans
    await prisma.plan.updateMany({
      where: { userId: request.userId!, activeTo: null },
      data: { activeTo: new Date() },
    });

    const plan = await prisma.plan.create({
      data: {
        userId: request.userId!,
        currentWeightKg: parsed.data.currentWeightKg,
        targetWeightKg: parsed.data.targetWeightKg,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
        weeklyLossKg: parsed.data.weeklyLossKg ?? null,
        heightCm: parsed.data.heightCm,
        age: parsed.data.age,
        sex: parsed.data.sex,
        activityLevel: parsed.data.activityMultiplier,
        bmrKcal: planResult.bmrKcal,
        tdeeKcal: planResult.tdeeKcal,
        dailyDeficitTargetKcal: planResult.dailyDeficitTargetKcal,
        recommendedIntakeKcal: planResult.recommendedIntakeKcal,
        proteinMinG: planResult.macroTargets.proteinMinG,
        proteinMaxG: planResult.macroTargets.proteinMaxG,
        carbMinG: planResult.macroTargets.carbMinG,
        carbMaxG: planResult.macroTargets.carbMaxG,
        fatMinG: planResult.macroTargets.fatMinG,
        fatMaxG: planResult.macroTargets.fatMaxG,
      },
    });

    return { plan, warnings: planResult.warnings };
  });

  // ── GET /plans/current ──────────────────────────────────────────
  app.get("/plans/current", { preHandler: [authGuard] }, async (request, reply) => {
    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });

    if (!plan) {
      return reply.code(404).send({ error: "no_active_plan", message: "还没有创建计划" });
    }

    return { plan };
  });

  // ── PATCH /plans/current/goal ───────────────────────────────────
  app.patch("/plans/current/goal", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = goalPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_goal_input", issues: parsed.error.flatten() });
    }

    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return reply.code(404).send({ error: "no_active_plan" });
    }

    const newTargetWeight = parsed.data.targetWeightKg ?? plan.targetWeightKg;
    const newWeeklyLoss = parsed.data.weeklyLossKg ?? plan.weeklyLossKg;
    const newTargetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : plan.targetDate;

    const dailyDeficitTargetKcal = newWeeklyLoss
      ? Math.round((newWeeklyLoss * 7700) / 7)
      : newTargetDate
        ? Math.round(((plan.currentWeightKg - newTargetWeight) * 7700) / Math.max(1, Math.ceil((newTargetDate.getTime() - Date.now()) / 86_400_000)))
        : plan.dailyDeficitTargetKcal;

    const recommendedIntakeKcal = Math.round(
      plan.tdeeKcal - dailyDeficitTargetKcal,
    );
    const macroTargets = calculateMacroTargets(plan.currentWeightKg, recommendedIntakeKcal);

    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: {
        targetWeightKg: newTargetWeight,
        weeklyLossKg: newWeeklyLoss,
        targetDate: newTargetDate,
        dailyDeficitTargetKcal,
        recommendedIntakeKcal,
        ...macroTargets,
      },
    });

    return { plan: updated };
  });

  // ── PATCH /plans/current/macros ─────────────────────────────────
  app.patch("/plans/current/macros", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = macrosPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_macros_input", issues: parsed.error.flatten() });
    }

    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return reply.code(404).send({ error: "no_active_plan" });
    }

    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: {
        proteinMinG: parsed.data.proteinMinG ?? plan.proteinMinG,
        proteinMaxG: parsed.data.proteinMaxG ?? plan.proteinMaxG,
        carbMinG: parsed.data.carbMinG ?? plan.carbMinG,
        carbMaxG: parsed.data.carbMaxG ?? plan.carbMaxG,
        fatMinG: parsed.data.fatMinG ?? plan.fatMinG,
        fatMaxG: parsed.data.fatMaxG ?? plan.fatMaxG,
      },
    });

    return { plan: updated };
  });

  // ── PATCH /plans/current/activity ────────────────────────────────
  app.patch("/plans/current/activity", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = activityPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_activity_input", issues: parsed.error.flatten() });
    }

    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return reply.code(404).send({ error: "no_active_plan" });
    }

    const bmrKcal = calculateBmr({
      sex: plan.sex as "male" | "female",
      age: plan.age,
      heightCm: plan.heightCm,
      currentWeightKg: plan.currentWeightKg,
    });
    const tdeeKcal = Math.round(bmrKcal * parsed.data.activityLevel);
    const requestedDailyDeficitKcal = plan.weeklyLossKg || plan.targetDate
      ? calculateDailyDeficit({
        currentWeightKg: plan.currentWeightKg,
        targetWeightKg: plan.targetWeightKg,
        weeklyLossKg: plan.weeklyLossKg ?? undefined,
        targetDate: plan.targetDate?.toISOString(),
      })
      : plan.dailyDeficitTargetKcal;
    const recommendedIntakeKcal = Math.max(1200, tdeeKcal - requestedDailyDeficitKcal);
    const dailyDeficitTargetKcal = Math.max(0, tdeeKcal - recommendedIntakeKcal);

    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: {
        activityLevel: parsed.data.activityLevel,
        bmrKcal,
        tdeeKcal,
        dailyDeficitTargetKcal,
        recommendedIntakeKcal,
      },
    });

    return { plan: updated };
  });

  // ── POST /plans/current/accept-calibration ──────────────────────
  app.post("/plans/current/accept-calibration", { preHandler: [authGuard] }, async (request, reply) => {
    const plan = await prisma.plan.findFirst({
      where: { userId: request.userId!, activeTo: null },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) {
      return reply.code(404).send({ error: "no_active_plan" });
    }

    // Gather weight data
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
    const weightEntries = await prisma.weightEntry.findMany({
      where: { userId: request.userId!, date: { gte: fourteenDaysAgo } },
      orderBy: { date: "asc" },
    });

    const weightPoints = weightEntries.map((w) => ({
      date: w.date.toISOString().slice(0, 10),
      weightKg: w.weightKg,
    }));

    // Need unique days
    const uniqueDays = new Set(weightPoints.map((p) => p.date)).size;

    if (uniqueDays < 7) {
      return reply.code(200).send({
        status: "insufficient_data",
        reason: `体重数据不足，目前只有 ${uniqueDays} 天记录。建议至少记录 14 天体重后再校准。`,
        weightDataDays: uniqueDays,
        requiredDays: 14,
      });
    }

    const ma = weightMovingAverage(weightPoints);
    const startWeight = ma[0].weightKg;
    const endWeight = ma[ma.length - 1].weightKg;
    const windowDays = Math.max(1, Math.ceil(
      (new Date(ma[ma.length - 1].date).getTime() - new Date(ma[0].date).getTime()) / 86_400_000,
    ));

    // Average intake/exercise from summaries
    const summaries = await prisma.dailySummary.findMany({
      where: { userId: request.userId!, date: { gte: fourteenDaysAgo } },
    });
    const avgIntake = summaries.length > 0
      ? summaries.reduce((s, d) => s + d.intakeKcal, 0) / summaries.length
      : plan.recommendedIntakeKcal;
    const avgExercise = summaries.length > 0
      ? summaries.reduce((s, d) => s + d.exerciseKcal, 0) / summaries.length
      : 0;

    const calibration = suggestCalibration({
      weightDataDays: uniqueDays,
      startWeightKg: startWeight,
      endWeightKg: endWeight,
      windowDays,
      avgIntakeKcal: avgIntake,
      avgExerciseKcal: avgExercise,
      planTdeeKcal: plan.tdeeKcal,
      planDeficitTargetKcal: plan.dailyDeficitTargetKcal,
    });

    if (calibration.status === "insufficient_data") {
      return reply.code(200).send(calibration);
    }

    // Apply calibration: adjust TDEE and recalculate
    const newTdee = plan.tdeeKcal + calibration.suggestedTdeeAdjustmentKcal;
    const newRecommendedIntake = Math.round(newTdee - plan.dailyDeficitTargetKcal);
    const macroTargets = calculateMacroTargets(plan.currentWeightKg, newRecommendedIntake);

    // Deactivate old plan, create new
    await prisma.plan.update({
      where: { id: plan.id },
      data: { activeTo: new Date() },
    });

    const newPlan = await prisma.plan.create({
      data: {
        userId: request.userId!,
        currentWeightKg: plan.currentWeightKg,
        targetWeightKg: plan.targetWeightKg,
        targetDate: plan.targetDate,
        weeklyLossKg: plan.weeklyLossKg,
        heightCm: plan.heightCm,
        age: plan.age,
        sex: plan.sex,
        activityLevel: plan.activityLevel,
        bmrKcal: plan.bmrKcal,
        tdeeKcal: newTdee,
        dailyDeficitTargetKcal: plan.dailyDeficitTargetKcal,
        recommendedIntakeKcal: newRecommendedIntake,
        ...macroTargets,
      },
    });

    return {
      status: "calibrated",
      calibration,
      newPlan,
    };
  });
}
