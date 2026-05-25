/**
 * @deprecated This module is kept ONLY for backward compatibility.
 * The canonical endpoint is now GET /points/entitlement in routes/points.ts.
 * Remove this file once all callers have migrated.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

const FREE_PHOTO_PER_DAY = 1;

/** @deprecated Use GET /points/entitlement instead. */
export async function subscriptionRoutes(app: FastifyInstance) {
  /**
   * @deprecated Use GET /points/entitlement instead.
   * Kept temporarily for backward compatibility with existing callers.
   * Will be removed in a future release.
   */
  app.get("/subscription/entitlement", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;
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
  });
}
