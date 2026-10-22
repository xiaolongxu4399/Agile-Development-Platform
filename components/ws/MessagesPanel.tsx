"use client";

// 私信面板：飞书式双栏——左侧会话列表（未读角标、最后消息预览），右侧一对一消息流
// 联系人限于同团队成员；消息 8 秒轮询，会话列表随工作台全局轮询刷新
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDateShort, fmtTime, dayKey, type DmConversation, type DmContact, type DmMessage } from "@/lib/api-client";
import { useWorkspace, Icon, Avatar, Modal } from "./shared";
import { ConversationSkeleton } from "./LoadingSkeleton";
import { toast } from "@/lib/toast";

export function MessagesPanel() {
  const ws = useWorkspace();
  const [activeId, setActiveId] = useState<number | null>(ws.dmTargetId);
  const [seenTarget, setSeenTarget] = useState<number | null>(ws.dmTargetId);
  const [showContacts, setShowContacts] = useState(false);
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; confirmDelete: boolean } | null>(null);

  // 外部入口（通知跳转 / 成员卡片「私信」/ 删除会话）变更目标时跟随（渲染期对齐，避免级联 effect）
  if (ws.dmTargetId !== seenTarget) {
    setSeenTarget(ws.dmTargetId);
    setActiveId(ws.dmTargetId);
  }

  // 右键 / ⋯ 打开会话菜单：浏览器给出的是缩放后的视觉坐标，除以缩放比换算回设计坐标
  function openMenu(id: number, visualX: number, visualY: number) {
    const frame = document.querySelector(".ws-scale-frame") as HTMLElement | null;
    const scale = frame && frame.offsetWidth > 0 ? frame.getBoundingClientRect().width / frame.offsetWidth : 1;
    const factor = scale > 0 ? scale : 1;
    const maxX = (frame?.offsetWidth ?? 1280) - 190;
    const maxY = (frame?.offsetHeight ?? 800) - 190;
    setMenu({ id, x: Math.min(visualX / factor, maxX), y: Math.min(visualY / factor, maxY), confirmDelete: false });
  }

  async function hideConversation(id: number) {
    try {
      await ws.hideDmConversation(id);
      if (activeId === id) setActiveId(null);
      toast("会话已隐藏，对方来新消息会自动恢复");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setMenu(null);
  }

  async function deleteConversation(id: number) {
    try {
      await ws.deleteDmConversation(id);
      if (activeId === id) setActiveId(null);
      toast("会话已删除");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setMenu(null);
  }

  // 菜单打开期间：点击任意处 / Esc / 窗口变化即关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  return (
    <div className="ws-dm">
      <aside className="ws-dm-list" aria-label="私信会话列表">
        <div className="ws-dm-list-head">
          <b>私信</b>
          <button className="ws-btn" style={{ padding: "6px 12px", fontSize: 12 }} title="发起私聊" onClick={() => setShowContacts(true)}>
            <Icon name="plus" size={13} /> 添加
          </button>
        </div>
        <div className="ws-dm-scroll">
          {!ws.dmsLoaded && <ConversationSkeleton rows={4} />}
          {ws.dmsLoaded && ws.dmConversations.length === 0 && (
            <div className="ws-empty" style={{ margin: 12 }}>还没有私信，点击「添加」找同团队的成员聊聊</div>
          )}
          {ws.dmConversations.map((c) => (
            <div
              key={c.id}
              className={`ws-dm-item ${activeId === c.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`与 ${c.partner.displayName} 的会话`}
              onClick={() => setActiveId(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveId(c.id); }}
              onContextMenu={(e) => { e.preventDefault(); openMenu(c.id, e.clientX, e.clientY); }}
            >
              <span className="ws-avatar-pos">
                <Avatar name={c.partner.displayName} colorKey={c.partner.userId} />
                <i className={`ws-online-dot ${c.partner.online ? "on" : ""}`} />
              </span>
              <span className="ws-dm-item-main">
                <span className="ws-dm-item-top">
                  <b>{c.partner.displayName}</b>
                  {c.lastMessage && <small>{listTime(c.lastMessage.createdAt)}</small>}
                </span>
                <span className="ws-dm-item-preview">
                  {c.lastMessage
                    ? `${c.lastMessage.senderId === ws.me.id ? "我：" : ""}${c.lastMessage.content}`
                    : "开始对话吧"}
                </span>
              </span>
              {c.unreadCount > 0 && <span className="ws-dm-unread">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
              <button
                className="ws-dm-more"
                title="会话选项"
                aria-label={`${c.partner.displayName} 的会话选项`}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  openMenu(c.id, rect.left, rect.bottom + 4);
                }}
              >
                <Icon name="more" size={15} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {menu && (
        <div className="ws-dm-menu" role="menu" aria-label="会话选项" style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}>
          <button role="menuitem" onClick={() => void hideConversation(menu.id)}>
            隐藏会话
            <small>仅从我的列表移除；来新消息自动恢复</small>
          </button>
          <button role="menuitem" className="danger" onClick={() => {
            if (!menu.confirmDelete) { setMenu({ ...menu, confirmDelete: true }); return; }
            void deleteConversation(menu.id);
          }}>
            {menu.confirmDelete ? "确认删除？" : "删除会话"}
            <small>{menu.confirmDelete ? "将清空双方的全部消息" : "清空双方消息，不可恢复"}</small>
          </button>
        </div>
      )}

      {activeId !== null
        ? <DmThread key={activeId} conversationId={activeId} />
        : (
          <section className="ws-dm-thread">
            <div className="ws-dm-placeholder">
              <Icon name="message" size={30} />
              <p>选择左侧会话，或发起新的私聊</p>
              <small>仅限同团队成员之间，支持未读提醒与已读回执</small>
            </div>
          </section>
        )}

      {showContacts && (
        <ContactsModal onClose={() => setShowContacts(false)} onPicked={async (userId) => {
          setShowContacts(false);
          await ws.openDmWithPeer(userId);
        }} />
      )}
    </div>
  );
}

// 列表时间：今天显示时分，更早显示月日
function listTime(iso: string): string {
  return dayKey(iso) === dayKey(new Date().toISOString()) ? fmtTime(iso) : fmtDateShort(iso);
}

/* ---------- 右侧消息流 ---------- */

function DmThread({ conversationId }: { conversationId: number }) {
  const ws = useWorkspace();
  const conversation = ws.dmConversations.find((c): c is DmConversation => c.id === conversationId);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const markingRead = useRef(false);

  const partner = conversation?.partner;

  const load = useCallback(() => {
    api<{ messages: DmMessage[] }>(`/api/dm/${conversationId}/messages`)
      .then((d) => { setMessages(d.messages); setFailed(false); })
      .catch((e: Error) => { setFailed(true); setHint(e.message); });
  }, [conversationId]);

  // 首次加载 + 轮询（页面切到后台时暂停，避免无谓请求）
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load]);

  // 新消息到达时保持贴底；用户上滚查看历史则不动
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // 对方发来的未读消息：进入会话即标记已读，并同步左侧角标
  useEffect(() => {
    if (markingRead.current) return;
    if (!messages.some((m) => !m.mine && !m.readAt)) return;
    markingRead.current = true;
    api(`/api/dm/${conversationId}/read`, { method: "PUT", json: {} })
      .then(() => {
        const now = new Date().toISOString();
        setMessages((items) => items.map((m) => (!m.mine && !m.readAt ? { ...m, readAt: now } : m)));
        void ws.refreshDms();
      })
      .catch(() => { /* 标记失败不打断聊天，下轮轮询重试 */ })
      .finally(() => { markingRead.current = false; });
  }, [messages, conversationId, ws]);

  async function send() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setHint("");
    try {
      const d = await api<{ message: DmMessage }>(`/api/dm/${conversationId}/messages`, {
        method: "POST", json: { content },
      });
      stickToBottom.current = true;
      setMessages((items) => [...items, d.message]);
      setText("");
      void ws.refreshDms().catch(() => {});
    } catch (e) {
      setHint((e as Error).message);
      toast(`发送失败：${(e as Error).message}`, "error");
    } finally {
      setSending(false);
    }
  }

  // 我发出的最后一条消息：展示已读回执（日期分隔用相邻比较，不在渲染中改写变量）
  const lastMineId = [...messages].reverse().find((m) => m.mine)?.id ?? null;

  return (
    <section className="ws-dm-thread" aria-label="私信消息">
      <div className="ws-dm-thread-head">
        {partner && (
          <>
            <span className="ws-avatar-pos">
              <Avatar name={partner.displayName} colorKey={partner.userId} />
              <i className={`ws-online-dot ${partner.online ? "on" : ""}`} />
            </span>
            <b>{partner.displayName}</b>
            <span className={`ws-online-text ${partner.online ? "on" : ""}`}>{partner.online ? "在线" : "离线"}</span>
          </>
        )}
      </div>

      <div
        className="ws-dm-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {failed && <div className="ws-error" role="alert" style={{ margin: 12 }}>消息加载失败：{hint}<button className="ws-btn" style={{ marginLeft: 10 }} onClick={load}>重试</button></div>}
        {!failed && messages.length === 0 && (
          <div className="ws-empty" style={{ margin: "24px 16px" }}>向 {partner?.displayName ?? "对方"} 打个招呼吧 👋</div>
        )}
        {messages.map((m, i) => {
          const day = dayKey(m.createdAt);
          const showSep = i === 0 || dayKey(messages[i - 1].createdAt) !== day;
          return (
            <div key={m.id}>
              {showSep && <div className="ws-date-sep"><span>{fmtDateShort(m.createdAt)}</span></div>}
              <div className={`ws-dm-msg ${m.mine ? "mine" : ""}`}>
                <div className="ws-dm-bubble">{m.content}</div>
              </div>
              {m.id === lastMineId && (
                <div className={`ws-dm-receipt ${m.mine ? "mine" : ""}`}>{m.readAt ? "已读" : "未读"}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ws-dm-input">
        {hint && !failed && <div className="ws-error" style={{ marginTop: 0, marginBottom: 6 }}>{hint}</div>}
        <div className="ws-input-row">
          <textarea
            ref={inputRef}
            className="ws-chat-textarea"
            rows={1}
            placeholder={partner ? `发私信给 ${partner.displayName}…（Enter 发送）` : "发消息…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="ws-send" disabled={!text.trim() || sending} onClick={() => void send()}>
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------- 发起私聊：同团队联系人选择 ---------- */

function ContactsModal({ onClose, onPicked }: { onClose(): void; onPicked(userId: number): void | Promise<void> }) {
  const [contacts, setContacts] = useState<DmContact[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api<{ contacts: DmContact[] }>("/api/dm/contacts")
      .then((d) => { if (active) setContacts(d.contacts); })
      .catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  const filtered = (contacts ?? []).filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal title="发起私聊" onClose={onClose}>
      <div className="ws-field">
        <label htmlFor="dm-contact-search">搜索成员（仅同团队）</label>
        <input
          id="dm-contact-search"
          className="ws-input"
          placeholder="输入展示名筛选…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error && <div className="ws-error" role="alert">{error}</div>}
      {!contacts && !error && <div className="ws-empty">正在加载联系人…</div>}
      {contacts && filtered.length === 0 && (
        <div className="ws-empty">没有匹配的成员。先加入或创建团队，才能与成员私聊。</div>
      )}
      <div className="ws-dm-contacts">
        {filtered.map((c) => (
          <button
            key={c.userId}
            disabled={busyId !== null}
            onClick={() => { setBusyId(c.userId); void Promise.resolve(onPicked(c.userId)).catch((e: Error) => { setError(e.message); setBusyId(null); }); }}
          >
            <span className="ws-avatar-pos">
              <Avatar name={c.displayName} colorKey={c.userId} size="sm" />
              <i className={`ws-online-dot ${c.online ? "on" : ""}`} />
            </span>
            <span className="ws-dm-contact-name">{c.displayName}</span>
            <small className="ws-online-text">{c.online ? "在线" : "离线"}{c.teamName ? ` · ${c.teamName}${c.teamCount > 1 ? ` 等 ${c.teamCount} 个团队` : ""}` : ""}</small>
          </button>
        ))}
      </div>
    </Modal>
  );
}
