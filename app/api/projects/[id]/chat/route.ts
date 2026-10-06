import { z } from "zod";
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, chatLikes, users, tasks, projects, teamMembers } from "@/db/schema";
import {
  requireUser, parseBody, parseId, requireProjectAccess, ApiError, handleApiError, displayName, taskCode,
} from "@/lib/api";
import { notifyMentions } from "@/lib/notify";

// 项目聊天：GET /api/projects/[id]/chat?afterId=  消息列表（不传 afterId 取最新 50 条；传了则增量拉取）
//           POST { content, replyToId?, taskId? }  发送（@提及触发通知）
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    await requireProjectAccess(user.id, projectId);

    const afterIdRaw = new URL(request.url).searchParams.get("afterId");
    const afterId = afterIdRaw ? Number(afterIdRaw) : null;

    const rows = Number.isInteger(afterId) && afterId! > 0
      ? await db
          .select()
          .from(chatMessages)
          .where(and(eq(chatMessages.projectId, projectId), gt(chatMessages.id, afterId!)))
          .orderBy(asc(chatMessages.id))
          .limit(200)
      : (
          await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.projectId, projectId))
            .orderBy(desc(chatMessages.id))
            .limit(50)
        ).reverse();

    return Response.json({ messages: await decorateMessages(rows, user.id) });
  } catch (error) {
    return handleApiError(error);
  }
}

// 补齐消息的展示信息：作者、赞同数、是否已赞、回复目标、关联任务
async function decorateMessages(rows: (typeof chatMessages.$inferSelect)[], currentUserId: number) {
  if (rows.length === 0) return [];
  const ids = rows.map((m) => m.id);

  const likes = await db
    .select({ messageId: chatLikes.messageId, userId: chatLikes.userId })
    .from(chatLikes)
    .where(inArray(chatLikes.messageId, ids));

  const authorIds = [...new Set(rows.map((m) => m.authorId))];
  const authors = await db
    .select({ id: users.id, name: users.name, studentId: users.studentId })
    .from(users)
    .where(inArray(users.id, authorIds));

  const replyIds = [...new Set(rows.map((m) => m.replyToId).filter((v): v is number => v !== null))];
  const replyTargets = replyIds.length
    ? await db
        .select({ id: chatMessages.id, content: chatMessages.content, authorId: chatMessages.authorId })
        .from(chatMessages)
        .where(inArray(chatMessages.id, replyIds))
    : [];

  const taskIds = [...new Set(rows.map((m) => m.taskId).filter((v): v is number => v !== null))];
  const linkedTasks = taskIds.length
    ? await db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, number: tasks.number, key: projects.key })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .where(inArray(tasks.id, taskIds))
    : [];

  return rows.map((m) => {
    const author = authors.find((a) => a.id === m.authorId);
    const reply = replyTargets.find((r) => r.id === m.replyToId);
    const replyAuthor = reply ? authors.find((a) => a.id === reply.authorId) : null;
    const task = linkedTasks.find((t) => t.id === m.taskId);
    return {
      id: m.id,
      content: m.content,
      pinned: m.pinned,
      taskId: m.taskId,
      replyToId: m.replyToId,
      createdAt: m.createdAt,
      author: {
        id: m.authorId,
        displayName: author ? displayName(author) : "未知成员",
      },
      likeCount: likes.filter((l) => l.messageId === m.id).length,
      likedByMe: likes.some((l) => l.messageId === m.id && l.userId === currentUserId),
      replyTo: reply
        ? {
            id: reply.id,
            content: reply.content.slice(0, 60),
            authorName: replyAuthor ? displayName(replyAuthor) : "未知成员",
          }
        : null,
      task: task ? { id: task.id, code: taskCode(task.key, task.number), title: task.title, status: task.status } : null,
    };
  });
}

const sendSchema = z.object({
  content: z.string().trim().min(1, "请填写消息内容").max(2000, "消息内容过长"),
  replyToId: z.number().int().positive().optional().nullable(),
  taskId: z.number().int().positive().optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    const { project } = await requireProjectAccess(user.id, projectId);
    const body = await parseBody(request, sendSchema);

    if (body.replyToId) {
      const [target] = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.id, body.replyToId), eq(chatMessages.projectId, projectId)))
        .limit(1);
      if (!target) throw new ApiError(400, "回复的消息不存在");
    }
    if (body.taskId) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, body.taskId)).limit(1);
      if (!task || task.projectId !== projectId) throw new ApiError(400, "关联任务不存在");
    }

    const [message] = await db
      .insert(chatMessages)
      .values({
        projectId,
        authorId: user.id,
        content: body.content,
        replyToId: body.replyToId ?? null,
        taskId: body.taskId ?? null,
      })
      .returning();

    // @提及 → 站内通知
    const members = await db
      .select({ userId: users.id, name: users.name, studentId: users.studentId })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, project.teamId));
    await notifyMentions({
      content: body.content,
      actorId: user.id,
      members,
      title: `${displayName(user)} 在 ${project.name} 频道中提到了你`,
      entityType: "project",
      entityId: projectId,
    });

    return Response.json({ message: await decorateMessages([message], user.id) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
