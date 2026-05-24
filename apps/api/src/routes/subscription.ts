import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";

export async function subscriptionRoutes(app: FastifyInstance) {
  app.get("/subscription/entitlement", { preHandler: [authGuard] }, async (request) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) {
      return { tier: "free", limits: getLimits("free") };
    }

    return {
      tier: user.subscriptionTier,
      limits: getLimits(user.subscriptionTier),
    };
  });
}

function getLimits(tier: string) {
  const freePhoto = Number(process.env.FREE_PHOTO_ESTIMATES_PER_DAY ?? 2);
  const vipPhoto = Number(process.env.VIP_PHOTO_ESTIMATES_PER_DAY ?? 10);

  return {
    photoEstimatesPerDay: tier === "vip" ? vipPhoto : freePhoto,
    textEstimatesPerDay: Infinity,
    manualEntryUnlimited: true,
  };
}
