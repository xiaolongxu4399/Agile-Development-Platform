import { z } from "zod";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { dmAttachments, dmConversations, dmMessages, users } from "@/db/schema";
import { requireUser, parseBody, parseId, ApiError, handleApiError, displayName } from "@/lib/api";
import { notifyDirectMessage } from "@/lib/notify";

// 私聊消息：
// GET  /api/dm/[id]/messages?afterId=  → 会话消息（不传 afterId 取最新 80 条；传了则增量拉取）
// POST /api/dm/[id]/messages { content } → 发送消息并通知对方

// 会话访问校验：必须是会话的两个人之一；返回会话与对方 id
async function requireConversation(userId: number, conversationId: number) {
  const [conversation] = await db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, conversationId))
    .limit(1);
  if (!conversation) throw new ApiError(404, "会话不存在");
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ApiError(403, "无权访问该会话");
  }
  return {
    conversation,
    partnerId: conversation.userAId === userId ? conversation.userBId : conversation.userAId,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const conversationId = parseId((await params).id, "会话 ID");
    await requireConversation(user.id, conversationId);

    const afterIdRaw = new URL(request.url).searchParams.get("afterId");
    const afterId = afterIdRaw ? Number(afterIdRaw) : null;

    const baseQuery = db
      .select({
        id: dmMessages.id,
        conversationId: dmMessages.conversationId,
        senderId: dmMessages.senderId,
        content: dmMessages.content,
        attachmentId: dmMessages.attachmentId,
        readAt: dmMessages.readAt,
        createdAt: dmMessages.createdAt,
        senderName: users.name,
        senderStudentId: users.studentId,
        attName: dmAttachments.originalName,
        attSize: dmAttachments.size,
        attMime: dmAttachments.mimeType,
      })
      .from(dmMessages)
      .innerJoin(users, eq(users.id, dmMessages.senderId))
      .leftJoin(dmAttachments, eq(dmAttachments.id, dmMessages.attachmentId));

    const rows = Number.isInteger(afterId) && afterId! > 0
      ? await baseQuery
          .where(and(eq(dmMessages.conversationId, conversationId), gt(dmMessages.id, afterId!)))
          .orderBy(asc(dmMessages.id))
          .limit(200)
      : (
          await baseQuery
            .where(eq(dmMessages.conversationId, conversationId))
            .orderBy(desc(dmMessages.id))
            .limit(80)
        ).reverse();

    return Response.json({
      messages: rows.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        senderName: displayName({ name: m.senderName, studentId: m.senderStudentId }),
        mine: m.senderId === user.id,
        content: m.content,
        attachment: m.attachmentId ? { id: m.attachmentId, name: m.attName ?? m.content, size: m.attSize ?? 0, mimeType: m.attMime } : null,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const sendSchema = z.object({
  content: z.string().trim().min(1, "请填写消息内容").max(2000, "消息内容过长"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const conversationId = parseId((await params).id, "会话 ID");
    const { conversation, partnerId } = await requireConversation(user.id, conversationId);
    const { content } = await parseBody(request, sendSchema);

    const [message] = await db
      .insert(dmMessages)
      .values({ conversationId, senderId: user.id, content })
      .returning();
    // 更新最后活跃时间；若对方隐藏过该会话，新消息自动让其恢复显示
    await db
      .update(dmConversations)
      .set({
        lastMessageAt: message.createdAt,
        ...(conversation.userAId === user.id ? { hiddenForB: false } : { hiddenForA: false }),
      })
      .where(eq(dmConversations.id, conversationId));

    // 站内通知对方（合并提醒）：点击直达该会话（entityType=dm，entityId=会话 id）
    await notifyDirectMessage({
      conversationId,
      recipientId: partnerId,
      actorId: user.id,
      actorName: displayName(user),
    });

    return Response.json({
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderName: displayName(user),
        mine: true,
        content: message.content,
        readAt: message.readAt,
        createdAt: message.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
