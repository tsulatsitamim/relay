export async function copyRich(html: string, text: string): Promise<boolean> {
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
    try {
      const htmlBlob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([text], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob }),
      ]);
      return true;
    } catch {}
  }
  try {
    await navigator.clipboard?.writeText(text);
  } catch {}
  return false;
}

export function htmlFromNode(node: HTMLElement | null): string | null {
  if (!node) return null;
  const clone = node.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(".msg-actions, .msg-foot, button, textarea, input, .msg-edit")
    .forEach((element) => element.remove());
  return clone.innerHTML;
}