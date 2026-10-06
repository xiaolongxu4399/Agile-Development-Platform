import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sprints } from "@/db/schema";
import { requireUser, parseBody, parseId, requireProjectAccess, handleApiError, displayName } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// Sprint 接口：GET /api/projects/[id]/sprints 全部迭代；POST 新建（status=active 时自动停用同项目其他活跃迭代）
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    await requireProjectAccess(user.id, projectId);

    const rows = await db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(sprints.createdAt);
    return Response.json({ sprints: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").nullable().optional();

const createSchema = z.object({
  name: z.string().trim().min(1, "请填写迭代名称").max(50, "迭代名称过长"),
  goal: z.string().trim().max(200, "迭代目标过长").optional().nullable(),
  startsOn: dateStr,
  endsOn: dateStr,
  status: z.enum(["planned", "active", "completed"]).default("planned"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    const { project } = await requireProjectAccess(user.id, projectId);
    const body = await parseBody(request, createSchema);

    if (body.startsOn && body.endsOn && body.endsOn < body.startsOn) {
      return Response.json({ error: "交付日期不能早于开始日期" }, { status: 400 });
    }

    // 同一项目同时只允许一个 active Sprint
    if (body.status === "active") {
      await db
        .update(sprints)
        .set({ status: "planned" })
        .where(and(eq(sprints.projectId, projectId), eq(sprints.status, "active")));
    }

    const [sprint] = await db
      .insert(sprints)
      .values({
        projectId,
        name: body.name,
        goal: body.goal || null,
        startsOn: body.startsOn ?? null,
        endsOn: body.endsOn ?? null,
        status: body.status,
      })
      .returning();

    await logActivity({
      projectId,
      actorId: user.id,
      action: "sprint.created",
      detail: `${displayName(user)} 创建了迭代 ${sprint.name}`,
    });

    return Response.json({ sprint }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
