import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Fastify preHandler hook: extracts and verifies Bearer token,
 * sets request.userId.
 */
export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "unauthorized", message: "缺少登录凭证" });
  }
  try {
    const payload = verifyToken(header.slice(7));
    (request as any).userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: "token_invalid", message: "凭证无效或已过期" });
  }
}

/** Extension point: replace with Apple Sign-In verification */
export async function verifyAppleToken(_identityToken: string): Promise<{ appleUserId: string; email?: string } | null> {
  // TODO: implement Apple identity token verification
  return null;
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}
