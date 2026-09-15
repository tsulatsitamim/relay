import { MAX_ATTACHMENT_BYTES } from "../shared/attachments.ts";
import type { PromptAttachment } from "../shared/types.ts";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function readImageFiles(
  files: ArrayLike<File>,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<PromptAttachment[]> {
  const picked: PromptAttachment[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!file || !file.type.startsWith("image/") || file.size > maxBytes) continue;
    try {
      const result = await readAsDataUrl(file);
      const comma = result.indexOf(",");
      if (comma < 0) continue;
      picked.push({
        name: file.name,
        mimeType: file.type,
        data: result.slice(comma + 1),
      });
    } catch {
      continue;
    }
  }
  return picked;
}
