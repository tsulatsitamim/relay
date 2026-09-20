import { useState, type ReactNode } from "react";
import type {
  PanelAction,
  RightPanelSurface,
  SessionPanelState,
} from "../../shared/right-panel.ts";
import {
  IconFiles,
  IconGitCompare,
  IconListTodo,
  IconPanelRight,
  IconPlus,
  IconX,
} from "../icons";

export function surfaceTitle(surface: RightPanelSurface): string {
  if (surface.kind === "changes") return "Changes";
  if (surface.kind === "files") return "Files";
  if (surface.kind === "plan") return "Plan";
  const parts = surface.path.split("/");
  return parts[parts.length - 1] || surface.path;
}

function surfaceIcon(surface: RightPanelSurface): ReactNode {
  if (surface.kind === "changes") return <IconGitCompare />;
  if (surface.kind === "files") return <IconFiles />;
  if (surface.kind === "plan") return <IconListTodo />;
  return <IconFiles />;
}

const ADD_ACTIONS: Array<{ kind: "changes" | "files" | "plan"; label: string }> = [
  { kind: "changes", label: "Changes" },
  { kind: "files", label: "Files" },
  { kind: "plan", label: "Plan" },
];

type Props = {
  state: SessionPanelState;
  dispatch: (action: PanelAction) => void;
  maximized: boolean;
  onMaximize: () => void;
};

export function RightPanelTabs({ state, dispatch, maximized, onMaximize }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);

  return (
    <div className="right-panel-tabs">
      <div className="right-panel-tab-strip" role="tablist" aria-label="Panel surfaces">
        {state.surfaces.map((surface) => (
          <div
            key={surface.id}
            role="tab"
            tabIndex={0}
            aria-selected={state.activeSurfaceId === surface.id}
            className={
              state.activeSurfaceId === surface.id
                ? "right-panel-tab active"
                : "right-panel-tab"
            }
            onClick={() => dispatch({ type: "activate", id: surface.id })}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuId(surface.id);
            }}
          >
            {surfaceIcon(surface)}
            <span className="right-panel-tab-title">{surfaceTitle(surface)}</span>
            <button
              type="button"
              className="right-panel-tab-close"
              aria-label={`Close ${surfaceTitle(surface)}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "close", id: surface.id });
              }}
            >
              <IconX />
            </button>
            {menuId === surface.id ? (
              <div className="right-panel-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "close", id: surface.id });
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "closeOthers", id: surface.id });
                  }}
                >
                  Close others
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuId(null);
                    dispatch({ type: "closeAll" });
                  }}
                >
                  Close all
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div className="right-panel-add">
          <button
            type="button"
            className="icon-btn"
            aria-label="Add panel surface"
            onClick={() => setAddOpen((value) => !value)}
          >
            <IconPlus />
          </button>
          {addOpen ? (
            <div className="right-panel-menu" role="menu">
              {ADD_ACTIONS.map((action) => (
                <button
                  key={action.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddOpen(false);
                    dispatch({ type: "open", kind: action.kind });
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label={maximized ? "Restore panel size" : "Maximize panel"}
        onClick={onMaximize}
      >
        <IconPanelRight />
      </button>
    </div>
  );
}
