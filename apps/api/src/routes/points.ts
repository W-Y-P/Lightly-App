import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

const FREE_PHOTO_PER_DAY = 1;

/**
 * Shared handler for GET /points/entitlement.
 * Returns point balance and photo quota status (no VIP / subscription semantics).
 */
async function handleEntitlement(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return {
      pointBalance: 0,
      photoQuota: { freeRemaining: FREE_PHOTO_PER_DAY, freeUsed: 0, totalToday: 0 },
    };
  }

  const today = startOfDay(new Date().toISOString().slice(0, 10));
  const freeUsed = await prisma.aiUsageLog.count({
    where: { userId, date: today, type: "photo", source: "free" },
  });
  const pointUsed = await prisma.aiUsageLog.count({
    where: { userId, date: today, type: "photo", source: "point" },
  });

  return {
    pointBalance: user.pointBalance,
    photoQuota: {
      freeRemaining: Math.max(0, FREE_PHOTO_PER_DAY - freeUsed),
      freeUsed,
      totalToday: freeUsed + pointUsed,
    },
  };
}

export async function pointsRoutes(app: FastifyInstance) {
  /**
   * GET /points/entitlement
   * Canonical endpoint — returns point balance and photo quota.
   */
  app.get("/points/entitlement", { preHandler: [authGuard] }, async (request) => {
    return handleEntitlement(request.userId!);
  });
}
