export {};
declare global {
  interface Window {
    ipc: {
      setWindowTitle: (section?: string) => Promise<boolean>;
      getAppMeta: () => Promise<{
        appName: string;
        version: string;
        platform: string;
        arch: string;
        gitBinary: string;
        logPath: string;
        buildCommit: string;
        buildDate: string;
      }>;
      selectDocx: () => Promise<{ filePath: string; bytes: Uint8Array } | null>;
      selectMultipleDocx: () => Promise<
        Array<{ filePath: string; bytes: Uint8Array }> | null
      >;
      pickRepos: () => Promise<{ repoName: string; repoPath: string }[]>;
      listChanges: (
        repos: { repoPath: string; repoName?: string }[],
        base?: string
      ) => Promise<import("@/types/manual").RepoChanges[]>;
      saveDocx: (
        bytes: Uint8Array,
        defaultName?: string
      ) => Promise<{ saved: boolean; filePath: string } | null>;
      previewDocxPdf: (
        bytes: Uint8Array,
        fileName?: string
      ) => Promise<
        | {
            fileName: string;
            bytes: Uint8Array;
            mimeType: string;
          }
        | {
            fileName: string;
            error: string;
          }
        | null
      >;
      chooseRoots: () => Promise<string[]>;
      discover: (roots?: string[]) => Promise<string[]>;
      scan: (repoPaths: string[]) => Promise<import("@/types/git").RepoStatus[]>;
      scanCommit: (
        repoPaths: string[],
        commitId: string
      ) => Promise<import("@/types/git").GitScanCommitResult>;
      getAppLogPath: () => Promise<string>;
      gitLastModified: (
        repoPath: string,
        filePaths: string[]
      ) => Promise<Record<string, string>>;
      scanDiscovered: () => Promise<import("@/types/git").RepoStatus[]>;
      startGitWatch: (repoPaths: string[]) => Promise<boolean>;
      stopGitWatch: (repoPaths?: string[]) => Promise<boolean>;
      onGitWatchUpdate: (
        callback: (statuses: import("@/types/git").RepoStatus[]) => void
      ) => () => void;
      templateList: () => Promise<
        Array<{
          id: string;
          fileName: string;
          filePath: string;
          name: string;
          sourceFileName: string;
          createdAt: string;
          updatedAt: string;
          size?: number;
        }>
      >;
      templateImportDocx: () => Promise<
        | {
            id: string;
            fileName: string;
            filePath: string;
            name: string;
            sourceFileName: string;
            createdAt: string;
            updatedAt: string;
          }
        | null
      >;
      templateRead: (id: string) => Promise<
        | {
            id: string;
            name: string;
            sourceFileName: string;
            bytes: Uint8Array;
          }
        | null
      >;
      templatePreviewPdf: (id: string) => Promise<
        | {
            id: string;
            bytes: Uint8Array;
            mimeType: string;
            fromCache: boolean;
          }
        | {
            id: string;
            error: string;
          }
        | null
      >;
      templateDelete: (id: string) => Promise<boolean>;
      draftList: () => Promise<
        Array<{
          id: string;
          fileName: string;
          filePath: string;
          name: string;
          createdAt: string;
          updatedAt: string;
          size?: number;
          activeStep?: number;
          visibleStepKeys?: string[];
          progressState?: unknown;
        }>
      >;
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
          backupTables?: unknown;
          templateBytesBase64: string | null;
        };
      }) => Promise<{
        id: string;
        fileName: string;
        filePath: string;
        name: string;
        createdAt: string;
        updatedAt: string;
      } | null>;
      draftRead: (id: string) => Promise<
        | {
            id: string;
            fileName: string;
            filePath: string;
            name: string;
            createdAt: string;
            updatedAt: string;
            state: {
              manualTitle: string;
              activeStep: number;
              visibleStepKeys?: string[];
              data: unknown;
              sections: unknown;
              detailedPieces: unknown;
              detailedFixPieces?: unknown;
              backupTables?: unknown;
              templateBytesBase64: string | null;
            };
          }
        | null
      >;
      draftDelete: (id: string) => Promise<boolean>;
    };
  }
}
