import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";
import { createAiAdapter, AiNotConfiguredError } from "../ai.js";

const textEstimateSchema = z.object({
  description: z.string().min(1).max(1000),
});

const photoEstimateSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  usePoint: z.boolean().default(false),
});

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

const FREE_PHOTO_PER_DAY = 1;

/**
 * Check today's photo recognition entitlement.
 * Returns how many free uses remain and whether the request is allowed.
 */
async function checkPhotoEntitlement(userId: string): Promise<{
  freeUsed: number;
  freeRemaining: number;
  pointBalance: number;
}> {
  const today = startOfDay(new Date().toISOString().slice(0, 10));
  const freeUsed = await prisma.aiUsageLog.count({
    where: { userId, date: today, type: "photo", source: "free" },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { pointBalance: true } });

  return {
    freeUsed,
    freeRemaining: Math.max(0, FREE_PHOTO_PER_DAY - freeUsed),
    pointBalance: user?.pointBalance ?? 0,
  };
}

export async function aiRoutes(app: FastifyInstance) {
  // ── POST /ai/meal-text-estimate ─────────────────────────────────
  app.post("/ai/meal-text-estimate", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = textEstimateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", issues: parsed.error.flatten() });
    }

    try {
      const adapter = createAiAdapter();
      const estimate = await adapter.estimateFromText(parsed.data.description);

      return {
        estimate,
        message: "这是 AI 的估算结果，请确认后再记录到餐食。",
        note: "此结果尚未保存，请通过 POST /meals 确认后入账。",
      };
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        return reply.code(503).send({
          error: "ai_not_configured",
          message: error.message,
        });
      }
      throw error;
    }
  });

  // ── POST /ai/meal-photo-estimate ───────────────────────────────
  app.post("/ai/meal-photo-estimate", { preHandler: [authGuard] }, async (request, reply) => {
    const parsed = photoEstimateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", issues: parsed.error.flatten() });
    }

    const userId = request.userId!;
    const entitlement = await checkPhotoEntitlement(userId);

    let usedSource: "free" | "point" = "free";

    if (entitlement.freeRemaining > 0) {
      // Use free slot
      usedSource = "free";
    } else if (parsed.data.usePoint) {
      // Wants to use a point — pre-check as a UX hint (real guard is at deduction time)
      if (entitlement.pointBalance < 1) {
        return reply.code(403).send({
          error: "insufficient_points",
          message: "积分不足，无法兑换额外拍照识别。达标可获得积分奖励。",
          pointBalance: entitlement.pointBalance,
        });
      }
      usedSource = "point";
    } else {
      // Free quota exhausted and did not opt to use point
      return reply.code(403).send({
        error: "requires_point",
        message: "今日免费拍照识别已用完。可通过积分兑换额外次数。",
        pointBalance: entitlement.pointBalance,
        freeRemaining: 0,
      });
    }

    try {
      const adapter = createAiAdapter();
      const estimate = await adapter.estimateFromPhoto(parsed.data.imageBase64, parsed.data.mimeType);

      if (usedSource === "point") {
        // Atomic deduction: decrement only if balance >= 1
        const today = startOfDay(new Date().toISOString().slice(0, 10));
        const result = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.user.updateMany({
            where: { id: userId, pointBalance: { gte: 1 } },
            data: { pointBalance: { decrement: 1 } },
          });

          if (updateResult.count === 0) {
            return null; // insufficient points (race condition lost)
          }

          await tx.pointTransaction.create({
            data: {
              userId,
              amount: -1,
              reason: "photo_spend",
              refDate: null,
            },
          });

          await tx.aiUsageLog.create({
            data: { userId, date: today, type: "photo", source: "point" },
          });

          return true;
        });

        if (!result) {
          return reply.code(403).send({
            error: "insufficient_points",
            message: "积分不足，无法兑换额外拍照识别。达标可获得积分奖励。",
            pointBalance: 0,
          });
        }
      } else {
        // Free usage — just log
        const today = startOfDay(new Date().toISOString().slice(0, 10));
        await prisma.aiUsageLog.create({
          data: { userId, date: today, type: "photo", source: "free" },
        });
      }

      // Refresh balance for response
      const updatedUser = await prisma.user.findUnique({ where: { id: userId }, select: { pointBalance: true } });
      const newEntitlement = await checkPhotoEntitlement(userId);

      return {
        estimate,
        pointBalance: updatedUser?.pointBalance ?? 0,
        freeRemaining: newEntitlement.freeRemaining,
        usedPoint: usedSource === "point",
        message: "这是 AI 的估算结果，请确认后再记录到餐食。",
        note: "照片仅用于当次识别，不会被保存。请通过 POST /meals 确认后入账。",
      };
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        return reply.code(503).send({
          error: "ai_not_configured",
          message: error.message,
        });
      }
      throw error;
    }
  });
}
