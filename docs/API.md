# AgileCampus 业务后端 API 文档

> 认证方式与 v1 相同：登录后 Cookie `agile_session`（httpOnly，7 天）自动携带，无需手动设置。
> 所有接口返回 JSON；错误统一为 `{ "error": "中文提示" }`，状态码 400（参数）/ 401（未登录）/ 403（无权限）/ 404（不存在）/ 409（冲突）/ 500（服务器异常）。
> 日期字段统一 `YYYY-MM-DD` 字符串；时间戳为 ISO 字符串。

## 通用约定

- **任务编号**：`项目key-序号`（如 `AGI-011`），创建时后端在项目内自动递增分配。
- **任务状态**：`todo`（待开始）/ `doing`（进行中）/ `done`（已完成）。
- **优先级**：`low` / `medium` / `high`。
- **团队角色**：`owner`（创建者，最高）/ `admin`（管理员）/ `member`（成员）。团队成员可访问该团队全部项目；成员管理、删除团队/项目、置顶消息、改标签需要 `admin` 及以上；解散团队仅 `owner`。
- **@提及语法**：在聊天消息或评论中写 `@名称` 或 `@学工号`（如 `@陈测试`、`@2023210315`），与团队成员匹配成功后对方会收到站内通知。
- **展示名**：用户名称未填时回落学工号（接口里的 `displayName` 字段）。

## 快速上手（本地）

```bash
docker compose up -d        # 启动 PostgreSQL
npm run db:push             # 同步表结构（改 db/schema.ts 后必须执行）
npm run db:seed             # 写入演示数据（幂等，可重复运行）
npm run dev                 # 启动 http://localhost:3000
```

## 接口一览

### 认证（v1 原有，不变）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册（email/password/studentId），成功即登录 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET/PUT | `/api/auth/me` | 我的信息 / 更新个人资料 |

### 工作台统计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/overview` | `{ teamCount, projectCount, taskTotal, taskDone, myTodo, myDoing }` |

### 团队

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/teams` | 登录 | 我的团队列表（含 memberCount/projectCount/我的角色） |
| POST | `/api/teams` | 登录 | `{ name, description? }` 新建，创建者为 owner |
| GET | `/api/teams/[id]` | 成员 | 详情 + 成员列表 + 我的角色 |
| PUT | `/api/teams/[id]` | admin | 改名 / 简介 |
| DELETE | `/api/teams/[id]` | owner | 解散（级联删除团队全部数据） |
| POST | `/api/teams/[id]/members` | admin | `{ email, role?: "admin"\|"member" }` 按邮箱添加，自动加入团队全部项目 |
| PUT | `/api/teams/[id]/members/[userId]` | owner | `{ role }` 调整角色 |
| DELETE | `/api/teams/[id]/members/[userId]` | admin/本人 | 移除成员 / 退出团队（owner 不能退出） |

### 项目

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/projects?teamId=&q=&starred=1` | 登录 | 项目列表：含任务统计、成员头像、当前 Sprint、是否收藏 |
| POST | `/api/projects` | 成员 | `{ teamId, name, key, description? }`；key 为 2-6 位大写字母/数字（如 WEB），团队内唯一；团队全员自动成为项目成员 |
| GET | `/api/projects/[id]` | 成员 | 详情：团队、成员、Sprint 列表、团队标签、任务统计、星标 |
| PUT | `/api/projects/[id]` | admin | 改名/简介/归档 `{ name?, description?, status?: "active"\|"archived" }` |
| DELETE | `/api/projects/[id]` | admin | 删除项目（级联） |
| POST | `/api/projects/[id]/star` | 成员 | 切换收藏 `{ starred: bool }` |

### Sprint（迭代）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/projects/[id]/sprints` | 成员 | 全部迭代 |
| POST | `/api/projects/[id]/sprints` | 成员 | `{ name, goal?, startsOn?, endsOn?, status? }`；置 active 自动停用其他活跃迭代 |
| PUT | `/api/sprints/[id]` | 成员 | 编辑 / 启动 / 完成 |

### 任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tasks?projectId=&status=&priority=&assigneeId=&sprintId=&labelId=&mine=1&q=&limit=` | 筛选列表（不传 projectId 则查我所有团队的）；`mine=1` 只看指派给我的 |
| POST | `/api/tasks` | `{ projectId, title, description?, status?, priority?, assigneeId?, dueOn?, sprintId?, parentTaskId?, labelIds? }`；返回含 `code`（如 AGI-011）；指派会通知负责人 |
| GET | `/api/tasks/[id]` | 详情：负责人、创建者、标签、评论、子任务、附件、活动记录 |
| PUT | `/api/tasks/[id]` | 更新任意字段；状态/负责人/优先级/截止日变更自动写项目日志，指派触发通知 |
| DELETE | `/api/tasks/[id]` | 删除（级联子任务/评论/标签/附件记录） |
| GET/POST | `/api/tasks/[id]/comments` | 评论；POST `{ content }`，@提及和任务负责人会收到通知 |

### 项目聊天

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/[id]/chat` | 最新 50 条（时间正序）；带 `?afterId=N` 增量拉取 id 大于 N 的消息（前端轮询用） |
| POST | `/api/projects/[id]/chat` | `{ content, replyToId?, taskId? }`；消息可回复、可关联任务卡片；@提及触发通知 |
| POST | `/api/chat/[id]/like` | 切换赞同 |
| PUT | `/api/chat/[id]/pin` | admin `{ pinned: bool }` 置顶为公告（同项目同时只有一条置顶） |

消息对象包含：`author.displayName`、`likeCount`、`likedByMe`、`replyTo`（摘要）、`task`（关联任务卡片：code/title/status）。

### 文件

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/[id]/files?taskId=` | 文件列表 |
| POST | `/api/projects/[id]/files` | `multipart/form-data`：`file`（≤20MB）+ 可选 `taskId`；存本地 `uploads/`（已 gitignore） |
| GET | `/api/files/[id]` | 下载（校验团队成员身份，中文文件名正常） |

### 项目日志 / 通知 / 标签

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/[id]/activities?limit=50` | 项目日志（谁在何时做了什么，中文句子） |
| GET | `/api/notifications` | 我的通知（倒序 50 条）+ `unreadCount` |
| PUT | `/api/notifications` | `{ ids: [...] }` 或 `{ all: true }` 标记已读 |
| GET/POST | `/api/teams/[id]/labels` | 团队标签列表 / 新建 `{ name, color? }` |
| PUT/DELETE | `/api/labels/[id]` | admin 改标签 / 删标签 |

## curl 示例

```bash
# 登录拿 Cookie（后续请求 -b 复用）
curl -c jar.txt -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@stu.edu.cn","password":"abc123"}'

# 建任务（自动编号 AGI-0xx）
curl -b jar.txt -X POST localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":1,"title":"对接登录接口","priority":"high","assigneeId":4,"dueOn":"2026-10-08"}'

# 发聊天消息并 @ 人
curl -b jar.txt -X POST localhost:3000/api/projects/1/chat \
  -H "Content-Type: application/json" \
  -d '{"content":"@陈测试 今天下午联调","taskId":5}'

# 上传文件并挂到任务 5
curl -b jar.txt -X POST localhost:3000/api/projects/1/files \
  -F "file=@需求说明.pdf" -F "taskId=5"
```

## 数据模型（17 张表）

`users`、`sessions`（v1 原有）+ `teams`、`team_members`、`projects`、`project_members`、`project_stars`、`sprints`、`tasks`、`labels`、`task_labels`、`comments`、`chat_messages`、`chat_likes`、`activities`、`notifications`、`attachments`。字段定义见 `db/schema.ts`（含中文注释）。

## 已知边界（当前版本）

- 聊天为轮询（建议前端 8 秒 `?afterId=` 增量），无 WebSocket 实时推送。
- 附件存服务器本地 `uploads/` 目录，重启不丢但随机器走，未接对象存储。
- 「待办」即 `GET /api/tasks?mine=1&status=todo,doing` 的视图，无独立表。
- 通知不含"临期/逾期"类型（需要定时任务，后续版本）。
