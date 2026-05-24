import cors from "@fastify/cors";
import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { planRoutes } from "./routes/plans.js";
import { mealRoutes } from "./routes/meals.js";
import { exerciseRoutes } from "./routes/exercises.js";
import { weightRoutes } from "./routes/weights.js";
import { dailySummaryRoutes } from "./routes/dailySummary.js";
import { trendRoutes } from "./routes/trends.js";
import { subscriptionRoutes } from "./routes/subscription.js";
import { accountRoutes } from "./routes/account.js";
import { aiRoutes } from "./routes/ai.js";

export async function buildServer() {
  const server = Fastify({
    logger: true,
  });

  await server.register(cors, { origin: true });

  // Register all route modules
  await server.register(healthRoutes);
  await server.register(authRoutes);
  await server.register(planRoutes);
  await server.register(mealRoutes);
  await server.register(exerciseRoutes);
  await server.register(weightRoutes);
  await server.register(dailySummaryRoutes);
  await server.register(trendRoutes);
  await server.register(subscriptionRoutes);
  await server.register(accountRoutes);
  await server.register(aiRoutes);

  return server;
}

// Start server when run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");

if (isMainModule || process.env.START_SERVER === "1") {
  const server = await buildServer();
  const host = process.env.API_HOST ?? "0.0.0.0";
  const port = Number(process.env.API_PORT ?? 8797);

  try {
    await server.listen({ host, port });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}
