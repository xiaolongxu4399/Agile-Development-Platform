import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser, parseBody, handleApiError } from "@/lib/api";

// 通知中心：GET /api/notifications  我的通知（倒序 50 条）+ 未读数
//           PUT /api/notifications { ids?: number[], all?: boolean }  标记已读
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.read, false)));

    return Response.json({ notifications: rows, unreadCount: count });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await parseBody(
      request,
      z.object({
        ids: z.array(z.number().int().positive()).max(100).optional(),
        all: z.boolean().optional(),
      }),
    );

    if (body.all || !body.ids?.length) {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
    } else {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userId, user.id), inArray(notifications.id, body.ids)));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
