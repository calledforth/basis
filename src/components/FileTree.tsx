import type { FileNode } from "../types";
import { typographyBodySm } from "../lib/typography";

export function FileTree({
  nodes,
  activeFile,
  onPick
}: {
  nodes: FileNode[];
  activeFile: string;
  onPick: (path: string) => void;
}) {
  return (
    <ul className={`m-0 list-none space-y-0.5 p-0 ${typographyBodySm}`}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === "file" ? (
            <button
              type="button"
              className={
                activeFile === node.path
                  ? "w-full rounded-md border border-neutral-600 bg-neutral-900 px-2 py-1.5 text-left text-neutral-50"
                  : "w-full rounded-md border border-transparent px-2 py-1.5 text-left text-neutral-400 transition-colors hover:border-neutral-800 hover:bg-neutral-900/50 hover:text-neutral-200"
              }
              onClick={() => onPick(node.path)}
            >
              {node.name}
            </button>
          ) : (
            <details open className="group">
              <summary className="cursor-pointer select-none rounded-md px-2 py-1 text-neutral-500 hover:bg-neutral-900/50 hover:text-neutral-300">
                {node.name}
              </summary>
              <div className="mt-1 border-l border-neutral-800 pl-2">
                <FileTree nodes={node.children ?? []} activeFile={activeFile} onPick={onPick} />
              </div>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
