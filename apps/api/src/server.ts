import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { buildPlan, estimateExerciseKcal, exerciseTypes, summarizeDay } from "./domain.js";

const server = Fastify({
  logger: true
});

await server.register(cors, {
  origin: true
});

const planPreviewSchema = z.object({
  sex: z.enum(["male", "female"]),
  age: z.number().int().min(13).max(100),
  heightCm: z.number().min(120).max(230),
  currentWeightKg: z.number().min(30).max(250),
  targetWeightKg: z.number().min(30).max(250),
  activityMultiplier: z.number().min(1.1).max(2.2),
  weeklyLossKg: z.number().min(0.1).max(2).optional(),
  targetDate: z.string().datetime().optional(),
  plannedExerciseKcal: z.number().min(0).max(2000).optional(),
  exerciseReturnRatio: z.number().min(0.5).max(1).optional()
});

const exerciseEstimateSchema = z.object({
  exerciseType: z.string().min(1),
  weightKg: z.number().min(30).max(250),
  durationMin: z.number().int().min(1).max(600)
});

const dailySummarySchema = z.object({
  tdeeKcal: z.number().int().min(800).max(6000),
  targetDeficitKcal: z.number().int().min(1).max(3000),
  intakeKcal: z.number().int().min(0).max(10000),
  exerciseKcal: z.number().int().min(0).max(5000),
  exerciseReturnRatio: z.number().min(0.5).max(1).optional(),
  recordedMealSlots: z.number().int().min(0).max(5)
});

server.get("/health", async () => ({
  ok: true,
  service: "fat-loss-api",
  now: new Date().toISOString()
}));

server.get("/exercise-types", async () => ({
  exerciseTypes
}));

server.post("/plans/preview", async (request, reply) => {
  const parsed = planPreviewSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_plan_input", issues: parsed.error.flatten() });
  }

  if (!parsed.data.weeklyLossKg && !parsed.data.targetDate) {
    return reply.code(400).send({ error: "goal_required", message: "weeklyLossKg or targetDate is required" });
  }

  return buildPlan(parsed.data);
});

server.post("/exercises/estimate", async (request, reply) => {
  const parsed = exerciseEstimateSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_exercise_input", issues: parsed.error.flatten() });
  }

  const exercise = exerciseTypes.find((item) => item.name === parsed.data.exerciseType);
  if (!exercise) {
    return reply.code(404).send({ error: "exercise_type_not_found" });
  }

  return {
    exerciseType: exercise.name,
    met: exercise.met,
    estimatedKcal: estimateExerciseKcal(exercise.met, parsed.data.weightKg, parsed.data.durationMin)
  };
});

server.post("/daily-summaries/preview", async (request, reply) => {
  const parsed = dailySummarySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_daily_summary_input", issues: parsed.error.flatten() });
  }

  return summarizeDay(parsed.data);
});

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 8797);

try {
  await server.listen({ host, port });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
