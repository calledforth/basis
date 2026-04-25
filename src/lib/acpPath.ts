export function posixBasename(p: string): string {
  const normalized = p.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function posixDirname(p: string): string {
  const normalized = p.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return ".";
  return `./${parts.slice(0, -1).join("/")}`;
}

export function toVaultRelPath(args: { spaceRoot: string; rawPath: string }): string | undefined {
  const raw = args.rawPath.trim();
  if (!raw) return undefined;

  const normRaw = raw.replaceAll("\\", "/");
  if (!normRaw.includes("/") && !normRaw.includes("\\")) {
    // Already relative single-segment paths (e.g. "overview.md")
    return normRaw;
  }

  const root = args.spaceRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  const lowerRoot = root.toLowerCase();
  const lowerRaw = normRaw.toLowerCase();

  if (lowerRaw.startsWith(lowerRoot + "/") || lowerRaw === lowerRoot) {
    const rel = normRaw.slice(root.length).replace(/^\/+/, "");
    return rel || undefined;
  }

  // file:// URIs
  if (normRaw.startsWith("file://")) {
    try {
      const url = new URL(normRaw);
      const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      const winPath = url.hostname ? `\\\\${url.hostname}${url.pathname.replaceAll("/", "\\")}` : pathname;
      const candidate = (url.hostname ? winPath : pathname).replaceAll("\\", "/");
      const lowerCandidate = candidate.toLowerCase();
      if (lowerCandidate.startsWith(lowerRoot + "/") || lowerCandidate === lowerRoot) {
        const rel = candidate.slice(root.length).replace(/^\/+/, "");
        return rel || undefined;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}
