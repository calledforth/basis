import { type ReactNode, useEffect, useRef, useState } from "react";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { replaceAll } from "@milkdown/kit/utils";
import matter from "gray-matter";

function maybeNormalizePseudofrontmatter(raw: string) {
  const t = raw || "";
  if (!t.startsWith("***")) return raw;

  const lines = t.replace(/\r\n/g, "\n").split("\n");
  let i = 1;
  while (i < lines.length && !lines[i].trim()) i += 1;

  const kv: string[] = [];
  let sawKv = false;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (sawKv) {
        i += 1;
        break;
      }
      i += 1;
      continue;
    }
    if (/^[-]{5,}\s*$/.test(line)) {
      i += 1;
      break;
    }
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}\s*:\s+.+$/.test(line)) break;
    kv.push(line);
    sawKv = true;
    i += 1;
  }

  if (kv.length < 2) return raw;

  const rest = lines.slice(i).join("\n").replace(/^\n+/, "");
  const yamlBlock = ["---", ...kv, "---", "", rest].join("\n");
  return yamlBlock;
}

function parseFrontmatter(text: string) {
  try {
    const normalized = maybeNormalizePseudofrontmatter(text || "");
    const parsed = matter(normalized);
    return {
      data: (parsed.data ?? {}) as Record<string, unknown>,
      content: parsed.content ?? ""
    };
  } catch {
    return {
      data: {},
      content: text || ""
    };
  }
}

function hasExplicitFrontmatter(text: string) {
  return text.startsWith("---\n") || text.startsWith("---\r\n");
}

function stripFrontmatterBlock(text: string) {
  if (!hasExplicitFrontmatter(text)) return text;
  const normalized = text.replace(/\r\n/g, "\n");
  const endIdx = normalized.indexOf("\n---\n", 4);
  if (endIdx === -1) return text;
  return normalized.slice(endIdx + 5);
}

function stringifyMatter(content: string, data: Record<string, unknown>, previousRaw: string) {
  if (Object.keys(data).length === 0) {
    return content;
  }
  try {
    return matter.stringify(content, data);
  } catch {
    const withoutFm = stripFrontmatterBlock(previousRaw);
    return withoutFm || content;
  }
}

type Props = {
  value: string;
  filePath?: string;
  onSave: (next: string) => void | Promise<void>;
  fullWidth?: boolean;
  banner?: React.ReactNode;
};

function MetadataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.9rem_1fr] items-start gap-5 text-[0.64rem] leading-[1.1rem]">
      <span className="font-mono uppercase tracking-[0.08em] text-neutral-500/75">{label}</span>
      <span className="font-mono text-neutral-200/85">{children}</span>
    </div>
  );
}

function toLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderMetadataValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function OverviewHeader({ data }: { data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;
  const title = typeof data.title === "string" ? data.title : undefined;
  const preferred = ["website", "type", "id", "pinned", "created", "updated", "url"];
  const keys = [
    ...preferred.filter((key) => key in data && key !== "title"),
    ...Object.keys(data).filter((key) => key !== "title" && !preferred.includes(key))
  ];

  return (
    <div className="relative z-10 px-8 pt-[4.35rem] pb-6">
      <div className="mb-[5.55rem] max-w-[35.8rem] space-y-1.5">
        {keys.map((key) => {
          const raw = data[key];
          const display = renderMetadataValue(raw);
          const normalizedKey = key.toLowerCase();
          const isUrl = normalizedKey === "url" && typeof raw === "string";
          const isBadge = (normalizedKey === "website" || normalizedKey === "type") && typeof raw === "string";
          const label = toLabel(key);
          return (
            <MetadataRow key={key} label={label}>
              {isBadge ? (
                <span className="rounded-[0.18rem] border border-amber-300/70 px-1 py-px text-[0.58rem] uppercase tracking-[0.06em] text-amber-300">
                  {display}
                </span>
              ) : isUrl ? (
                <span className="box-decoration-clone px-0.5 underline decoration-neutral-300/65 underline-offset-2">
                  {display}
                </span>
              ) : (
                display
              )}
            </MetadataRow>
          );
        })}
      </div>
      {title && (
        <h1 className="max-w-[33rem] text-[clamp(3.25rem,7vw,4.95rem)] font-semibold leading-[0.99] tracking-[0em] text-neutral-100 drop-shadow-[0_18px_34px_rgb(0_0_0/58%)]">
          {title}
        </h1>
      )}
    </div>
  );
}

function GenericHeader({ data }: { data: Record<string, unknown> }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="relative z-10 px-8 pt-12 pb-6 flex flex-col gap-4">
      {typeof data.title === "string" && <h1 className="text-5xl font-bold tracking-tight text-white m-0">{data.title}</h1>}
      <div className="flex flex-col gap-1.5 mt-4 font-mono text-xs text-neutral-400">
        {Object.entries(data).map(([key, val]) => {
          if (key === "title") return null;
          return (
            <div key={key} className="flex flex-row items-baseline gap-4">
              <span className="w-24 shrink-0 uppercase tracking-wider text-neutral-500">{toLabel(key)}</span>
              <span className="truncate">{renderMetadataValue(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarkdownEditor({ value, filePath, onSave, fullWidth = false, banner }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onSaveRef = useRef(onSave);
  const readyRef = useRef(false);

  const [parsed, setParsed] = useState(() => parseFrontmatter(value || ""));
  const lastSeenBodyRef = useRef<string>(parsed.content);
  const metaRef = useRef<Record<string, unknown>>(parsed.data);
  const rawValueRef = useRef(value || "");
  const isOverview = filePath?.toLowerCase().endsWith("overview.md") ?? false;

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    rawValueRef.current = value || "";
  }, [value]);

  useEffect(() => {
    if (!hostRef.current || editorRef.current) return;
    let disposed = false;
    readyRef.current = false;

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, hostRef.current);
        ctx.set(defaultValueCtx, parsed.content || "# New note\n");
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(history)
      .use(trailing)
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          lastSeenBodyRef.current = markdown;
          const nextValue = stringifyMatter(markdown, metaRef.current, rawValueRef.current);
          void onSaveRef.current(nextValue);
        });
      });

    editorRef.current = editor;
    void editor.create().then(() => {
      if (disposed) return;
      readyRef.current = true;
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      void editor.destroy();
      editorRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editorRef.current) return;
    if (!readyRef.current) return;

    // We only update the editor if the *incoming* body is different
    // from what the editor currently has.
    const newParsed = parseFrontmatter(value || "");
    if (newParsed.content === lastSeenBodyRef.current) {
        // Just update metadata in case it changed externally
        metaRef.current = newParsed.data;
        setParsed(newParsed);
        return;
    }

    metaRef.current = newParsed.data;
    setParsed(newParsed);
    lastSeenBodyRef.current = newParsed.content;
    editorRef.current.action(replaceAll(newParsed.content || ""));
  }, [value]);

  return (
    <div className={`markdown-editor-surface thin-scrollbar flex flex-col relative ${fullWidth ? "editor-full-width" : "editor-standard-width"}`}>
      {banner}
      {isOverview ? <OverviewHeader data={parsed.data} /> : <GenericHeader data={parsed.data} />}
      <div ref={hostRef} className="markdown-editor-host px-8" />
    </div>
  );
}
