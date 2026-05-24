import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { authGuard } from "../auth.js";

export async function accountRoutes(app: FastifyInstance) {
  /**
   * DELETE /account
   * Soft-delete user and cascade delete all data.
   */
  app.delete("/account", { preHandler: [authGuard] }, async (request) => {
    const userId = request.userId!;

    // Hard-delete in order due to FK constraints
    // MealItems -> MealEntries -> ExerciseEntries -> WeightEntries -> DailySummaries -> AiUsageLogs -> Plans -> User
    const mealIds = await prisma.mealEntry.findMany({ where: { userId }, select: { id: true } });
    await prisma.mealItem.deleteMany({ where: { mealEntryId: { in: mealIds.map((m) => m.id) } } });
    await prisma.mealEntry.deleteMany({ where: { userId } });
    await prisma.exerciseEntry.deleteMany({ where: { userId } });
    await prisma.weightEntry.deleteMany({ where: { userId } });
    await prisma.dailySummary.deleteMany({ where: { userId } });
    await prisma.aiUsageLog.deleteMany({ where: { userId } });
    await prisma.plan.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    return { deleted: true, message: "账号和相关数据已删除。" };
  });
}
