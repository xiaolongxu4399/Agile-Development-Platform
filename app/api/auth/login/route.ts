import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";

// 登录接口：POST /api/auth/login  { email, password }
const bodySchema = z.object({
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(1, "请填写密码"),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { email, password } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // 邮箱不存在与密码错误返回同一句提示，避免暴露「邮箱是否已注册」
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
  }
  const setCookie = await createSession(user.id);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name } },
    { headers: { "Set-Cookie": setCookie } });
}
