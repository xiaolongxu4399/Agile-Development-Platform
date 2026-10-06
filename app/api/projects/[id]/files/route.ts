import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, tasks, users } from "@/db/schema";
import { requireUser, parseId, requireProjectAccess, ApiError, handleApiError, displayName } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// 项目文件：GET /api/projects/[id]/files?taskId=  文件列表（可不带 taskId 查项目全部）
//             POST multipart/form-data { file, taskId? }  上传（≤20MB，存本地 uploads/ 目录）
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 20 * 1024 * 1024;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    await requireProjectAccess(user.id, projectId);

    const taskIdParam = new URL(request.url).searchParams.get("taskId");

    const rows = await db
      .select({
        id: attachments.id,
        taskId: attachments.taskId,
        originalName: attachments.originalName,
        mimeType: attachments.mimeType,
        size: attachments.size,
        createdAt: attachments.createdAt,
        uploaderName: users.name,
        uploaderStudentId: users.studentId,
      })
      .from(attachments)
      .innerJoin(users, eq(users.id, attachments.uploaderId))
      .where(taskIdParam ? eq(attachments.taskId, Number(taskIdParam)) : eq(attachments.projectId, projectId))
      .orderBy(desc(attachments.createdAt));

    return Response.json({ files: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const projectId = parseId((await params).id, "项目 ID");
    await requireProjectAccess(user.id, projectId);

    const form = await request.formData().catch(() => null);
    if (!form) throw new ApiError(400, "请使用表单上传文件");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请选择要上传的文件");
    if (file.size === 0) throw new ApiError(400, "文件为空");
    if (file.size > MAX_SIZE) throw new ApiError(400, "文件不能超过 20MB");

    // 可选：挂到某个任务（校验任务属于本项目）
    let taskId: number | null = null;
    const taskIdRaw = form.get("taskId");
    if (taskIdRaw && Number(taskIdRaw)) {
      taskId = Number(taskIdRaw);
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
      if (!task || task.projectId !== projectId) throw new ApiError(400, "关联任务不存在");
    }

    // 存储名用随机 UUID + 受控后缀，避免路径穿越与重名
    const ext = path.extname(file.name).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, "");
    const storedName = `${randomUUID()}${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));

    const [record] = await db
      .insert(attachments)
      .values({
        projectId,
        taskId,
        uploaderId: user.id,
        originalName: file.name.slice(0, 200),
        storedName,
        mimeType: file.type || null,
        size: file.size,
      })
      .returning();

    await logActivity({
      projectId,
      taskId,
      actorId: user.id,
      action: "file.uploaded",
      detail: `${displayName(user)} 上传了文件 ${record.originalName}`,
    });

    return Response.json({ file: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
