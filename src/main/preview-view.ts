import { WebContentsView } from "electron";
import { PREVIEW_PARTITION } from "../shared/preview.ts";
import type { ViewLike } from "./preview-manager.ts";

/**
 * The only place a real WebContentsView is constructed. Everything else works
 * through ViewLike, which is why tests never need electron here.
 */
export function createPreviewView(): ViewLike {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: PREVIEW_PARTITION,
    },
  });
  view.setBackgroundColor("#1f1f1f");
  return view as unknown as ViewLike;
}
