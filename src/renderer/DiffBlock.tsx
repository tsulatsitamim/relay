import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
import { diffStat, unifiedDiff } from "../shared/diff.ts";
import type { DiffComment } from "../shared/types.ts";
import { IconTrash } from "./icons";
import { unsentComments } from "./review.ts";

const OPEN_ERROR_MS = 2000;

export type DiffCommentDraft = {
  path: string;
  startLine: number;
  endLine: number;
  body: string;
};

type Props = {
  path: string;
  oldText: string | null;
  newText: string;
  reviewed?: boolean;
  comments?: DiffComment[];
  onToggleReviewed?: () => void;
  onOpen?: () => void | Promise<unknown>;
  onAddComment?: (input: DiffCommentDraft) => void;
  onDeleteComment?: (id: string) => void;
  onSendReview?: (ids: string[]) => void;
};

type DiffLine = {
  text: string;
  className: string;
  line: number | null;
};

function parseDiffLines(text: string): DiffLine[] {
  let next = 1;
  return text.split("\n").map((raw) => {
    if (raw.startsWith("@@")) {
      const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      next = header ? Number(header[1]) : 1;
      return { text: raw, className: "diff-line diff-hunk", line: null };
    }
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      return { text: raw, className: "diff-line", line: null };
    }
    if (raw.startsWith("+")) {
      const line = next;
      next += 1;
      return { text: raw, className: "diff-line diff-add-line", line };
    }
    if (raw.startsWith("-")) {
      return { text: raw, className: "diff-line diff-del-line", line: null };
    }
    const line = next;
    next += 1;
    return { text: raw, className: "diff-line", line };
  });
}

function commentRef(comment: DiffComment): string {
  if (comment.endLine <= comment.startLine) {
    return `${comment.path}:${comment.startLine}`;
  }
  return `${comment.path}:${comment.startLine}-${comment.endLine}`;
}

export function DiffBlock({
  path,
  oldText,
  newText,
  reviewed,
  comments,
  onToggleReviewed,
  onOpen,
  onAddComment,
  onDeleteComment,
  onSendReview,
}: Props) {
  const diff = unifiedDiff(oldText, newText, path);
  const lines = parseDiffLines(diff);
  const { adds, dels } = diffStat(oldText, newText);
  const [openError, setOpenError] = useState(false);
  const [form, setForm] = useState<{ anchor: number; head: number } | null>(null);
  const [draft, setDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (form) bodyRef.current?.focus();
  }, [form]);

  const fileComments = comments ?? [];
  const unsent = unsentComments(fileComments);
  const formRow = form ? Math.max(form.anchor, form.head) : null;

  function showOpenError() {
    setOpenError(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenError(false), OPEN_ERROR_MS);
  }

  function openInEditor(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    let result: void | Promise<unknown>;
    try {
      result = onOpen?.();
    } catch {
      showOpenError();
      return;
    }
    Promise.resolve(result).then(
      (ok) => {
        if (ok === false) showOpenError();
      },
      () => showOpenError(),
    );
  }

  function startComment(line: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (form && e.shiftKey) {
      setForm({ anchor: form.anchor, head: line });
      return;
    }
    setForm({ anchor: line, head: line });
    setDraft("");
  }

  function closeCommentForm() {
    setForm(null);
    setDraft("");
  }

  function submitComment(e: MouseEvent | FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!form || !draft.trim()) return;
    onAddComment?.({
      path,
      startLine: Math.min(form.anchor, form.head),
      endLine: Math.max(form.anchor, form.head),
      body: draft,
    });
    closeCommentForm();
  }

  function onCommentBodyKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeCommentForm();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      submitComment(e);
    }
  }

  return (
    <details className="diff">
      <summary className="diff-head">
        <span className="diff-path">{path}</span>
        {fileComments.length > 0 ? (
          <span className="diff-comment-count">{fileComments.length}</span>
        ) : null}
        <span className="diff-stat">
          <span className="diff-add">+{adds}</span>
          <span className="diff-del">-{dels}</span>
        </span>
        {onToggleReviewed ? (
          <button
            type="button"
            className={`diff-reviewed${reviewed ? " on" : ""}`}
            aria-pressed={Boolean(reviewed)}
            aria-label="Reviewed"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleReviewed();
            }}
          >
            Reviewed
          </button>
        ) : null}
        {onOpen ? (
          <button
            type="button"
            className="diff-action"
            aria-label="Open in editor"
            onClick={openInEditor}
          >
            Open
          </button>
        ) : null}
        {openError ? (
          <span className="diff-open-error">Could not open file</span>
        ) : null}
        {onSendReview ? (
          <button
            type="button"
            className="diff-action diff-send-review"
            aria-label="Send review"
            disabled={unsent.length === 0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSendReview(unsent.map((comment) => comment.id));
            }}
          >
            Send review
          </button>
        ) : null}
        <button
          type="button"
          className="diff-action"
          aria-label="Copy diff"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void navigator.clipboard?.writeText(diff);
          }}
        >
          Copy
        </button>
      </summary>
      <pre className="diff-body">
        {lines.map(({ text, className, line }, i) => (
          <div key={i} className={className}>
            {text}
            {line != null && onAddComment ? (
              <button
                type="button"
                className="diff-line-comment"
                aria-label={`Comment on line ${line}`}
                onClick={(e) => startComment(line, e)}
              >
                Comment
              </button>
            ) : null}
            {form && line === formRow ? (
              <div className="diff-comment-form">
                <textarea
                  ref={bodyRef}
                  className="diff-comment-input"
                  aria-label="Comment body"
                  value={draft}
                  rows={2}
                  placeholder="Review comment"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onCommentBodyKeyDown}
                />
                <div className="diff-comment-form-actions">
                  <button
                    type="button"
                    className="diff-comment-add"
                    aria-label="Add comment"
                    onClick={submitComment}
                  >
                    Add comment
                  </button>
                  <button
                    type="button"
                    className="diff-comment-cancel"
                    aria-label="Cancel"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      closeCommentForm();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {fileComments.length > 0 ? (
          <div className="diff-comments">
            {fileComments.map((comment) => (
              <div
                key={comment.id}
                className={`diff-comment${comment.sentAt ? " sent" : ""}`}
              >
                <span className="diff-comment-ref">{commentRef(comment)}</span>
                <span className="diff-comment-body">{comment.body}</span>
                {onDeleteComment ? (
                  <button
                    type="button"
                    className="diff-comment-delete"
                    aria-label="Delete comment"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteComment(comment.id);
                    }}
                  >
                    <IconTrash />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </pre>
    </details>
  );
}
