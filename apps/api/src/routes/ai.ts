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
});

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

async function checkPhotoEntitlement(userId: string, tier: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const limit = tier === "vip"
    ? Number(process.env.VIP_PHOTO_ESTIMATES_PER_DAY ?? 10)
    : Number(process.env.FREE_PHOTO_ESTIMATES_PER_DAY ?? 2);

  const today = startOfDay(new Date().toISOString().slice(0, 10));
  const used = await prisma.aiUsageLog.count({
    where: { userId, date: today, type: "photo" },
  });

  return { allowed: used < limit, remaining: Math.max(0, limit - used), limit };
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

    // Check entitlement
    const entitlement = await checkPhotoEntitlement(request.userId!, request.userTier ?? "free");
    if (!entitlement.allowed) {
      return reply.code(429).send({
        error: "photo_limit_reached",
        message: `今天的拍照识别次数已用完（${entitlement.limit} 次/天）。升级 VIP 可获得更多次数。`,
        limit: entitlement.limit,
        remaining: 0,
      });
    }

    try {
      const adapter = createAiAdapter();
      const estimate = await adapter.estimateFromPhoto(parsed.data.imageBase64, parsed.data.mimeType);

      // Log usage (photo is NOT persisted)
      const today = startOfDay(new Date().toISOString().slice(0, 10));
      await prisma.aiUsageLog.create({
        data: { userId: request.userId!, date: today, type: "photo" },
      });

      return {
        estimate,
        remaining: entitlement.remaining - 1,
        limit: entitlement.limit,
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
