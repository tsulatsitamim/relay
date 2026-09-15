import type { PromptAttachment } from "../shared/types.ts";

export async function makeThumb(
  dataUrl: string,
  maxSize = 512,
): Promise<string | undefined> {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

export async function withThumbs(
  attachments: PromptAttachment[],
): Promise<PromptAttachment[]> {
  const outgoing: PromptAttachment[] = [];
  for (const attachment of attachments) {
    const thumb = await makeThumb(
      `data:${attachment.mimeType};base64,${attachment.data}`,
    );
    outgoing.push(thumb ? { ...attachment, thumb } : attachment);
  }
  return outgoing;
}
