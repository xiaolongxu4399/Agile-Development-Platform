"use client";

// 团队聊天面板：置顶公告、日期分隔、@高亮、关联任务卡片、文件消息卡片、赞同/回复/置顶、
// QQ 式聊天记录搜索（原文/链接/文件/人名分类）、输入区（@选人/发文件/表情）
import { useEffect, useRef, useState } from "react";
import { api, STATUS_TEXT, dayKey, fmtDateShort, fmtSize, fmtTime } from "@/lib/api-client";
import { useWorkspace, Icon, Avatar } from "./shared";
import { renderMentions } from "./helpers";
import { toast } from "@/lib/toast";

const EMOJIS = ["👍", "🎉", "😂", "🙏", "💪", "👀", "❤️", "🔥"];

type ChatHit = {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; displayName: string };
  attachment: { id: number; name: string; size: number } | null;
};
type SearchType = "all" | "text" | "link" | "file" | "author";
const SEARCH_TABS: [SearchType, string][] = [["all", "全部"], ["text", "原文"], ["link", "链接"], ["file", "文件"], ["author", "人名"]];

export function ChatPanel() {
  const ws = useWorkspace();
  const project = ws.projects.find((p) => p.id === ws.selectedId);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; authorName: string; content: string } | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [searchAuthor, setSearchAuthor] = useState<number | null>(null);
  const [hits, setHits] = useState<ChatHit[] | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const searchReq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const messages = ws.chat;
  const pinned = messages.find((m) => m.pinned) ?? null;
  const memberNames = ws.detail?.members.map((m) => m.displayName) ?? [];
  const projectId = project?.id ?? null;

  // 新消息自动滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, project?.id]);

  useEffect(() => {
    setText("");
    setReplyTo(null);
    setHint("");
  }, [project?.id]);

  // 聊天记录搜索：300ms 防抖；人名分类需先选成员；请求序号防过期结果覆盖
  useEffect(() => {
    if (!searchOpen || !projectId) return;
    if (searchType === "author" && searchAuthor === null) return;
    const req = ++searchReq.current;
    const timer = setTimeout(async () => {
      const query = new URLSearchParams({ type: searchType });
      if (searchQ.trim()) query.set("q", searchQ.trim());
      if (searchType === "author" && searchAuthor) query.set("authorId", String(searchAuthor));
      try {
        const d = await api<{ hits: ChatHit[] }>(`/api/projects/${projectId}/chat/search?${query}`);
        if (searchReq.current === req) { setHits(d.hits); setSearchErr(""); }
      } catch (e) {
        if (searchReq.current === req) setSearchErr((e as Error).message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQ, searchType, searchAuthor, projectId]);

  function closeSearch() {
    setSearchOpen(false);
    setSearchQ("");
    setSearchType("all");
    setSearchAuthor(null);
    setHits(null);
    setSearchErr("");
  }

  if (!project) {
    return (
      <aside className="ws-chat">
        <div className="ws-chat-head"><b>团队聊天</b></div>
        <div className="ws-empty" style={{ margin: 16 }}>选择项目后开始群聊</div>
      </aside>
    );
  }

  async function send() {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await ws.sendChat(content, { replyToId: replyTo?.id });
      setText("");
      setReplyTo(null);
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function insertMention(name: string) {
    setText((t) => `${t}@${name} `);
    setShowMembers(false);
    inputRef.current?.focus();
  }

  let lastDay = "";

  return (
    <aside className="ws-chat">
      <div className="ws-chat-head">
        <Icon name="message" size={15} />
        <b>#{project.name}</b>
        <span>· {ws.detail?.members.length ?? project.members.length} 位成员</span>
        <button className="ws-icon-btn" style={{ marginLeft: "auto" }} title="搜索聊天记录" aria-label="搜索聊天记录"
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}>
          <Icon name="search" size={14} />
        </button>
      </div>

      {searchOpen && (
        <div className="ws-chat-search">
          <div className="ws-chat-search-row">
            <div className="ws-search" style={{ margin: 0, flex: 1 }}>
              <Icon name="search" size={13} />
              <input placeholder="搜索聊天记录…（原文 / 文件名 / 成员名）" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            </div>
          </div>
          <div className="ws-chat-search-row" role="group" aria-label="搜索分类">
            {SEARCH_TABS.map(([value, label]) => (
              <button key={value} className={`ws-filter-chip ${searchType === value ? "active" : ""}`}
                onClick={() => { setSearchType(value); if (value !== "author") setSearchAuthor(null); }}>
                {label}
              </button>
            ))}
          </div>
          {searchType === "author" && (
            <div className="ws-chat-search-row" role="group" aria-label="选择成员">
              {ws.detail?.members.map((m) => (
                <button key={m.userId} className={`ws-filter-chip ${searchAuthor === m.userId ? "active" : ""}`}
                  onClick={() => setSearchAuthor(searchAuthor === m.userId ? null : m.userId)}>
                  <Avatar name={m.displayName} colorKey={m.userId} size="sm" />{m.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!searchOpen && pinned && (
        <div className="ws-pinned" title="置顶公告">
          <span className="pin-ic"><Icon name="pin" size={13} /></span>
          <span style={{ flex: 1 }}>
            <b>{pinned.author.displayName}：</b>{pinned.content.slice(0, 80)}
          </span>
        </div>
      )}

      {searchOpen ? (
        <div className="ws-chat-scroll">
          {searchErr && <div className="ws-error" role="alert" style={{ margin: 12 }}>{searchErr}</div>}
          {!searchErr && searchType === "author" && searchAuthor === null && <div className="ws-empty" style={{ margin: "20px 4px" }}>先选择要查找的成员</div>}
          {!searchErr && !(searchType === "author" && searchAuthor === null) && hits === null && <div className="ws-empty" style={{ margin: "20px 4px" }}>输入关键词开始搜索…</div>}
          {!searchErr && !(searchType === "author" && searchAuthor === null) && hits?.length === 0 && <div className="ws-empty" style={{ margin: "20px 4px" }}>没有找到匹配的聊天记录</div>}
          {!searchErr && !(searchType === "author" && searchAuthor === null) && hits?.map((hit) => (
            <div key={hit.id} className="ws-hit">
              <Avatar name={hit.author.displayName} colorKey={hit.author.id} />
              <div className="ws-hit-main">
                <div className="ws-hit-head"><b>{hit.author.displayName}</b><span>{fmtDateShort(hit.createdAt)} {fmtTime(hit.createdAt)}</span></div>
                {hit.attachment ? (
                  <a className="ws-dm-file" href={`/api/files/${hit.attachment.id}`} title="点击下载">
                    <span className="ws-dm-file-ic"><Icon name="file" size={16} /></span>
                    <span className="ws-dm-file-main"><b>{hit.attachment.name}</b><small>{fmtSize(hit.attachment.size)} · 点击下载</small></span>
                    <Icon name="download" size={14} />
                  </a>
                ) : (
                  <div className="ws-hit-content">{hit.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="ws-chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="ws-empty" style={{ margin: "20px 4px" }}>还没有消息，打个招呼吧 👋</div>
          )}
          {messages.map((m) => {
            const day = dayKey(m.createdAt);
            const showSep = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showSep && (
                  <div className="ws-date-sep"><span>{fmtDateShort(m.createdAt)}</span></div>
                )}
                <div className="ws-msg">
                  <Avatar name={m.author.displayName} colorKey={m.author.id} />
                  <div className="ws-msg-body">
                    <div className="ws-msg-head"><b>{m.author.displayName}</b><span>{fmtTime(m.createdAt)}</span></div>
                    {m.replyTo && (
                      <div className="ws-msg-reply">回复 {m.replyTo.authorName}：{m.replyTo.content}</div>
                    )}
                    {m.attachment ? (
                      <a className="ws-dm-file" href={`/api/files/${m.attachment.id}`} title="点击下载">
                        <span className="ws-dm-file-ic"><Icon name="file" size={16} /></span>
                        <span className="ws-dm-file-main"><b>{m.attachment.name}</b><small>{fmtSize(m.attachment.size)} · 点击下载</small></span>
                        <Icon name="download" size={14} />
                      </a>
                    ) : (
                      <div className="ws-msg-content">{renderMentions(m.content, memberNames)}</div>
                    )}
                    {m.task && (
                      <div className="ws-task-link" onClick={() => ws.openTask(m.task!.id)}>
                        <span className="t-code">{m.task.code}</span>
                        <span className="t-title">{m.task.title}</span>
                        <span className={`ws-pill st-${m.task.status}`}>{STATUS_TEXT[m.task.status]}</span>
                      </div>
                    )}
                    <div className="ws-msg-actions">
                      <button className={m.likedByMe ? "liked" : ""} aria-label={m.likedByMe ? "取消赞同" : "赞同"} aria-pressed={m.likedByMe} title={m.likedByMe ? "取消赞同" : "赞同"} onClick={() => ws.toggleLike(m.id)}>
                        <span aria-hidden="true">👍</span>{m.likeCount > 0 ? ` ${m.likeCount}` : ""}
                      </button>
                      <button onClick={() => { setReplyTo({ id: m.id, authorName: m.author.displayName, content: m.content.slice(0, 40) }); inputRef.current?.focus(); }}>
                        回复
                      </button>
                      {ws.detail && (ws.detail.myRole === "owner" || ws.detail.myRole === "admin") && (
                        <button onClick={() => ws.togglePin(m.id, !m.pinned)} title={m.pinned ? "取消置顶" : "置顶为公告"}>
                          {m.pinned ? "取消置顶" : "置顶"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ws-chat-input">
        {replyTo && (
          <div className="ws-reply-banner">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              回复 {replyTo.authorName}：{replyTo.content}
            </span>
            <button className="ws-icon-btn" style={{ width: 20, height: 20 }} onClick={() => setReplyTo(null)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        )}
        {hint && <div className="ws-error" style={{ marginTop: 0, marginBottom: 6 }}>{hint}</div>}

        {showMembers && (
          <div className="ws-member-pick">
            {ws.detail?.members.map((m) => (
              <button key={m.userId} onClick={() => insertMention(m.displayName)}>
                <Avatar name={m.displayName} colorKey={m.userId} size="sm" />
                {m.displayName}
              </button>
            ))}
          </div>
        )}
        {showEmoji && (
          <div className="ws-member-pick" style={{ width: "auto", display: "flex", gap: 2, left: 34 }}>
            {EMOJIS.map((e) => (
              <button key={e} style={{ width: 34, fontSize: 15 }} onClick={() => { setText((t) => t + e); setShowEmoji(false); inputRef.current?.focus(); }}>
                {e}
              </button>
            ))}
          </div>
        )}

        <div className="ws-input-row">
          <div className="ws-input-tools">
            <button className="ws-tool-btn" title="发送文件到聊天（同时存入项目文件库）" onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={15} />
            </button>
            <button className="ws-tool-btn" title="提及成员" onClick={() => { setShowEmoji(false); setShowMembers((v) => !v); }}>
              <Icon name="at" size={15} />
            </button>
            <button className="ws-tool-btn" title="表情" onClick={() => { setShowMembers(false); setShowEmoji((v) => !v); }}>
              <Icon name="smile" size={15} />
            </button>
          </div>
          <textarea
            ref={inputRef}
            className="ws-chat-textarea"
            rows={1}
            placeholder={`发消息到 #${project.name}…（Enter 发送）`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="ws-send" disabled={!text.trim() || busy} onClick={send}>发送</button>
        </div>

        <input
          ref={fileRef} type="file" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              setHint("");
              const name = await ws.uploadProjectFile(file);
              await ws.refreshChat();
              toast(`已发送「${name}」`);
            } catch (err) {
              toast(`文件发送失败：${(err as Error).message}`, "error");
            }
          }}
        />
      </div>
    </aside>
  );
}

