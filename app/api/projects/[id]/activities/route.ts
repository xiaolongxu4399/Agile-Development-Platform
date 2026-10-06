import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, users } from "@/db/schema";
import { requireUser, parseId, requireProjectAccess, handleApiError } from "@/lib/api";

// 项目日志：GET /api/projects/[id]/activities?limit=50  按时间倒序的活动流
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    await requireProjectAccess(user.id, projectId);

    const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 50, 200);

    const rows = await db
      .select({
        id: activities.id,
        action: activities.action,
        detail: activities.detail,
        taskId: activities.taskId,
        createdAt: activities.createdAt,
        actorName: users.name,
        actorStudentId: users.studentId,
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.actorId))
      .where(eq(activities.projectId, projectId))
      .orderBy(desc(activities.createdAt), desc(activities.id))
      .limit(Number.isFinite(limit) ? limit : 50);

    return Response.json({ activities: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
