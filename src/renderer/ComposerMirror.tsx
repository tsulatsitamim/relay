import type { RefObject } from "react";
import type { AvailableCommandLike } from "../shared/types.ts";
import { leadingCommands } from "./commands";

type Props = {
  text: string;
  commands?: AvailableCommandLike[];
  mirrorRef?: RefObject<HTMLDivElement | null>;
};

export function ComposerMirror({ text, commands = [], mirrorRef }: Props) {
  const { end } = leadingCommands(
    text,
    commands.map((command) => command.name),
  );
  const head = text.slice(0, end);
  const tail = text.slice(end);
  return (
    <div className="composer-mirror" aria-hidden="true" ref={mirrorRef}>
      {head
        .split(/(\s+)/)
        .filter(Boolean)
        .map((part, index) =>
          /^\/\S+$/.test(part) ? (
            <span className="token" key={index}>
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      {tail}
      {"\n"}
    </div>
  );
}
