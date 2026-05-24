import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import { weightMovingAverage } from "../domain.js";

const createWeightSchema = z.object({
  date: z.string(),
  weightKg: z.number().min(20).max(300),
  weighingContext: z.enum(["morning_fasted", "after_meal", "evening", "other"]).default("morning_fasted"),
  source: z.string().default("manual"),
});

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

export async function weightRoutes(app: FastifyInstance) {
  // ── POST /weights ───────────────────────────────────────────────
  app.post("/weights", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createWeightSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_weight_input", issues: parsed.error.flatten() });
    }

    const entry = await prisma.weightEntry.create({
      data: {
        userId: request.userId!,
        date: startOfDay(parsed.data.date),
        weightKg: parsed.data.weightKg,
        weighingContext: parsed.data.weighingContext,
        source: parsed.data.source,
      },
    });

    // Also update plan's current weight
    await prisma.plan.updateMany({
      where: { userId: request.userId!, activeTo: null },
      data: { currentWeightKg: parsed.data.weightKg },
    });

    return reply.code(201).send({ weight: entry });
  });

  // ── GET /weights?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────────────
  app.get("/weights", { preHandler: [authGuard] }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };

    const where: any = { userId: request.userId! };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = startOfDay(from);
      if (to) where.date.lte = startOfDay(to);
    }

    const weights = await prisma.weightEntry.findMany({
      where,
      orderBy: { date: "asc" },
    });

    const points = weights.map((w) => ({
      date: w.date.toISOString().slice(0, 10),
      weightKg: w.weightKg,
    }));

    const movingAvg = weightMovingAverage(points);

    return { weights, movingAverage: movingAvg };
  });
}
