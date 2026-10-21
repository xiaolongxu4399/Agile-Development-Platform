/* 私聊纯函数：配对顺序、会话预览、未读统计。不引数据库依赖，便于单测复用 */

// 一对用户的标准顺序（小 id 在前）：保证 (a,b) 与 (b,a) 永远命中同一条会话
export function dmPair(a: number, b: number): [number, number] {
  if (!Number.isInteger(a) || !Number.isInteger(b)) throw new Error("用户 ID 必须是整数");
  if (a === b) throw new Error("不能和自己私聊");
  return a < b ? [a, b] : [b, a];
}

// 会话列表预览：截断消息内容，空会话给占位文案
export function dmPreview(content: string | null | undefined, limit = 60): string {
  if (!content) return "开始对话吧";
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

// 未读数：对方发来且尚未阅读（readAt 为空）的消息条数
export function countUnread(messages: { senderId: number; readAt: string | Date | null }[], myId: number): number {
  return messages.filter((m) => m.senderId !== myId && m.readAt === null).length;
}
