import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { requireUser, parseBody, parseId, requireProjectAccess, ApiError, handleApiError } from "@/lib/api";

// 置顶 / 取消置顶：PUT /api/chat/[id]/pin  { pinned: boolean }
// 仅团队 owner / admin 可操作；置顶时自动取消同项目其他置顶（公告位只有一个）
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const messageId = parseId((await params).id, "消息 ID");

    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
    if (!message) throw new ApiError(404, "消息不存在");
    await requireProjectAccess(user.id, message.projectId, "admin");

    const body = await parseBody(request, z.object({ pinned: z.boolean() }));

    if (body.pinned) {
      await db
        .update(chatMessages)
        .set({ pinned: false })
        .where(and(eq(chatMessages.projectId, message.projectId), eq(chatMessages.pinned, true)));
    }
    await db.update(chatMessages).set({ pinned: body.pinned }).where(eq(chatMessages.id, messageId));

    return Response.json({ ok: true, pinned: body.pinned });
  } catch (error) {
    return handleApiError(error);
  }
}
