import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { signToken, type JwtPayload } from "../auth.js";

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /auth/guest
   * Creates a guest user and returns a JWT.
   * Idempotent: if a guest token is already present in Authorization header,
   * verify and return existing user info.
   */
  app.post("/auth/guest", async (request, reply) => {
    // Check for existing token
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const { verifyToken } = await import("../auth.js");
        const payload = verifyToken(header.slice(7));
        const existing = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (existing && !existing.deletedAt) {
          return {
            token: header.slice(7),
            userId: existing.id,
            tier: existing.subscriptionTier,
            isNew: false,
          };
        }
      } catch {
        // token invalid, create new guest
      }
    }

    const user = await prisma.user.create({
      data: {
        region: "CN",
      },
    });

    const payload: JwtPayload = { sub: user.id, tier: "free" };
    const token = signToken(payload);

    return reply.code(201).send({
      token,
      userId: user.id,
      tier: user.subscriptionTier,
      isNew: true,
    });
  });
}
