export {};

declare global {
  interface Window {
    api: {
      pickDocx(): Promise<string | null>;
      autoParseDocx(filePath: string): Promise<
        | {
            filePath: string;
            fields: {
              key: string;
              value: string;
              source: string;
              confidence: number;
              location: string;
            }[];
          }
        | { error: string }
      >;
    };

    // Unificamos el puente aquí (coincide con preload.ts)
    ipc: {
      setWindowTitle(section?: string): Promise<boolean>;
      getAppMeta(): Promise<{
        appName: string;
        version: string;
        platform: string;
        arch: string;
        gitBinary: string;
        logPath: string;
        buildCommit: string;
        buildDate: string;
      }>;

      // DOCX
      selectDocx(): Promise<any>;
      selectMultipleDocx(): Promise<any>;
      saveDocx(bytes: Uint8Array, defaultName?: string): Promise<void>;
      previewDocxPdf(
        bytes: Uint8Array,
        fileName?: string,
      ): Promise<
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

      // (opcionales, si los usas)
      pickRepos(): Promise<any>;
      listChanges(
        repos: { repoPath: string; repoName?: string }[],
        base?: string
      ): Promise<any>;

      // GIT
      chooseRoots(): Promise<string[]>;
      discover(roots?: string[]): Promise<string[]>;
      scan(repoPaths: string[]): Promise<import("./git").RepoStatus[]>;
      scanCommit(
        repoPaths: string[],
        commitId: string,
      ): Promise<import("./git").GitScanCommitResult>;
      getAppLogPath(): Promise<string>;
      gitLastModified(
        repoPath: string,
        filePaths: string[],
      ): Promise<Record<string, string>>;
      scanDiscovered(): Promise<import("./git").RepoStatus[]>;
      startGitWatch(repoPaths: string[]): Promise<boolean>;
      stopGitWatch(repoPaths?: string[]): Promise<boolean>;
      onGitWatchUpdate(
        callback: (statuses: import("./git").RepoStatus[]) => void,
      ): () => void;

      // Templates
      templateList(): Promise<
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
      templateImportDocx(): Promise<
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
      templateRead(id: string): Promise<
        | {
            id: string;
            name: string;
            sourceFileName: string;
            bytes: Uint8Array;
          }
        | null
      >;
      templatePreviewPdf(id: string): Promise<
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
      templateDelete(id: string): Promise<boolean>;
      draftList(): Promise<
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
      draftSave(payload: {
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
      }): Promise<{
        id: string;
        fileName: string;
        filePath: string;
        name: string;
        createdAt: string;
        updatedAt: string;
      } | null>;
      draftRead(id: string): Promise<
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
      draftDelete(id: string): Promise<boolean>;
    };

    // ⛔️ Eliminamos window.git para evitar confusión.
  }
}

//holaa
