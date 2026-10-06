import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser, parseId, requireProjectAccess, ApiError, handleApiError } from "@/lib/api";

// 文件下载：GET /api/files/[id]  校验团队成员身份后回传文件流（原始文件名展示）
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const fileId = parseId((await params).id, "文件 ID");

    const [record] = await db.select().from(attachments).where(eq(attachments.id, fileId)).limit(1);
    if (!record) throw new ApiError(404, "文件不存在");
    await requireProjectAccess(user.id, record.projectId);

    const buffer = await readFile(path.join(UPLOAD_DIR, record.storedName)).catch(() => {
      throw new ApiError(404, "文件已丢失");
    });

    // 文件名含中文时用 RFC 5987 编码，保证下载名正确
    const encodedName = encodeURIComponent(record.originalName);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": record.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
