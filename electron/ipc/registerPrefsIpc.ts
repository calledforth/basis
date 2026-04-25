import { ipcMain } from "electron";
import type { AppPrefs, SpaceWorkspaceUi } from "../core/types.js";
import {
  getAppPrefs,
  patchSpaceWorkspaceUi,
  getSpaceWorkspaceUi,
  setAppPrefs
} from "../core/store.js";

export function registerPrefsIpc() {
  ipcMain.handle("prefs:get-app", () => getAppPrefs());

  ipcMain.handle("prefs:set-app", (_evt, patch: Partial<AppPrefs>) => {
    setAppPrefs(patch);
    return true;
  });

  ipcMain.handle("prefs:get-space-workspace", (_evt, slug: string) => {
    return getSpaceWorkspaceUi(slug);
  });

  ipcMain.handle("prefs:set-space-workspace", (_evt, slug: string, patch: Partial<SpaceWorkspaceUi>) => {
    patchSpaceWorkspaceUi(slug, patch);
    return true;
  });
}
