import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type {
  AvailableCommandLike,
  PromptAttachment,
} from "../shared/types.ts";
import { readImageFiles } from "./attachments";
import { leadingCommands } from "./commands";
import type { Suggestion } from "./SuggestionMenu";

const lineHeight = 24;
const maxComposerHeight = 176;

function slashQuery(text: string, commands: AvailableCommandLike[]): string | null {
  const match = /(?:^|\s)\/([^\s\n]*)$/.exec(text);
  if (!match) return null;
  const before = text.slice(0, match.index);
  const { end } = leadingCommands(before, commands.map((command) => command.name));
  return end === before.length ? match[1] : null;
}

export type ComposerMenu =
  | { kind: "slash"; items: Suggestion[] }
  | { kind: "mention"; items: Suggestion[] }
  | null;

type Options = {
  commands?: AvailableCommandLike[];
  cwd?: string;
  inject?: { text: string; nonce: number; fromEventId?: string };
  onEnter: () => void;
};

export function useComposerInput({
  commands = [],
  cwd,
  inject,
  onEnter,
}: Options) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const enter = useRef(onEnter);
  enter.current = onEnter;

  const slashMatch = slashQuery(text, commands);
  const slashItems: Suggestion[] = slashMatch !== null
    ? commands
        .filter((c) => c.name.toLowerCase().includes(slashMatch.toLowerCase()))
        .map((c) => ({ id: c.name, label: `/${c.name}`, detail: c.description }))
    : [];
  const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(text);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const mentionItems: Suggestion[] = files.map((file) => ({ id: file, label: file }));
  const slashMenuOpen = slashItems.length > 0 && !dismissed;
  const mentionMenuOpen = !slashMenuOpen && mentionItems.length > 0 && !dismissed;
  const menu: ComposerMenu = slashMenuOpen
    ? { kind: "slash", items: slashItems }
    : mentionMenuOpen
      ? { kind: "mention", items: mentionItems }
      : null;
  const hasContent = Boolean(text.trim()) || attachments.length > 0;

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = `${lineHeight}px`;
    const next = el.scrollHeight;
    if (next > lineHeight) {
      el.style.height = `${Math.min(next, maxComposerHeight)}px`;
    }
  }, [text]);

  useEffect(() => {
    if (inject) {
      setText(inject.text);
      setDismissed(false);
      field.current?.focus();
    }
  }, [inject?.nonce]);

  useEffect(() => {
    if (mentionQuery === null || !cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void window.relay
        .listFiles(cwd, mentionQuery)
        .then((all) => {
          if (cancelled) return;
          setFiles(
            all
              .filter((file) => file.toLowerCase().includes(mentionQuery.toLowerCase()))
              .slice(0, 8),
          );
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [mentionQuery, cwd]);

  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [text]);

  function pick(index: number) {
    if (!menu) return;
    const item = menu.items[index];
    if (!item) return;
    if (menu.kind === "slash") {
      setText((prev) => prev.replace(/\/([^\s\n]*)$/, () => `/${item.id} `));
      return;
    }
    setText((prev) => prev.replace(/@([^\s@]*)$/, () => `@${item.id} `));
  }

  function buildPrompt(): string {
    return text.trim();
  }

  function reset() {
    setText("");
  }

  async function addFiles(list: ArrayLike<File> | File[]) {
    const picked = await readImageFiles(list);
    if (picked.length) setAttachments((prev) => [...prev, ...picked]);
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    if (pasted.length === 0) return;
    e.preventDefault();
    void addFiles(pasted);
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length === 0) return;
    e.preventDefault();
    void addFiles(dropped);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menu) {
      const count = menu.items.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % count);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + count) % count);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        pick(activeIndex);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        pick(activeIndex);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    enter.current();
  }

  return {
    field,
    text,
    setText,
    attachments,
    setAttachments,
    addFiles,
    menu,
    activeIndex,
    pick,
    onKeyDown,
    onPaste,
    onDragOver,
    onDrop,
    buildPrompt,
    reset,
    hasContent,
    submitting,
  };
}
