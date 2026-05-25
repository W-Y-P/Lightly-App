import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { signToken, verifyToken } from "../auth.js";

const wechatLoginSchema = z.object({
  code: z.string().min(1),
});

/**
 * Call WeChat jscode2Session to exchange code for openid.
 * Returns null if env vars are not configured (dev mock mode).
 */
async function wechatCode2Session(code: string): Promise<{ openid: string; session_key: string; unionid?: string } | null> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    // Dev mock: generate a deterministic openid from the code
    return null;
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`WeChat API HTTP error: ${resp.status}`);
  }

  const data = (await resp.json()) as any;
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat API error ${data.errcode}: ${data.errmsg}`);
  }

  return {
    openid: data.openid,
    session_key: data.session_key,
    unionid: data.unionid,
  };
}

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
        const payload = verifyToken(header.slice(7));
        const existing = await prisma.user.findUnique({ where: { id: payload.sub } });
        if (existing && !existing.deletedAt) {
          return {
            token: header.slice(7),
            userId: existing.id,
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

    const token = signToken({ sub: user.id });

    return reply.code(201).send({
      token,
      userId: user.id,
      isNew: true,
    });
  });

  /**
   * POST /auth/wechat
   * Receives a wx.login code, exchanges it for openid via WeChat API
   * (or uses dev mock if WECHAT_APP_ID/WECHAT_APP_SECRET are not configured).
   * Finds or creates user by wechatOpenId, returns JWT.
   */
  app.post("/auth/wechat", async (request, reply) => {
    const parsed = wechatLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", message: "缺少 code 参数" });
    }

    const { code } = parsed.data;
    let openId: string;
    let unionId: string | undefined;

    const wxResult = await wechatCode2Session(code);

    if (wxResult) {
      // Real WeChat response
      openId = wxResult.openid;
      unionId = wxResult.unionid;
    } else {
      // Dev mock mode: generate deterministic openid from code
      openId = `mock_openid_${code}`;
    }

    // Find existing user by wechatOpenId
    let user = await prisma.user.findFirst({
      where: {
        wechatOpenId: openId,
        deletedAt: null,
      },
    });

    let isNew = false;

    if (!user) {
      // Create new user linked to WeChat
      user = await prisma.user.create({
        data: {
          region: "CN",
          wechatOpenId: openId,
          wechatUnionId: unionId ?? null,
        },
      });
      isNew = true;
    } else if (unionId && !user.wechatUnionId) {
      // Backfill unionId if newly available
      user = await prisma.user.update({
        where: { id: user.id },
        data: { wechatUnionId: unionId },
      });
    }

    const token = signToken({ sub: user.id });

    return reply.code(isNew ? 201 : 200).send({
      token,
      userId: user.id,
      isNew,
    });
  });
}
