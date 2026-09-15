import { useMemo, useState } from "react";
import hljs from "highlight.js/lib/common";
import { IconCheck, IconCopy } from "./icons";

type Props = {
  code: string;
  lang?: string;
};

export function CodeBlock({ code, lang }: Props) {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return null;
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [code, lang]);

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
      <pre className="code-body">
        {html != null ? (
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
