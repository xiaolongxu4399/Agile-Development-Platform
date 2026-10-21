import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dmConversations, notifications } from "@/db/schema";
import { requireUser, parseId, ApiError, handleApiError } from "@/lib/api";

// 删除会话：清空双方的全部消息并移除会话（级联删除消息）；顺带清理关联的私信通知
// DELETE /api/dm/[id] → { ok: true }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const conversationId = parseId((await params).id, "会话 ID");

    const [conversation] = await db
      .select()
      .from(dmConversations)
      .where(eq(dmConversations.id, conversationId))
      .limit(1);
    if (!conversation) throw new ApiError(404, "会话不存在");
    if (conversation.userAId !== user.id && conversation.userBId !== user.id) {
      throw new ApiError(403, "无权访问该会话");
    }

    await db
      .delete(notifications)
      .where(and(eq(notifications.entityType, "dm"), eq(notifications.entityId, conversationId)));
    await db.delete(dmConversations).where(eq(dmConversations.id, conversationId));
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
