import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

// 用户表：登录账号 + 个人资料（名称、学工号、性别、地区、个人简介）
// 高校场景：学工号唯一、注册必填；名称（展示名）可不填，避免强制实名与重名困扰
// role 字段为后续「团队成员管理模块」预留（member / admin）
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),           // 登录账号
  passwordHash: text("password_hash").notNull(),     // 密码哈希（scrypt，不存明文）
  name: text("name"),                                // 名称：展示用昵称，可不填（未填时显示学工号）
  studentId: text("student_id").notNull().unique(),  // 学工号：注册时必填的唯一标识
  gender: text("gender"),                            // 性别：男 / 女 / 保密
  region: text("region"),                            // 地区
  bio: text("bio"),                                  // 个人简介
  role: text("role").notNull().default("member"),    // 角色（团队模块用）
  createdAt: timestamp("created_at").defaultNow(),
});

// 会话表：登录成功后签发一条会话记录，退出时删除
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),                 // 随机令牌（放在 httpOnly Cookie 里）
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
