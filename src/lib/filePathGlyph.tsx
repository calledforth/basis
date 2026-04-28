import {
  type LucideIcon,
  Braces,
  File,
  FileCode2,
  FileText,
} from "lucide-react";

const DEFAULT = { Icon: File as LucideIcon, className: "text-slate-400" as const };

const GLYPH: Record<string, { Icon: LucideIcon; className: string }> = {
  ".md": { Icon: FileText, className: "text-cyan-400" },
  ".mdx": { Icon: FileText, className: "text-cyan-300" },
  ".txt": { Icon: FileText, className: "text-zinc-400" },
  ".ts": { Icon: FileCode2, className: "text-sky-400" },
  ".tsx": { Icon: FileCode2, className: "text-sky-300" },
  ".mts": { Icon: FileCode2, className: "text-sky-400" },
  ".cts": { Icon: FileCode2, className: "text-sky-400" },
  ".js": { Icon: FileCode2, className: "text-amber-300" },
  ".jsx": { Icon: FileCode2, className: "text-amber-200" },
  ".mjs": { Icon: FileCode2, className: "text-amber-300" },
  ".cjs": { Icon: FileCode2, className: "text-amber-200" },
  ".json": { Icon: Braces, className: "text-amber-200" },
  ".jsonc": { Icon: Braces, className: "text-amber-200" },
  ".css": { Icon: Braces, className: "text-pink-400" },
  ".scss": { Icon: Braces, className: "text-pink-300" },
  ".html": { Icon: FileCode2, className: "text-orange-400" },
  ".py": { Icon: FileCode2, className: "text-emerald-400" },
  ".rs": { Icon: FileCode2, className: "text-orange-300" },
  ".go": { Icon: FileCode2, className: "text-cyan-400" },
  ".yaml": { Icon: Braces, className: "text-rose-300" },
  ".yml": { Icon: Braces, className: "text-rose-300" },
};

function extFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

export function fileTabDisplayName(path: string): string {
  const s = path.replaceAll("\\", "/");
  const base = s.split("/").pop() || s;
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex > 0) return base.slice(0, dotIndex);
  return base;
}

export function FilePathGlyph({ path, className = "h-3.5 w-3.5" }: { path: string; className?: string }) {
  const ext = extFromPath(path);
  const { Icon, className: color } = GLYPH[ext] ?? DEFAULT;
  return <Icon className={`shrink-0 ${color} ${className}`} strokeWidth={1.5} aria-hidden />;
}
