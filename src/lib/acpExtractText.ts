/** Best-effort text extraction from ACP ContentChunk / ContentBlock payloads. */

function textFromBlock(block: unknown): string {
  if (!block || typeof block !== "object") return "";
  const b = block as Record<string, unknown>;
  if (b.type === "text" && typeof b.text === "string") return b.text;
  if (b.type === "resource_link" && typeof b.uri === "string") return b.uri;
  if (b.type === "image" && typeof b.data === "string") return "[image]";
  return "";
}

export function extractChunkText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const content = d.content;
  if (Array.isArray(content)) {
    return content.map((c) => textFromBlock(c)).join("");
  }
  return textFromBlock(content);
}

export function chunkMessageId(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const id = (data as Record<string, unknown>).messageId;
  return typeof id === "string" ? id : undefined;
}
