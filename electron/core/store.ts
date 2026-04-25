import Store from "electron-store";
import type { AppPrefs, SpaceMeta, SpaceWorkspaceUi } from "./types.js";

type StoreSchema = {
  vaultPath?: string;
  spacesMeta: Record<string, SpaceMeta>;
  appPrefs: AppPrefs;
};

const store = new Store<StoreSchema>({
  defaults: {
    spacesMeta: {},
    appPrefs: {}
  }
});

export function getVaultPath(): string | undefined {
  return store.get("vaultPath");
}

export function setVaultPath(vaultPath: string) {
  store.set("vaultPath", vaultPath);
}

export function getSpacesMeta(): Record<string, SpaceMeta> {
  return store.get("spacesMeta");
}

export function setSpaceLastAccessed(slug: string, at: string) {
  const spacesMeta = getSpacesMeta();
  spacesMeta[slug] = { ...(spacesMeta[slug] ?? {}), lastAccessedAt: at };
  store.set("spacesMeta", spacesMeta);
}

export function getAppPrefs(): AppPrefs {
  return store.get("appPrefs");
}

export function setAppPrefs(patch: Partial<AppPrefs>) {
  const cur = getAppPrefs();
  store.set("appPrefs", { ...cur, ...patch });
}

export function getSpaceWorkspaceUi(slug: string): SpaceWorkspaceUi | undefined {
  return getSpacesMeta()[slug]?.workspaceUi;
}

export function patchSpaceWorkspaceUi(slug: string, patch: Partial<SpaceWorkspaceUi>) {
  const spacesMeta = getSpacesMeta();
  const prev = spacesMeta[slug] ?? {};
  spacesMeta[slug] = {
    ...prev,
    workspaceUi: { ...(prev.workspaceUi ?? {}), ...patch }
  };
  store.set("spacesMeta", spacesMeta);
}
