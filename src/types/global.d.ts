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
      // DOCX
      selectDocx(): Promise<any>;
      saveDocx(bytes: Uint8Array, defaultName?: string): Promise<void>;

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
    };

    // ⛔️ Eliminamos window.git para evitar confusión.
  }
}

//holaa
