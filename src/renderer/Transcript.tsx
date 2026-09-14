import { useEffect, useRef } from "react";
import type { TranscriptEvent } from "../shared/types.ts";
import { unifiedDiff } from "../shared/diff.ts";

type Props = {
  events: TranscriptEvent[];
};

export function Transcript({ events }: Props) {
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [events]);

  return (
    <div className={`transcript${events.length === 0 ? " empty" : ""}`}>
      {events.map((event) => {
        if (event.kind === "user") {
          return (
            <div key={event.id} className="msg user">
              {String(event.payload.text ?? "")}
            </div>
          );
        }
        if (event.kind === "agent_message") {
          return (
            <div key={event.id} className="msg agent">
              {String(event.payload.text ?? "")}
            </div>
          );
        }
        if (event.kind === "tool_call") {
          return (
            <div key={event.id} className="tool">
              <span className="kicker">{String(event.payload.status ?? "pending")}</span>
              <span>{String(event.payload.title ?? "Tool")}</span>
            </div>
          );
        }
        if (event.kind === "diff") {
          const path = String(event.payload.path ?? "file");
          const diff = unifiedDiff(
            (event.payload.oldText as string | null) ?? null,
            String(event.payload.newText ?? ""),
            path,
          );
          return (
            <details key={event.id} className="diff" open>
              <summary>{path}</summary>
              <pre>
                {diff.split("\n").map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.startsWith("+") && !line.startsWith("+++")
                        ? "add"
                        : line.startsWith("-") && !line.startsWith("---")
                          ? "del"
                          : undefined
                    }
                  >
                    {line}
                  </div>
                ))}
              </pre>
            </details>
          );
        }
        if (event.kind === "error") {
          return (
            <div key={event.id} className="msg error">
              {String(event.payload.text ?? "Error")}
            </div>
          );
        }
        return (
          <div key={event.id} className="msg status">
            {String(event.payload.text ?? "")}
          </div>
        );
      })}
      <div ref={bottom} />
    </div>
  );
}
