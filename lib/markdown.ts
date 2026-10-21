/* 极简 Markdown 渲染器：先整体 HTML 转义再做替换，输出天然免疫 XSS。
   支持课程协作文档的常用子集：标题、粗体、斜体、行内代码、代码块、
   有序/无序列表、引用、分隔线、http(s) 链接、换行。 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 行内元素：`代码` → **粗体** → *斜体* → [文字](http(s) 链接)；只允许 http/https 协议
function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

interface Block {
  kind: "p" | "h" | "code" | "quote" | "ul" | "ol" | "hr";
  level?: number;
  lines: string[];
  text?: string;
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length) blocks.push({ kind: "p", lines: buffer });
  };

  let paragraph: string[] = [];
  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块：``` 开始，直到下一个 ``` 或结尾
    if (/^```/.test(line.trim())) {
      flushParagraph(paragraph); paragraph = [];
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
      if (i < lines.length) i++; // 跳过结束围栏
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph); paragraph = [];
      blocks.push({ kind: "h", level: heading[1].length, lines: [heading[2]] });
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph(paragraph); paragraph = [];
      blocks.push({ kind: "hr", lines: [] });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraph); paragraph = [];
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: quote });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph(paragraph); paragraph = [];
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: "ul", lines: items });
      continue;
    }

    const ordered = line.match(/^\s*\d+[.、]\s+(.*)$/);
    if (ordered) {
      flushParagraph(paragraph); paragraph = [];
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+[.、]\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ kind: "ol", lines: items });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paragraph); paragraph = [];
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph(paragraph);
  return blocks;
}

export function renderMarkdown(source: string): string {
  const blocks = parseBlocks(source);
  return blocks.map((block) => {
    switch (block.kind) {
      case "h":
        return `<h${block.level}>${renderInline(block.lines[0])}</h${block.level}>`;
      case "hr":
        return "<hr />";
      case "code":
        return `<pre><code>${escapeHtml(block.lines.join("\n"))}</code></pre>`;
      case "quote":
        return `<blockquote><p>${block.lines.map(renderInline).join("<br />")}</p></blockquote>`;
      case "ul":
        return `<ul>${block.lines.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`;
      case "ol":
        return `<ol>${block.lines.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`;
      default:
        return `<p>${block.lines.map(renderInline).join("<br />")}</p>`;
    }
  }).join("\n");
}
