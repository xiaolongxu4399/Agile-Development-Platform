import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatLikes } from "@/db/schema";
import { requireUser, parseId, requireProjectAccess, ApiError, handleApiError } from "@/lib/api";

// 赞同 / 取消赞同：POST /api/chat/[id]/like（切换）
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const messageId = parseId((await params).id, "消息 ID");

    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId)).limit(1);
    if (!message) throw new ApiError(404, "消息不存在");
    await requireProjectAccess(user.id, message.projectId);

    const [existing] = await db
      .select({ id: chatLikes.id })
      .from(chatLikes)
      .where(and(eq(chatLikes.messageId, messageId), eq(chatLikes.userId, user.id)))
      .limit(1);

    if (existing) {
      await db.delete(chatLikes).where(eq(chatLikes.id, existing.id));
      return Response.json({ liked: false });
    }
    await db.insert(chatLikes).values({ messageId, userId: user.id });
    return Response.json({ liked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
