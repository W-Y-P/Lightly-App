import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";

// ── Shared item schema ───────────────────────────────────────────────

const mealItemInput = z.object({
  foodName: z.string().min(1),
  quantityG: z.number().positive(),
  kcal: z.number().int().min(0),
  carbG: z.number().min(0),
  proteinG: z.number().min(0),
  fatG: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
  isAiEstimated: z.boolean().default(false),
});

// ── Create schema: items required only when status is "recorded" ─────

const createMealSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "other", "drink"]),
  status: z.enum(["recorded", "skipped", "fasting"]).default("recorded"),
  source: z.string().default("manual"),
  items: z.array(mealItemInput).optional(),
}).superRefine((data, ctx) => {
  if (data.status === "recorded") {
    if (!data.items || data.items.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recorded 状态至少需要一个 item",
        path: ["items"],
      });
    }
  }
});

// ── Update schema: flexible status + item transitions ────────────────

const updateMealSchema = z.object({
  mealSlot: z.enum(["breakfast", "lunch", "dinner", "other", "drink"]).optional(),
  status: z.enum(["recorded", "skipped", "fasting"]).optional(),
  items: z.array(mealItemInput).optional(),
}).superRefine((data, ctx) => {
  // If explicitly setting status to recorded AND providing items, items must be non-empty
  if (data.status === "recorded" && data.items !== undefined && data.items.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "recorded 状态至少需要一个 item",
      path: ["items"],
    });
  }
});

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

function sumItemTotals(items: z.infer<typeof mealItemInput>[]) {
  return items.reduce(
    (acc, item) => ({
      totalKcal: acc.totalKcal + item.kcal,
      carbG: acc.carbG + item.carbG,
      proteinG: acc.proteinG + item.proteinG,
      fatG: acc.fatG + item.fatG,
    }),
    { totalKcal: 0, carbG: 0, proteinG: 0, fatG: 0 },
  );
}

export async function mealRoutes(app: FastifyInstance) {
  // ── POST /meals ─────────────────────────────────────────────────
  app.post("/meals", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = createMealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_meal_input", issues: parsed.error.flatten() });
    }

    const { items, ...mealData } = parsed.data;

    // skipped / fasting → no items, all macros zero
    const isNonRecording = mealData.status === "skipped" || mealData.status === "fasting";
    const effectiveItems = isNonRecording ? [] : (items ?? []);
    const totals = isNonRecording ? { totalKcal: 0, carbG: 0, proteinG: 0, fatG: 0 } : sumItemTotals(effectiveItems);

    const meal = await prisma.mealEntry.create({
      data: {
        userId: request.userId!,
        date: startOfDay(mealData.date),
        mealSlot: mealData.mealSlot,
        status: mealData.status,
        source: mealData.source,
        totalKcal: totals.totalKcal,
        carbG: Math.round(totals.carbG),
        proteinG: Math.round(totals.proteinG),
        fatG: Math.round(totals.fatG),
        confirmedAt: mealData.status === "recorded" ? new Date() : null,
        items: {
          create: effectiveItems.map((item) => ({
            foodName: item.foodName,
            quantityG: item.quantityG,
            kcal: item.kcal,
            carbG: Math.round(item.carbG),
            proteinG: Math.round(item.proteinG),
            fatG: Math.round(item.fatG),
            confidence: item.confidence ?? null,
            isAiEstimated: item.isAiEstimated,
          })),
        },
      },
      include: { items: true },
    });

    return reply.code(201).send({ meal });
  });

  // ── GET /meals?date=YYYY-MM-DD ──────────────────────────────────
  app.get("/meals", { preHandler: [authGuard] }, async (request) => {
    const { date } = request.query as { date?: string };
    const dateFilter = date ? startOfDay(date) : startOfDay(new Date().toISOString().slice(0, 10));

    const meals = await prisma.mealEntry.findMany({
      where: {
        userId: request.userId!,
        date: dateFilter,
      },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    const totals = meals.reduce(
      (acc, m) => ({
        totalKcal: acc.totalKcal + m.totalKcal,
        carbG: acc.carbG + m.carbG,
        proteinG: acc.proteinG + m.proteinG,
        fatG: acc.fatG + m.fatG,
      }),
      { totalKcal: 0, carbG: 0, proteinG: 0, fatG: 0 },
    );

    return { meals, totals };
  });

  // ── PATCH /meals/:id ────────────────────────────────────────────
  app.patch("/meals/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateMealSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_meal_input", issues: parsed.error.flatten() });
    }

    const existing = await prisma.mealEntry.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) {
      return reply.code(404).send({ error: "meal_not_found" });
    }

    const newStatus = parsed.data.status ?? existing.status;

    // ── Transition to skipped / fasting: clear items and zero macros
    if (newStatus === "skipped" || newStatus === "fasting") {
      await prisma.mealItem.deleteMany({ where: { mealEntryId: id } });

      const meal = await prisma.mealEntry.update({
        where: { id },
        data: {
          mealSlot: parsed.data.mealSlot,
          status: newStatus,
          totalKcal: 0,
          carbG: 0,
          proteinG: 0,
          fatG: 0,
          confirmedAt: null,
        },
        include: { items: true },
      });

      return { meal };
    }

    // ── Items explicitly provided: replace and recalc
    if (parsed.data.items) {
      await prisma.mealItem.deleteMany({ where: { mealEntryId: id } });

      const totals = sumItemTotals(parsed.data.items);

      const meal = await prisma.mealEntry.update({
        where: { id },
        data: {
          mealSlot: parsed.data.mealSlot,
          status: newStatus,
          totalKcal: totals.totalKcal,
          carbG: Math.round(totals.carbG),
          proteinG: Math.round(totals.proteinG),
          fatG: Math.round(totals.fatG),
          confirmedAt: new Date(),
          items: {
            create: parsed.data.items.map((item) => ({
              foodName: item.foodName,
              quantityG: item.quantityG,
              kcal: item.kcal,
              carbG: Math.round(item.carbG),
              proteinG: Math.round(item.proteinG),
              fatG: Math.round(item.fatG),
              confidence: item.confidence ?? null,
              isAiEstimated: item.isAiEstimated,
            })),
          },
        },
        include: { items: true },
      });

      return { meal };
    }

    // ── Simple field update (e.g. only mealSlot changed) — preserve existing data
    const meal = await prisma.mealEntry.update({
      where: { id },
      data: {
        mealSlot: parsed.data.mealSlot,
        status: parsed.data.status,
      },
      include: { items: true },
    });

    return { meal };
  });

  // ── DELETE /meals/:id ───────────────────────────────────────────
  app.delete("/meals/:id", { preHandler: [authGuard] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.mealEntry.findFirst({
      where: { id, userId: request.userId! },
    });
    if (!existing) {
      return reply.code(404).send({ error: "meal_not_found" });
    }

    await prisma.mealItem.deleteMany({ where: { mealEntryId: id } });
    await prisma.mealEntry.delete({ where: { id } });

    return { deleted: true };
  });
}
