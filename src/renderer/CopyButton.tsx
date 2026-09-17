import { useEffect, useRef, useState } from "react";
import { IconCheck, IconCopy } from "./icons";
import { copyRich } from "./rich-clipboard";

export function CopyButton({
  text,
  html,
  label = "Copy message",
  title = "Copy",
}: {
  text: string;
  html?: () => string | null;
  label?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const revert = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (revert.current !== null) window.clearTimeout(revert.current);
    };
  }, []);

  function copy() {
    const rich = html?.();
    if (rich != null) {
      void copyRich(rich, text);
    } else {
      void navigator.clipboard?.writeText(text);
    }
    setCopied(true);
    if (revert.current !== null) window.clearTimeout(revert.current);
    revert.current = window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      className="msg-action"
      aria-label={label}
      title={title}
      onClick={copy}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}
