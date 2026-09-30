import { destroySession, readToken, SESSION_COOKIE } from "@/lib/auth";

// 退出接口：POST /api/auth/logout
// 删除会话记录并清空 Cookie——退出后才能登录新用户
export async function POST(request: Request) {
  const token = readToken(request);
  const setCookie = token
    ? await destroySession(token)
    : `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": setCookie } });
}
