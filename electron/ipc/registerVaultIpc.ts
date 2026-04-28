import { dialog, ipcMain } from "electron";
import fs from "node:fs/promises";
import { addLog } from "../core/logs.js";
import { getVaultPath, setVaultPath } from "../core/store.js";
import { VaultService } from "../vault/service.js";

type RegisterVaultIpcArgs = {
  vaultService: VaultService;
};

export function registerVaultIpc(args: RegisterVaultIpcArgs) {
  ipcMain.handle("config:get", () => {
    return {
      vaultPath: getVaultPath()
    };
  });

  ipcMain.handle("vault:pick", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    setVaultPath(result.filePaths[0]);
    addLog({ scope: "vault", level: "info", message: "Vault selected", data: { vaultPath: result.filePaths[0] } });
    return result.filePaths[0];
  });

  ipcMain.handle("vault:set", async (_evt, vaultPath: string) => {
    await fs.mkdir(vaultPath, { recursive: true });
    setVaultPath(vaultPath);
    addLog({ scope: "vault", level: "info", message: "Vault set", data: { vaultPath } });
    return true;
  });

  ipcMain.handle("space:file-tree", async (_evt, slug: string) => {
    const root = args.vaultService.getSpacePath(slug);
    args.vaultService.setupWatcherForSpace(slug);
    return args.vaultService.listFilesRecursively(root);
  });

  ipcMain.handle("space:file-read", async (_evt, slug: string, relPath: string) => {
    return args.vaultService.readFile(slug, relPath);
  });

  ipcMain.handle("space:file-write", async (_evt, slug: string, relPath: string, content: string) => {
    await args.vaultService.writeFile(slug, relPath, content);
    return true;
  });

  ipcMain.handle("space:file-create", async (_evt, slug: string, relPath: string) => {
    await args.vaultService.createFile(slug, relPath);
    return true;
  });

  ipcMain.handle("space:file-mkdir", async (_evt, slug: string, relPath: string) => {
    await args.vaultService.mkdirInSpace(slug, relPath);
    return true;
  });

  ipcMain.handle("space:file-move", async (_evt, slug: string, fromRel: string, toRel: string) => {
    await args.vaultService.movePath(slug, fromRel, toRel);
    return true;
  });

  ipcMain.handle("space:file-remove", async (_evt, slug: string, relPath: string) => {
    await args.vaultService.removePath(slug, relPath);
    return true;
  });
}
