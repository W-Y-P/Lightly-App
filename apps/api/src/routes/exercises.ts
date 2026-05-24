import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import { estimateExerciseKcal, exerciseTypes } from "../domain.js";

const createExerciseSchema = z.object({
  date: z.string(),
  exerciseType: z.string().min(1),
  durationMin: z.number().int().min(1).max(600),
  weightKg: z.number().min(30).max(250).optional(),
  source: z.string().default("manual"),
});

const updateExerciseSchema = z.object({
  exerciseType: z.string().min(1).optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  confirmedKcal: z.number().int().min(0).optional(),
});

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

export async function exerciseRoutes(app: FastifyInstance) {
  // ── POST /exercises ─────────────────────────────────────────────
  app.post("/exercises", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createExerciseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_exercise_input", issues: parsed.error.flatten() });
    }

    const exercise = exerciseTypes.find((e) => e.name === parsed.data.exerciseType);
    const met = exercise?.met ?? 5.0;

    // Get weight from plan if not provided
    let weightKg = parsed.data.weightKg;
    if (!weightKg) {
      const plan = await prisma.plan.findFirst({
        where: { userId: request.userId!, activeTo: null },
        orderBy: { createdAt: "desc" },
      });
      weightKg = plan?.currentWeightKg ?? 70;
    }

    const rawKcal = estimateExerciseKcal(met, weightKg, parsed.data.durationMin);

    const entry = await prisma.exerciseEntry.create({
      data: {
        userId: request.userId!,
        date: startOfDay(parsed.data.date),
        exerciseType: parsed.data.exerciseType,
        durationMin: parsed.data.durationMin,
        met,
        rawKcal,
        source: parsed.data.source,
        confirmedKcal: rawKcal,
      },
    });

    return reply.code(201).send({ exercise: entry });
  });

  // ── GET /exercises?date=YYYY-MM-DD ──────────────────────────────
  app.get("/exercises", { preHandler: [authGuard] }, async (request) => {
    const { date } = request.query as { date?: string };
    const dateFilter = date ? startOfDay(date) : startOfDay(new Date().toISOString().slice(0, 10));

    const exercises = await prisma.exerciseEntry.findMany({
      where: { userId: request.userId!, date: dateFilter },
      orderBy: { createdAt: "asc" },
    });

    const totalKcal = exercises.reduce((s, e) => s + e.confirmedKcal, 0);

    return { exercises, totalKcal };
  });

  // ── PATCH /exercises/:id ────────────────────────────────────────
  app.patch("/exercises/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateExerciseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_exercise_input", issues: parsed.error.flatten() });
    }

    const existing = await prisma.exerciseEntry.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) {
      return reply.code(404).send({ error: "exercise_not_found" });
    }

    // If type or duration changed, recalculate
    let data: any = {};
    if (parsed.data.exerciseType || parsed.data.durationMin) {
      const typeName = parsed.data.exerciseType ?? existing.exerciseType;
      const duration = parsed.data.durationMin ?? existing.durationMin;
      const ex = exerciseTypes.find((e) => e.name === typeName);
      const met = ex?.met ?? existing.met ?? 5.0;

      const plan = await prisma.plan.findFirst({
        where: { userId: request.userId!, activeTo: null },
        orderBy: { createdAt: "desc" },
      });
      const weightKg = plan?.currentWeightKg ?? 70;
      const rawKcal = estimateExerciseKcal(met, weightKg, duration);

      data = {
        exerciseType: typeName,
        durationMin: duration,
        met,
        rawKcal,
        confirmedKcal: parsed.data.confirmedKcal ?? rawKcal,
      };
    } else if (parsed.data.confirmedKcal !== undefined) {
      data = { confirmedKcal: parsed.data.confirmedKcal };
    }

    const exercise = await prisma.exerciseEntry.update({
      where: { id },
      data,
    });

    return { exercise };
  });

  // ── DELETE /exercises/:id ───────────────────────────────────────
  app.delete("/exercises/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.exerciseEntry.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) {
      return reply.code(404).send({ error: "exercise_not_found" });
    }

    await prisma.exerciseEntry.delete({ where: { id } });

    return { deleted: true };
  });

  // ── GET /exercise-types ─────────────────────────────────────────
  app.get("/exercise-types", async () => ({ exerciseTypes }));
}
