import { ipcMain } from "electron";
import { VaultService } from "../vault/service.js";

type RegisterSpacesIpcArgs = {
  vaultService: VaultService;
};

export function registerSpacesIpc(args: RegisterSpacesIpcArgs) {
  ipcMain.handle("spaces:list", async () => args.vaultService.listSpaces());
  ipcMain.handle("spaces:create", async (_evt, title?: string) => args.vaultService.createSpace(title));
  ipcMain.handle("spaces:set-last-accessed", async (_evt, slug: string) => {
    args.vaultService.setLastAccessed(slug);
    return true;
  });

  ipcMain.handle("spaces:rename", async (_evt, slug: string, newTitle: string) => {
    await args.vaultService.renameSpace(slug, newTitle);
    return true;
  });

  ipcMain.handle("spaces:delete", async (_evt, slug: string) => {
    await args.vaultService.deleteSpace(slug);
    return true;
  });
}
