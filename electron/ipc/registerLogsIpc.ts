import { ipcMain } from "electron";
import { clearLogs, listLogs } from "../core/logs.js";

export function registerLogsIpc() {
  ipcMain.handle("logs:list", () => listLogs());
  ipcMain.handle("logs:clear", () => {
    clearLogs();
    return true;
  });
}
