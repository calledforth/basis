import { type ReactNode, useEffect, useRef, useState } from "react";
import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { replaceAll } from "@milkdown/kit/utils";

// Custom browser-safe lightweight frontmatter parser
function parseFrontmatter(text: string) {
  if (!text.startsWith("---")) return { data: {}, content: text };
  const endIdx = text.indexOf("\n---", 3);
  if (endIdx === -1) return { data: {}, content: text };
  
  const yamlText = text.substring(4, endIdx).trim();
  const content = text.substring(endIdx + 4).replace(/^\n/, "");
  
  const data: Record<string, any> = {};
  yamlText.split("\n").forEach(line => {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.substring(0, colonIdx).trim();
      let val = line.substring(colonIdx + 1).trim();
      // Remove quotes if present
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.substring(1, val.length - 1);
      }
      data[key] = val;
    }
  });
  
  return { data, content };
}

function stringifyMatter(content: string, data: Record<string, any>) {
  if (Object.keys(data).length === 0) return content;
  let yaml = "---\n";
  for (const [key, val] of Object.entries(data)) {
    // Only quote if string contains spaces or special characters
    const stringVal = String(val);
    const hasSpecial = /[:\[\]\{\}>|*&!%@`,]/.test(stringVal) || stringVal.includes(" ");
    yaml += `${key}: ${hasSpecial ? `'${stringVal.replace(/'/g, "''")}'` : stringVal}\n`;
  }
  yaml += "---\n" + content;
  return yaml;
}

type Props = {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  fullWidth?: boolean;
  banner?: React.ReactNode;
};

function MarkdownHeader({ data }: { data: Record<string, any> }) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div className="relative z-10 px-8 pt-12 pb-6 flex flex-col gap-4">
      {data.title && (
        <h1 className="text-5xl font-bold tracking-tight text-white m-0">
          {data.title}
        </h1>
      )}
      <div className="flex flex-col gap-1.5 mt-4 font-mono text-xs text-neutral-400">
        {Object.entries(data).map(([key, val]) => {
          if (key === "title") return null; // title is rendered above
          return (
            <div key={key} className="flex flex-row items-baseline gap-4">
              <span className="w-24 shrink-0 uppercase tracking-wider text-neutral-500">
                {key}
              </span>
              <span className="truncate">{String(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MarkdownEditor({ value, onSave, fullWidth = false, banner }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onSaveRef = useRef(onSave);
  const readyRef = useRef(false);

  // Parse frontmatter
  const [parsed, setParsed] = useState(() => parseFrontmatter(value || ""));
  const lastSeenBodyRef = useRef<string>(parsed.content);
  const metaRef = useRef<Record<string, any>>(parsed.data);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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
          const nextValue = stringifyMatter(markdown, metaRef.current);
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
      <MarkdownHeader data={parsed.data} />
      <div ref={hostRef} className="markdown-editor-host px-8" />
    </div>
  );
}
