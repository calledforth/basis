import { app, BrowserWindow } from "electron";
import path from "node:path";

type CreateMainWindowArgs = {
  preloadPath: string;
  onMaximizedChange: (maximized: boolean) => void;
};

export async function createMainWindow(args: CreateMainWindowArgs): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    title: "Basis",
    backgroundColor: "#141414",
    webPreferences: {
      preload: args.preloadPath
    }
  });

  win.on("maximize", () => args.onMaximizedChange(true));
  win.on("unmaximize", () => args.onMaximizedChange(false));

  if (app.isPackaged) {
    await win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    await win.loadURL("http://localhost:5173");
  }

  return win;
}
