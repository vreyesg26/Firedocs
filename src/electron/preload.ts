import { contextBridge, ipcRenderer } from "electron";

// Exponemos TODO bajo window.ipc (unificado)
contextBridge.exposeInMainWorld("ipc", {
  setWindowTitle: (section?: string) => ipcRenderer.invoke("app:set-title", section),

  // DOCX (lo que ya tenías)
  selectDocx: () => ipcRenderer.invoke("select-docx"),
  selectMultipleDocx: () => ipcRenderer.invoke("select-multiple-docx"),
  saveDocx: (bytes: Uint8Array, defaultName?: string) =>
    ipcRenderer.invoke("save-docx", { bytes, defaultName }),
  previewDocxPdf: (bytes: Uint8Array, fileName?: string) =>
    ipcRenderer.invoke("docx:preview-pdf", { bytes, fileName }),

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
  getAppLogPath: () => ipcRenderer.invoke("app:get-log-path"),
  gitLastModified: (repoPath: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:last-modified", { repoPath, filePaths }),
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
  templatePreviewPdf: (id: string) => ipcRenderer.invoke("template:preview-pdf", id),
  templateDelete: (id: string) => ipcRenderer.invoke("template:delete", id),

  // --- Borradores ---
  draftList: () => ipcRenderer.invoke("draft:list"),
  draftSave: (payload: {
    id?: string;
    name?: string;
        state: {
          manualTitle: string;
          activeStep: number;
          visibleStepKeys?: string[];
          data: unknown;
          sections: unknown;
      detailedPieces: unknown;
      detailedFixPieces?: unknown;
      templateBytesBase64: string | null;
    };
  }) => ipcRenderer.invoke("draft:save", payload),
  draftRead: (id: string) => ipcRenderer.invoke("draft:read", id),
  draftDelete: (id: string) => ipcRenderer.invoke("draft:delete", id),
});
