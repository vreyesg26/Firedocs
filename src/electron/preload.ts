import { contextBridge, ipcRenderer } from "electron";

// Exponemos TODO bajo window.ipc (unificado)
contextBridge.exposeInMainWorld("ipc", {
  // DOCX (lo que ya tenías)
  selectDocx: () => ipcRenderer.invoke("select-docx"),
  saveDocx: (bytes: Uint8Array, defaultName?: string) =>
    ipcRenderer.invoke("save-docx", { bytes, defaultName }),

  // (si usas estos en otro lado, los dejamos)
  pickRepos: () => ipcRenderer.invoke("git:pick-repos"),
  listChanges: (
    repos: { repoPath: string; repoName?: string }[],
    base?: string
  ) => ipcRenderer.invoke("git:list-changes", { repos, base }),

  // --- GIT: descubrimiento y escaneo ---
  chooseRoots: (): Promise<string[]> => ipcRenderer.invoke("git:choose-roots"),
  discover: (roots?: string[]): Promise<string[]> =>
    ipcRenderer.invoke("git:discover", roots),
  scan: (repoPaths: string[]) => ipcRenderer.invoke("git:scan", repoPaths),
  scanCommit: (repoPaths: string[], commitId: string) =>
    ipcRenderer.invoke("git:scan-commit", { repoPaths, commitId }),
  scanDiscovered: () => ipcRenderer.invoke("git:scan-discovered"),
  startGitWatch: (repoPaths: string[]) =>
    ipcRenderer.invoke("git:watch-start", repoPaths),
  stopGitWatch: (repoPaths?: string[]) =>
    ipcRenderer.invoke("git:watch-stop", repoPaths),
  onGitWatchUpdate: (
    callback: (statuses: import("../types/git.js").RepoStatus[]) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      statuses: import("../types/git.js").RepoStatus[]
    ) => callback(statuses ?? []);
    ipcRenderer.on("git:watch-update", listener);
    return () => ipcRenderer.removeListener("git:watch-update", listener);
  },

  // --- Templates (.fd) ---
  templateList: () => ipcRenderer.invoke("template:list"),
  templateImportDocx: () => ipcRenderer.invoke("template:import-docx"),
  templateRead: (id: string) => ipcRenderer.invoke("template:read", id),
});
