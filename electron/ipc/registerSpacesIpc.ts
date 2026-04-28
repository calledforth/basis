import { ipcMain } from "electron";
import { ChatDb } from "../core/chatDb.js";
import { VaultService } from "../vault/service.js";

type RegisterSpacesIpcArgs = {
  vaultService: VaultService;
  chatDb: ChatDb;
};

export function registerSpacesIpc(args: RegisterSpacesIpcArgs) {
  ipcMain.handle("spaces:list", async () => {
    const spaces = await args.vaultService.listSpaces();
    return spaces.map((space) => ({
      ...space,
      chatCount: args.chatDb.listThreads(space.slug).length
    }));
  });
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
