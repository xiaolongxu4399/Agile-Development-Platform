import { test } from "node:test";
import assert from "node:assert/strict";
import { countUnread, dmPair, dmPreview } from "../lib/dm.ts";

test("dmPair orders any direction into one canonical pair", () => {
  assert.deepEqual(dmPair(2, 7), [2, 7]);
  assert.deepEqual(dmPair(7, 2), [2, 7]);
});

test("dmPair rejects self-chat and non-integer ids", () => {
  assert.throws(() => dmPair(5, 5), /不能和自己私聊/);
  assert.throws(() => dmPair(1.5, 2), /整数/);
});

test("preview collapses whitespace and truncates with ellipsis", () => {
  assert.equal(dmPreview(null), "开始对话吧");
  assert.equal(dmPreview(""), "开始对话吧");
  assert.equal(dmPreview("  hello   world \n next "), "hello world next");
  const long = "字".repeat(70);
  assert.equal(dmPreview(long, 60), `${"字".repeat(60)}…`);
});

test("unread counts only partner messages without readAt", () => {
  const messages = [
    { senderId: 2, readAt: null },
    { senderId: 1, readAt: null },
    { senderId: 2, readAt: "2026-10-21T00:00:00Z" },
    { senderId: 2, readAt: null },
  ];
  assert.equal(countUnread(messages, 1), 2);
  assert.equal(countUnread(messages, 2), 1);
  assert.equal(countUnread([], 1), 0);
});
