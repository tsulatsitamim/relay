import { useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import { IconCheck, IconCopy } from "./icons";

type Props = {
  code: string;
  lang?: string;
  revealLine?: number | null;
};

function splitLines(html: string): string[] | null {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (const chunk of html.split(/(<[^>]*>)/)) {
    if (chunk === "") continue;
    if (chunk.startsWith("<")) {
      const isClose = chunk.startsWith("</");
      const selfClosing = chunk.endsWith("/>");
      if (!isClose && !selfClosing && /^<[a-zA-Z]/.test(chunk)) depth += 1;
      if (isClose) depth -= 1;
      if (depth < 0) return null;
      current += chunk;
    } else {
      const segments = chunk.split("\n");
      for (let index = 0; index < segments.length; index += 1) {
        if (index > 0) {
          if (depth !== 0) return null;
          out.push(current);
          current = "";
        }
        current += segments[index];
      }
    }
  }
  if (depth !== 0) return null;
  out.push(current);
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function CodeBlock({ code, lang, revealLine = null }: Props) {
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLPreElement>(null);

  const html = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return null;
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [code, lang]);

  const lines = useMemo(() => {
    if (revealLine == null) return null;
    if (html != null) {
      const highlighted = splitLines(html);
      if (highlighted) return highlighted;
    }
    return splitLines(escapeHtml(code));
  }, [revealLine, html, code]);

  useEffect(() => {
    if (revealLine == null || !bodyRef.current) return;
    const target = bodyRef.current.querySelector(`[data-line="${revealLine}"]`);
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }, [revealLine, lines, html]);

  async function copy() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{lang ?? "text"}</span>
        <button
          type="button"
          className="code-copy"
          aria-label="Copy code"
          onClick={() => void copy()}
        >
          {copied ? <IconCheck /> : <IconCopy />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="code-body" ref={bodyRef}>
        {lines ? (
          <code className="hljs">
            {lines.map((line, index) => (
              <span
                key={index}
                data-line={index + 1}
                className="code-line"
                dangerouslySetInnerHTML={{ __html: `${line}\n` }}
              />
            ))}
          </code>
        ) : html != null ? (
          <code
            className={`hljs language-${lang}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <code className="hljs">{code}</code>
        )}
      </pre>
    </div>
  );
}
