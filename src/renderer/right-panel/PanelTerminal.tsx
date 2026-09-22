import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { terminalFontSize, terminalTheme, type StyleReader } from "./terminal-theme.ts";
import type { TerminalEvent } from "../../shared/terminal.ts";

const SCROLLBACK_LINES = 5000;
const FIT_DEBOUNCE_MS = 100;

type ExitState = { exitCode: number | null; signal: number | null };

type Props = {
  terminalId: string;
  onStartNew: () => void;
  onCloseSelf: () => void;
};

const readStyle: StyleReader = (name) => {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return "";
  }
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

function exitLabel(exit: ExitState): string {
  if (exit.signal !== null) return `[process exited with signal ${exit.signal}]`;
  return `[process exited with code ${exit.exitCode ?? 0}]`;
}

// Each terminal tab owns its own view: the key makes React tear down and
// rebuild the whole subtree when the active terminal changes, so no exit,
// missing or notice state can leak from one terminal into another.
export function PanelTerminal(props: Props) {
  return <TerminalView key={props.terminalId} {...props} />;
}

function TerminalView({ terminalId, onStartNew, onCloseSelf }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [exit, setExit] = useState<ExitState | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || missing) return;

    const term = new Terminal({
      scrollback: SCROLLBACK_LINES,
      fontFamily: readStyle("--mono") || undefined,
      fontSize: terminalFontSize(readStyle),
      theme: terminalTheme(readStyle),
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      // The host has no layout yet; the ResizeObserver below will fit it.
    }
    term.focus();

    let disposed = false;
    let fitTimer: ReturnType<typeof setTimeout> | null = null;
    let attached = false;
    const buffered: TerminalEvent[] = [];

    const apply = (event: TerminalEvent) => {
      if (event.type === "terminalData") {
        term.write(event.data);
        return;
      }
      if (event.type === "terminalExit") {
        term.write(`\r\n${exitLabel({ exitCode: event.exitCode, signal: event.signal })}\r\n`);
        setExit({ exitCode: event.exitCode, signal: event.signal });
        return;
      }
      setExit(null);
      term.reset();
    };

    const unsubscribe = window.relay.terminal.onEvent((event) => {
      if (event.terminalId !== terminalId) return;
      // Anything landing before the replay snapshot resolves is held back, so
      // the snapshot can never be written twice or out of order.
      if (!attached) {
        buffered.push(event);
        return;
      }
      apply(event);
    });

    const dataSubscription = term.onData((data) => {
      void window.relay.terminal.write(terminalId, data);
    });
    const resizeSubscription = term.onResize(({ cols, rows }) => {
      void window.relay.terminal.resize(terminalId, cols, rows);
    });

    // Ctrl-modified keys belong to the shell (Ctrl-C is SIGINT). ⌘-combos stay
    // with the app, except ⌘C/⌘V, which are xterm's selection and clipboard.
    term.attachCustomKeyEventHandler((event) => {
      if (!event.metaKey) return true;
      const key = event.key.toLowerCase();
      return key === "c" || key === "v";
    });

    const scheduleFit = () => {
      if (fitTimer !== null) clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        fitTimer = null;
        if (disposed) return;
        try {
          fit.fit();
        } catch {
          return;
        }
      }, FIT_DEBOUNCE_MS);
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(scheduleFit);
      observer.observe(host);
    }

    let themeObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      themeObserver = new MutationObserver(() => {
        term.options.theme = terminalTheme(readStyle);
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }

    void window.relay.terminal
      .attach(terminalId)
      .then((result) => {
        if (disposed) return;
        if (!result.ok) {
          setMissing(true);
          return;
        }
        if (result.data) term.write(result.data);
        if (result.exited) {
          setExit({ exitCode: result.exitCode, signal: result.signal });
        }
        attached = true;
        for (const event of buffered) {
          if (event.type === "terminalData" && event.seq <= result.seq) continue;
          if (event.type === "terminalExit" && result.exited) continue;
          apply(event);
        }
        buffered.length = 0;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        attached = true;
        buffered.length = 0;
        setNotice(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      if (fitTimer !== null) clearTimeout(fitTimer);
      unsubscribe();
      observer?.disconnect();
      themeObserver?.disconnect();
      dataSubscription.dispose();
      resizeSubscription.dispose();
      term.dispose();
    };
  }, [terminalId, missing]);

  if (missing) {
    return (
      <div className="panel-terminal">
        <p className="panel-note">This terminal is no longer running.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onCloseSelf();
            onStartNew();
          }}
        >
          Start a new terminal
        </button>
      </div>
    );
  }

  return (
    <div className="panel-terminal">
      <div className="panel-terminal-host" ref={hostRef} />
      {notice ? <p className="panel-note">{notice}</p> : null}
      {exit ? (
        <div className="panel-terminal-footer">
          <span className="panel-note">{exitLabel(exit)}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setExit(null);
              void window.relay.terminal.restart(terminalId).catch(() => {
                // The respawn failed, so main dropped the terminal; offer the
                // same recovery path as a terminal that is simply gone.
                setMissing(true);
              });
            }}
          >
            Restart
          </button>
        </div>
      ) : null}
    </div>
  );
}
