import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { ContextMenuItem } from "@pierre/trees";
import { FilePlus, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { FLATTENED_PREFIX, type FileTreeMutationEvent } from "@pierre/trees";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import type { FileTree as PierreFileTreeModel } from "@pierre/trees";
import type { FileNode } from "../types";

export type FileTreeFileActions = {
  createFile: (relPath: string) => Promise<void>;
  mkdir: (relPath: string) => Promise<void>;
  move: (from: string, to: string) => Promise<void>;
  remove: (relPath: string) => Promise<void>;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "File operation failed.";
}

function toDiskPath(p: string): string {
  const s = p.startsWith(FLATTENED_PREFIX) ? p.slice(FLATTENED_PREFIX.length) : p;
  return s.replace(/\/+$/g, "");
}

function flattenModelPaths(nodes: FileNode[]): string[] {
  const out: string[] = [];
  const walk = (n: FileNode) => {
    if (n.type === "directory") {
      out.push(`${n.path.replace(/\/+$/g, "")}/`);
    } else {
      out.push(n.path);
    }
    n.children?.forEach(walk);
  };
  for (const node of nodes) walk(node);
  return out;
}

function flattenPathKeys(nodes: FileNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (n: FileNode) => {
    out.add(n.path);
    n.children?.forEach(walk);
  };
  for (const node of nodes) walk(node);
  return out;
}

function parentDirForNewItem(item: { path: string; kind: "file" | "directory" }): string {
  if (item.kind === "directory") return item.path;
  const i = item.path.lastIndexOf("/");
  return i === -1 ? "" : item.path.slice(0, i);
}

function diskParentForNewItem(item: { path: string; kind: "file" | "directory" }): string {
  return toDiskPath(parentDirForNewItem(item));
}

function joinRel(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

const PIERRE_UNSAFE_CSS = `
  [data-file-tree-search-container] { display: none; }
  [data-file-tree-search-container][data-open="true"] { display: flex; }
  [data-type="item"][data-item-selected="true"] [data-item-section="icon"] { color: unset; }
`;

function nextRelPathInParent(base: string, stem: string, ext: string, taken: Set<string>) {
  let n = 0;
  for (;;) {
    const name = n === 0 ? `${stem}${ext}` : `${stem}-${n}${ext}`;
    const rel = joinRel(base, name);
    if (!taken.has(rel)) return rel;
    n += 1;
  }
}

const menuBtn = `flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs font-medium text-[var(--basis-text)] outline-none hover:bg-[var(--basis-tab-active-bg)] focus-visible:bg-[var(--basis-tab-active-bg)] focus-visible:ring-1 focus-visible:ring-[var(--basis-text-muted)]`;

function FileTreeContextMenuView({
  item,
  pathKeys,
  a,
  close,
  onStartRename
}: {
  item: ContextMenuItem;
  pathKeys: Set<string>;
  a: FileTreeFileActions;
  close: (o?: { restoreFocus?: boolean }) => void;
  onStartRename: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const first = rootRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
    first?.focus();
  }, []);

  const run = useCallback(
    (fn: () => void | Promise<void>) => {
      void (async () => {
        try {
          close({ restoreFocus: false });
          await fn();
        } catch (e) {
          const msg = getErrorMessage(e);
          console.error(e);
          window.alert(msg);
        }
      })();
    },
    [close]
  );

  const onMenuKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = [
      ...((rootRef.current?.querySelectorAll("button[role=menuitem]") ?? []) as NodeListOf<HTMLButtonElement>)
    ].filter((b) => !b.disabled);
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const active = document.activeElement;
    let idx = items.indexOf(active as HTMLButtonElement);
    if (idx < 0) idx = 0;
    if (e.key === "ArrowDown") idx = (idx + 1) % items.length;
    else if (e.key === "ArrowUp") idx = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") idx = 0;
    else if (e.key === "End") idx = items.length - 1;
    items[idx]?.focus();
  }, []);

  const base = diskParentForNewItem(item);
  return (
    <div
      ref={rootRef}
      className="min-w-[9.5rem] rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface)] py-0.5 shadow-md"
      data-file-tree-context-menu-root="true"
      role="menu"
      onKeyDown={onMenuKeyDown}
    >
      <button
        type="button"
        role="menuitem"
        className={menuBtn}
        onClick={() => run(() => a.createFile(nextRelPathInParent(base, "untitled", ".md", pathKeys)))}
      >
        <FilePlus className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} />
        New file
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuBtn}
        onClick={() => run(() => a.mkdir(nextRelPathInParent(base, "new-folder", "", pathKeys)))}
      >
        <FolderPlus className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} />
        New folder
      </button>
      <button
        type="button"
        role="menuitem"
        className={menuBtn}
        onClick={() => {
          close({ restoreFocus: false });
          queueMicrotask(onStartRename);
        }}
      >
        <Pencil className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} />
        Rename
      </button>
      <div className="my-0.5 border-t border-[var(--basis-border)]" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={menuBtn}
        onClick={() =>
          run(() => a.remove(toDiskPath(item.path)))
        }
      >
        <Trash2 className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} />
        Delete
      </button>
    </div>
  );
}

export function FileTree({
  id,
  nodes,
  activeFile,
  onPick,
  fileActions,
  onSelectionPathsChange
}: {
  id?: string;
  nodes: FileNode[];
  activeFile: string;
  onPick: (path: string) => void;
  fileActions: FileTreeFileActions | null;
  onSelectionPathsChange?: (paths: string[]) => void;
}) {
  const paths = useMemo(() => flattenModelPaths(nodes), [nodes]);
  const pathsKey = useMemo(() => paths.join("\0"), [paths]);
  const pathKeys = useMemo(() => flattenPathKeys(nodes), [nodes]);

  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const modelRef = useRef<PierreFileTreeModel | null>(null);
  const fileActionsRef = useRef(fileActions);
  fileActionsRef.current = fileActions;

  const { model } = useFileTree({
    id,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    paths: [],
    search: true,
    unsafeCSS: PIERRE_UNSAFE_CSS,
    density: "compact",
    icons: { set: "complete", colored: true },
    composition: fileActions
      ? {
          contextMenu: { enabled: true, triggerMode: "right-click" }
        }
      : undefined,
    dragAndDrop: fileActions
      ? {
          onDropError: (msg) => {
            window.alert(`File move failed: ${msg}`);
          }
        }
      : false,
    renaming: Boolean(fileActions),
    onSelectionChange: (selected) => {
      const m = modelRef.current;
      if (!m) return;
      if (onSelectionPathsChange) {
        const selectedPaths = selected
          .map((p) => toDiskPath(p))
          .filter((p, index, arr) => Boolean(p) && arr.indexOf(p) === index);
        onSelectionPathsChange(selectedPaths);
      }
      const p = selected[selected.length - 1];
      if (!p) return;
      const item = m.getItem(p);
      if (!item || item.isDirectory()) return;
      const disk = toDiskPath(p);
      if (disk === activeFileRef.current) return;
      onPickRef.current(disk);
    }
  });
  modelRef.current = model;

  useEffect(() => {
    if (!fileActions) return;
    return model.onMutation("*", (ev: FileTreeMutationEvent) => {
      const a = fileActionsRef.current;
      if (!a) return;
      if (ev.operation === "reset" || ev.operation === "add") return;
      void (async () => {
        try {
          if (ev.operation === "batch") {
            for (const sub of ev.events) {
              if (sub.operation === "move") {
                await a.move(toDiskPath(sub.from), toDiskPath(sub.to));
              } else if (sub.operation === "remove") {
                await a.remove(toDiskPath(sub.path));
              }
            }
            return;
          }
          if (ev.operation === "move") {
            await a.move(toDiskPath(ev.from), toDiskPath(ev.to));
            return;
          }
          if (ev.operation === "remove") {
            await a.remove(toDiskPath(ev.path));
          }
        } catch (e) {
          window.alert(getErrorMessage(e));
          console.error(e);
          if (!id) return;
          try {
            const tree = await window.basis.files.tree(id);
            model.resetPaths(flattenModelPaths(tree));
          } catch {
            // ignore
          }
        }
      })();
    });
  }, [fileActions, id, model]);

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, pathsKey, paths]);

  useEffect(() => {
    if (paths.length === 0) return;
    const rel = toDiskPath(activeFile);
    const item = model.getItem(rel) ?? model.getItem(activeFile);
    if (item && !item.isDirectory()) {
      item.select();
    }
  }, [activeFile, model, pathsKey, paths.length]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (!e.ctrlKey && !e.metaKey) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      }
      e.preventDefault();
      model.openSearch();
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [model]);

  return (
    <PierreFileTree
      id={id}
      model={model}
      className="basis-pierre-file-tree h-full w-full min-h-0"
      style={{ height: "100%", minHeight: 0, flex: 1 }}
      renderContextMenu={
        !fileActions
          ? undefined
          : (item, context) => (
              <FileTreeContextMenuView
                item={item}
                pathKeys={pathKeys}
                a={fileActions}
                close={context.close}
                onStartRename={() => {
                  modelRef.current?.startRenaming(item.path);
                }}
              />
            )
      }
    />
  );
}
