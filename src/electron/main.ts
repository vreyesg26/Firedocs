// electron/main.ts
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { simpleGit } from "simple-git";
import type { SimpleGit, StatusResult } from "simple-git";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev =
  !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === "development";
const APP_NAME = "Firedocs";

function appLogsDir() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "logs");
  }
  return path.join(process.cwd(), "logs");
}

function appLogPath() {
  return path.join(appLogsDir(), "main.log");
}

async function appendAppLog(level: "INFO" | "WARN" | "ERROR", message: string) {
  try {
    await fsp.mkdir(appLogsDir(), { recursive: true });
    const timestamp = new Date().toISOString();
    await fsp.appendFile(appLogPath(), `[${timestamp}] [${level}] ${message}\n`, "utf8");
  } catch (error) {
    console.error("[LOG] no se pudo escribir log", error);
  }
}

function buildWindowTitle(section?: string) {
  const suffix = (section ?? "").trim();
  return suffix ? `${APP_NAME} | ${suffix}` : APP_NAME;
}

function resolveGitBinary() {
  if (process.platform !== "win32") return "git";

  const candidates = [
    process.env.FIREDOCS_GIT_PATH,
    app.isPackaged
      ? path.join(process.resourcesPath, "git", "windows", "cmd", "git.exe")
      : path.join(process.cwd(), "vendor", "portable-git", "windows", "cmd", "git.exe"),
    app.isPackaged
      ? path.join(process.resourcesPath, "git", "windows", "bin", "git.exe")
      : path.join(process.cwd(), "vendor", "portable-git", "windows", "bin", "git.exe"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return "git";
}

const GIT_BINARY = resolveGitBinary();

/** Resuelve y loguea la ruta del preload compilado */
function getPreloadPath() {
  const p = path.join(__dirname, "preload.js");
  return p;
}

/** Busca un index.html válido para producción (ajústalo si tu build es distinto) */
function getProdIndexFile() {
  const candidates = [
    path.join(process.cwd(), "dist-react", "index.html"),
    path.join(process.cwd(), "dist", "index.html"),
    path.join(app.getAppPath(), "dist-react", "index.html"),
    path.join(__dirname, "../dist-react", "index.html"),
    path.join(__dirname, "../dist", "index.html"),
    path.join(__dirname, "../renderer", "index.html"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  console.error("[Electron] No encontré index.html en:", candidates);
  return null;
}

// -------------------- Helpers varios que ya tenías (opcionales) --------------------
function extToTipo(ext: string) {
  const e = ext.toLowerCase();
  if (e === "jar") return "JAR";
  if (e === "sql") return "Script SQL";
  if (e === "sp" || e === "spsql") return "Stored Procedure";
  if (e === "dtsx") return "SSIS Package";
  if (e === "pks" || e === "pkb" || e === "pkg") return "Oracle Package";
  if (e === "tps") return "Oracle Type";
  if (e === "xqy" || e === "xquery") return "XQuery";
  if (e === "wsdl") return "WSDL";
  if (e === "xsd") return "XSD";
  if (e === "yaml" || e === "yml") return "YAML";
  if (e === "json") return "JSON";
  if (e === "dll") return "DLL";
  if (e === "war" || e === "ear") return e.toUpperCase();
  if (e === "xml" || e === "js" || e === "ts") return e.toUpperCase();
  return e.toUpperCase();
}

function mapStatus(
  code: string
): "Nuevo" | "Modificado" | "Renombrado" | "Eliminado" | "Desconocido" {
  if (code.includes("A")) return "Nuevo";
  if (code.includes("M")) return "Modificado";
  if (code.includes("R")) return "Renombrado";
  if (code.includes("D")) return "Eliminado";
  return "Desconocido";
}

type StoredTemplateFile = {
  version: 1;
  name: string;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
  docxBase64: string;
};

type StoredDraftFile = {
  version: 1;
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
    servicesProducts?: unknown;
    affectedAreas?: unknown;
    repositoryNames?: unknown;
    communicationMatrix?: unknown;
    installationTables?: unknown;
    reversionTables?: unknown;
    backupFixTables?: unknown;
    installationFixTables?: unknown;
    reversionFixTables?: unknown;
    templateBytesBase64: string | null;
  };
};

function buildTemplateId() {
  const short = randomUUID().split("-")[0];
  return `tpl-${Date.now()}-${short}`;
}

function templatesDir() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "templates");
  }
  return path.join(process.cwd(), "templates");
}

async function ensureTemplatesDir() {
  await fsp.mkdir(templatesDir(), { recursive: true });
}

function templatePreviewsDir() {
  return path.join(templatesDir(), "previews");
}

async function ensureTemplatePreviewsDir() {
  await fsp.mkdir(templatePreviewsDir(), { recursive: true });
}

function safeTemplateFilePath(id: string) {
  const base = path.basename(id);
  if (!base || base !== id) return null;
  return path.join(templatesDir(), base);
}

function safeTemplatePreviewPath(id: string) {
  const base = path.basename(id, path.extname(id));
  if (!base) return null;
  return path.join(templatePreviewsDir(), `${base}.pdf`);
}

async function readStoredTemplate(filePath: string): Promise<StoredTemplateFile | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoredTemplateFile;
    if (!parsed?.docxBase64 || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

function resolveLibreOfficeBinary() {
  const envCandidate = process.env.FIREDOCS_LIBREOFFICE_PATH?.trim();
  if (envCandidate && existsSync(envCandidate)) return envCandidate;

  const candidatesByPlatform =
    process.platform === "win32"
      ? [
          path.join(
            process.env["ProgramFiles"] ?? "C:\\Program Files",
            "LibreOffice",
            "program",
            "soffice.exe",
          ),
          path.join(
            process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
            "LibreOffice",
            "program",
            "soffice.exe",
          ),
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/LibreOffice.app/Contents/MacOS/soffice",
          ]
        : [
            "/usr/bin/soffice",
            "/snap/bin/libreoffice",
          ];

  for (const candidate of candidatesByPlatform) {
    if (existsSync(candidate)) return candidate;
  }

  return "soffice";
}

const LIBREOFFICE_BINARY = resolveLibreOfficeBinary();

async function runLibreOfficeConvertToPdf(
  sourceDocxPath: string,
  outputDir: string,
) {
  const userProfileDir = path.join(outputDir, "lo-profile");
  await fsp.mkdir(userProfileDir, { recursive: true });

  const args = [
    "--headless",
    `-env:UserInstallation=${pathToFileURL(userProfileDir).toString()}`,
    "--convert-to",
    "pdf:writer_pdf_Export",
    "--outdir",
    outputDir,
    sourceDocxPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(LIBREOFFICE_BINARY, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `No se pudo ejecutar LibreOffice (${LIBREOFFICE_BINARY}). ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() ||
            `LibreOffice terminó con código ${code ?? "desconocido"}.`,
        ),
      );
    });
  });
}

async function generatePdfFromDocxBytes(docxBytes: Uint8Array) {
  const docxBuffer = Buffer.from(docxBytes);
  const documentHash = createHash("sha1").update(docxBuffer).digest("hex");
  const workingDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), `firedocs-manual-preview-${documentHash.slice(0, 8)}-`),
  );

  try {
    const inputDocxPath = path.join(workingDir, `${documentHash}.docx`);
    const outputPdfPath = path.join(workingDir, `${documentHash}.pdf`);
    await fsp.writeFile(inputDocxPath, docxBuffer);
    await runLibreOfficeConvertToPdf(inputDocxPath, workingDir);

    if (!existsSync(outputPdfPath)) {
      throw new Error("LibreOffice no generó el PDF esperado.");
    }

    const pdf = await fsp.readFile(outputPdfPath);
    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    await fsp.rm(workingDir, { recursive: true, force: true });
  }
}

async function generateTemplatePreviewPdf(templateId: string) {
  await ensureTemplatesDir();
  await ensureTemplatePreviewsDir();

  const templatePath = safeTemplateFilePath(templateId);
  const previewPath = safeTemplatePreviewPath(templateId);
  if (!templatePath || !previewPath || !existsSync(templatePath)) return null;

  const templateStat = await fsp.stat(templatePath);
  if (existsSync(previewPath)) {
    const previewStat = await fsp.stat(previewPath);
    if (previewStat.mtimeMs >= templateStat.mtimeMs) {
      const pdf = await fsp.readFile(previewPath);
      return {
        id: templateId,
        pdfBytes: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength),
        fromCache: true,
      };
    }
  }

  const stored = await readStoredTemplate(templatePath);
  if (!stored) return null;

  const docxBytes = Buffer.from(stored.docxBase64, "base64");
  const templateHash = createHash("sha1").update(docxBytes).digest("hex");
  const workingDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), `firedocs-preview-${templateHash.slice(0, 8)}-`),
  );

  try {
    const inputDocxPath = path.join(workingDir, `${templateHash}.docx`);
    const outputPdfPath = path.join(workingDir, `${templateHash}.pdf`);
    await fsp.writeFile(inputDocxPath, docxBytes);
    await runLibreOfficeConvertToPdf(inputDocxPath, workingDir);

    if (!existsSync(outputPdfPath)) {
      throw new Error("LibreOffice no generó el PDF esperado.");
    }

    await fsp.copyFile(outputPdfPath, previewPath);
    const pdf = await fsp.readFile(previewPath);
    return {
      id: templateId,
      pdfBytes: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength),
      fromCache: false,
    };
  } finally {
    await fsp.rm(workingDir, { recursive: true, force: true });
  }
}

function buildDraftId() {
  const short = randomUUID().split("-")[0];
  return `draft-${Date.now()}-${short}.fdd`;
}

function draftsDir() {
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), "drafts");
  }
  return path.join(process.cwd(), "drafts");
}

async function ensureDraftsDir() {
  await fsp.mkdir(draftsDir(), { recursive: true });
}

function safeDraftFilePath(id: string) {
  const base = path.basename(id);
  if (!base || base !== id) return null;
  return path.join(draftsDir(), base);
}

function normalizeDraftName(name: string) {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function readStoredDraft(filePath: string): Promise<StoredDraftFile | null> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as StoredDraftFile;
    if (!parsed?.name || !parsed?.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

// -------------------- Ventana --------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 900,
    title: buildWindowTitle(),
    webPreferences: {
      preload: getPreloadPath(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5123";
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexFile = getProdIndexFile();
    if (indexFile) {
      win.loadFile(indexFile);
    } else {
      win.loadURL(
        "data:text/plain,No se encontró el index.html del renderer. Ejecuta 'vite build'."
      );
    }
  }
}

function registerAppIpcHandlers() {
  ipcMain.removeHandler("app:set-title");
  ipcMain.removeHandler("app:get-log-path");
  ipcMain.removeHandler("app:get-meta");
  ipcMain.removeHandler("app:open-external");

  ipcMain.handle("app:set-title", (event, section?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    win.setTitle(buildWindowTitle(section));
    return true;
  });

  ipcMain.handle("app:get-log-path", () => appLogPath());
  ipcMain.handle("app:get-meta", () => ({
    appName: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    gitBinary: GIT_BINARY,
    logPath: appLogPath(),
    buildCommit:
      process.env.BUILD_COMMIT?.trim() ||
      process.env.GITHUB_SHA?.slice(0, 7) ||
      "",
    buildDate: process.env.BUILD_DATE?.trim() || "",
  }));

  ipcMain.handle("app:open-external", async (_event, url: string) => {
    if (typeof url !== "string" || !url.trim()) return false;
    await shell.openExternal(url);
    return true;
  });
}

// -------------------- Descubrimiento & Scan de repos (AUTOMÁTICO) --------------------
let CACHED_ROOTS: string[] = [];
let CACHED_REPOS: string[] = [];
let WATCHED_REPOS = new Set<string>();
let WATCH_INTERVAL: NodeJS.Timeout | null = null;
let WATCH_IN_FLIGHT = false;
const WATCH_REPO_SIGNATURES = new Map<string, string>();

function repoSignature(repo: RepoStatus) {
  return JSON.stringify({
    branch: repo.branch ?? "",
    ahead: repo.ahead ?? 0,
    behind: repo.behind ?? 0,
    changes: repo.changes.map((ch) => [
      ch.path,
      ch.kind,
      ch.index,
      ch.worktree,
      Boolean(ch.conflicted),
      ch.renameFrom ?? "",
      ch.lastModifiedAt ?? "",
    ]),
  });
}

function sendGitWatchUpdate(statuses: RepoStatus[]) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("git:watch-update", statuses);
  }
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".gradle",
  ".idea",
  ".vscode",
  "build",
  "dist",
  "out",
  ".next",
  ".cache",
  ".turbo",
]);

async function isGitRepo(dir: string) {
  try {
    const st = await fsp.stat(path.join(dir, ".git"));
    if (st.isDirectory()) return true; // repo normal
    if (st.isFile()) {
      const txt = await fsp.readFile(path.join(dir, ".git"), "utf8");
      if (txt.startsWith("gitdir:")) return true; // worktree/submódulo
    }
  } catch {}
  return false;
}

async function discoverGitRepos(roots: string[], maxDepth = 12) {
  const found = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = roots.map((r) => ({
    dir: r,
    depth: 0,
  }));

  while (queue.length) {
    const { dir, depth } = queue.shift()!;
    if (await isGitRepo(dir)) {
      found.add(dir);
      continue; // no profundizar dentro de un repo para evitar costo
    }
    if (depth >= maxDepth) continue;

    let names: string[] = [];
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }

    await Promise.all(
      names.map(async (name) => {
        if (IGNORE_DIRS.has(name)) return;
        const full = path.join(dir, name);
        try {
          const st = await fsp.stat(full);
          if (st.isDirectory()) queue.push({ dir: full, depth: depth + 1 });
        } catch {}
      })
    );
  }

  return Array.from(found);
}

type RepoChange = {
  path: string;
  worktree: string;
  index: string;
  renameFrom?: string;
  conflicted?: boolean;
  ext?: string;
  lastModifiedAt?: string;
  kind:
    | "modified"
    | "added"
    | "deleted"
    | "untracked"
    | "renamed"
    | "copied"
    | "unknown";
};

type RepoStatus = {
  repoPath: string;
  repoName: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  changes: RepoChange[];
};

type GitScanCommitFailure = {
  repoPath: string;
  repoName: string;
  reason: string;
};

type GitScanCommitResult = {
  statuses: RepoStatus[];
  failures: GitScanCommitFailure[];
  logPath?: string;
};

function kindFromXY(X: string, Y: string): RepoChange["kind"] {
  if (X === "A" || Y === "A") return "added";
  if (X === "D" || Y === "D") return "deleted";
  if (X === "M" || Y === "M") return "modified";
  return "unknown";
}

function kindFromCommitStatus(statusCode: string): RepoChange["kind"] {
  const code = statusCode.trim().toUpperCase()[0];
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "M") return "modified";
  if (code === "R") return "renamed";
  if (code === "C") return "copied";
  return "unknown";
}

async function scanReposSimple(repoPaths: string[]): Promise<RepoStatus[]> {
  const out: RepoStatus[] = [];
  for (const repoPath of repoPaths) {
    try {
      const git: SimpleGit = simpleGit({ baseDir: repoPath, binary: GIT_BINARY });
      const st: StatusResult = await git.status();
      const conflictedSet = new Set<string>(st.conflicted ?? []);
      out.push({
        repoPath,
        repoName: path.basename(repoPath),
        branch: st.current || undefined,
        ahead: st.ahead ?? 0,
        behind: st.behind ?? 0,
        changes: st.files.map((f: StatusResult["files"][number]) => ({
          path: f.path,
          worktree: f.working_dir || " ",
          index: f.index || " ",
          conflicted: conflictedSet.has(f.path),
          ext: path.extname(f.path) || undefined,
          kind: kindFromXY(f.index || " ", f.working_dir || " "),
        })),
      });
    } catch (err) {
      console.warn("[GIT] scan error en", repoPath, err);
      out.push({
        repoPath,
        repoName: path.basename(repoPath),
        branch: undefined,
        ahead: 0,
        behind: 0,
        changes: [],
      });
    }
  }
  return out;
}

async function scanReposByCommit(
  repoPaths: string[],
  commitId: string,
): Promise<GitScanCommitResult> {
  const commitRef = commitId.trim();
  if (!commitRef) {
    return {
      statuses: [],
      failures: [],
      logPath: appLogPath(),
    };
  }

  const out: RepoStatus[] = [];
  const failures: GitScanCommitFailure[] = [];
  for (const repoPath of repoPaths) {
    const repoName = path.basename(repoPath);
    try {
      const git: SimpleGit = simpleGit({ baseDir: repoPath, binary: GIT_BINARY });
      await git.revparse([`${commitRef}^{commit}`]);

      let branch: string | undefined;
      try {
        const branchRaw = await git.raw([
          "branch",
          "--all",
          "--contains",
          commitRef,
        ]);
        branch = branchRaw
          .split(/\r?\n/)
          .map((line) => line.replace(/^\*/, "").trim())
          .map((line) => line.replace(/^remotes\//, ""))
          .find(Boolean);
      } catch {
        branch = undefined;
      }

      let showRaw = await git.raw([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        "--root",
        commitRef,
      ]);

      if (!showRaw.trim()) {
        showRaw = await git.raw([
          "show",
          "--name-status",
          "--pretty=format:",
          "--no-renames",
          commitRef,
        ]);
      }

      const commitDateRaw = await git.raw([
        "show",
        "-s",
        "--format=%cI",
        commitRef,
      ]);
      const commitDate = commitDateRaw.trim() || undefined;

      const changes: RepoChange[] = [];
      for (const rawLine of showRaw.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        const [rawStatus, filePath] = line.split(/\t+/, 2);
        if (!rawStatus || !filePath) continue;

        const kind = kindFromCommitStatus(rawStatus);
        const statusLetter =
          kind === "added"
            ? "A"
            : kind === "deleted"
              ? "D"
              : kind === "modified"
                ? "M"
                : " ";

        changes.push({
          path: filePath,
          worktree: statusLetter,
          index: statusLetter,
          conflicted: false,
          ext: path.extname(filePath) || undefined,
          lastModifiedAt: commitDate,
          kind,
        });
      }

      out.push({
        repoPath,
        repoName,
        branch,
        ahead: 0,
        behind: 0,
        changes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[GIT] scan-commit error en", repoPath, commitRef, error);
      await appendAppLog(
        "WARN",
        `scan-commit repo="${repoPath}" repoName="${repoName}" commit="${commitRef}" binary="${GIT_BINARY}" error="${message.replace(/\s+/g, " ").trim()}"`
      );
      failures.push({
        repoPath,
        repoName,
        reason: `No se pudo leer el commit ${commitRef} en ${repoName}: ${message}`,
      });
    }
  }

  return {
    statuses: out,
    failures,
    logPath: appLogPath(),
  };
}

async function lastModifiedByPath(
  repoPath: string,
  filePaths: string[],
): Promise<Record<string, string>> {
  if (!repoPath || !Array.isArray(filePaths) || filePaths.length === 0) {
    return {};
  }

  const git: SimpleGit = simpleGit({ baseDir: repoPath, binary: GIT_BINARY });
  const uniquePaths = Array.from(
    new Set(
      filePaths
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const out: Record<string, string> = {};
  await Promise.all(
    uniquePaths.map(async (filePath) => {
      try {
        const raw = await git.raw(["log", "-1", "--format=%cI", "--", filePath]);
        const iso = raw.trim();
        if (iso) out[filePath] = iso;
      } catch {
        // Ignoramos archivos sin historial en git.
      }
    }),
  );

  return out;
}

async function pollWatchedRepos(forceEmit = false) {
  if (WATCH_IN_FLIGHT || WATCHED_REPOS.size === 0) return;
  WATCH_IN_FLIGHT = true;

  try {
    const repos = Array.from(WATCHED_REPOS);
    const statuses = await scanReposSimple(repos);
    let changed = forceEmit;

    for (const status of statuses) {
      const sig = repoSignature(status);
      if (WATCH_REPO_SIGNATURES.get(status.repoPath) !== sig) changed = true;
      WATCH_REPO_SIGNATURES.set(status.repoPath, sig);
    }

    if (changed) sendGitWatchUpdate(statuses);
  } catch (err) {
    console.warn("[GIT] watcher poll error", err);
  } finally {
    WATCH_IN_FLIGHT = false;
  }
}

function ensureWatchLoop() {
  if (WATCH_INTERVAL || WATCHED_REPOS.size === 0) return;
  WATCH_INTERVAL = setInterval(() => {
    void pollWatchedRepos(false);
  }, 2000);
}

function stopWatchLoopIfIdle() {
  if (WATCHED_REPOS.size > 0) return;
  if (WATCH_INTERVAL) {
    clearInterval(WATCH_INTERVAL);
    WATCH_INTERVAL = null;
  }
}

// === Handlers GIT (idempotentes) ===
function registerGitIpcHandlers() {
  // Limpia handlers previos (útil con hot reload en dev)
  ipcMain.removeHandler("git:choose-roots");
  ipcMain.removeHandler("git:discover");
  ipcMain.removeHandler("git:scan");
  ipcMain.removeHandler("git:scan-commit");
  ipcMain.removeHandler("git:last-modified");
  ipcMain.removeHandler("git:scan-discovered");
  ipcMain.removeHandler("git:watch-start");
  ipcMain.removeHandler("git:watch-stop");

  ipcMain.handle("git:choose-roots", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Selecciona carpetas raíz para descubrir repos",
      properties: ["openDirectory", "multiSelections", "dontAddToRecent"],
    });
    if (canceled) return [];
    CACHED_ROOTS = filePaths;
    return CACHED_ROOTS;
  });

  ipcMain.handle("git:discover", async (_evt, roots?: string[]) => {
    const useRoots = roots && roots.length ? roots : CACHED_ROOTS;
    if (!useRoots?.length) return [];

    CACHED_REPOS = await discoverGitRepos(useRoots, 12); // profundidad ↑
    return CACHED_REPOS;
  });

  ipcMain.handle("git:scan", async (_evt, repoPaths: string[]) => {
    const count = Array.isArray(repoPaths) ? repoPaths.length : 0;
    if (!Array.isArray(repoPaths) || count === 0) return [];
    const res = await scanReposSimple(repoPaths);
    return res;
  });

  ipcMain.handle(
    "git:scan-commit",
    async (
      _evt,
      payload: { repoPaths?: string[]; commitId?: string } | undefined,
    ) => {
      const repoPaths = payload?.repoPaths ?? [];
      const commitId = payload?.commitId ?? "";
      if (!Array.isArray(repoPaths) || repoPaths.length === 0) return [];
      if (!commitId.trim()) return [];
      return await scanReposByCommit(repoPaths, commitId);
    },
  );

  ipcMain.handle(
    "git:last-modified",
    async (
      _evt,
      payload: { repoPath?: string; filePaths?: string[] } | undefined,
    ) => {
      const repoPath = payload?.repoPath ?? "";
      const filePaths = payload?.filePaths ?? [];
      if (!repoPath || !Array.isArray(filePaths) || filePaths.length === 0) {
        return {};
      }
      return await lastModifiedByPath(repoPath, filePaths);
    },
  );

  ipcMain.handle("git:scan-discovered", async () => {
    if (!CACHED_REPOS.length) return [];
    return await scanReposSimple(CACHED_REPOS);
  });

  ipcMain.handle("git:watch-start", async (_evt, repoPaths: string[]) => {
    if (!Array.isArray(repoPaths)) return false;

    for (const repoPath of repoPaths) {
      if (!repoPath) continue;
      WATCHED_REPOS.add(repoPath);
    }

    ensureWatchLoop();
    await pollWatchedRepos(true);
    return true;
  });

  ipcMain.handle("git:watch-stop", async (_evt, repoPaths?: string[]) => {
    if (Array.isArray(repoPaths) && repoPaths.length > 0) {
      for (const repoPath of repoPaths) {
        WATCHED_REPOS.delete(repoPath);
        WATCH_REPO_SIGNATURES.delete(repoPath);
      }
    } else {
      WATCHED_REPOS = new Set<string>();
      WATCH_REPO_SIGNATURES.clear();
    }

    stopWatchLoopIfIdle();
    return true;
  });
}

// -------------------- IPCs DOCX --------------------
function registerDocxIpcHandlers() {
  ipcMain.removeHandler("select-docx");
  ipcMain.removeHandler("select-multiple-docx");
  ipcMain.removeHandler("save-docx");
  ipcMain.removeHandler("docx:preview-pdf");

  ipcMain.handle("select-docx", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: "Word", extensions: ["docx"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return null;

    const filePath = filePaths[0];
    const nodeBuf = await fsp.readFile(filePath);
    const bytes = new Uint8Array(
      nodeBuf.buffer,
      nodeBuf.byteOffset,
      nodeBuf.byteLength
    );
    return { filePath, bytes };
  });

  ipcMain.handle("select-multiple-docx", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      filters: [{ name: "Word", extensions: ["docx"] }],
      properties: ["openFile", "multiSelections"],
    });
    if (canceled || !filePaths.length) return null;

    const files = await Promise.all(
      filePaths.map(async (filePath) => {
        const nodeBuf = await fsp.readFile(filePath);
        const bytes = new Uint8Array(
          nodeBuf.buffer,
          nodeBuf.byteOffset,
          nodeBuf.byteLength,
        );
        return { filePath, bytes };
      }),
    );

    return files;
  });

  ipcMain.handle(
    "save-docx",
    async (_evt, args: { bytes: Uint8Array; defaultName?: string }) => {
      const { bytes, defaultName = "Manual-actualizado.docx" } = args ?? {};
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: "Word", extensions: ["docx"] }],
      });
      if (canceled || !filePath) return null;
      await fsp.writeFile(filePath, Buffer.from(bytes));
      return { saved: true, filePath };
    }
  );

  ipcMain.handle(
    "docx:preview-pdf",
    async (_evt, args: { bytes: Uint8Array; fileName?: string }) => {
      const { bytes, fileName } = args ?? {};
      if (!bytes) return null;

      try {
        const pdfBytes = await generatePdfFromDocxBytes(bytes);
        return {
          fileName: fileName ?? "Manual-actualizado.docx",
          bytes: pdfBytes,
          mimeType: "application/pdf",
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          fileName: fileName ?? "Manual-actualizado.docx",
          error: message.includes("soffice")
            ? "No se encontró LibreOffice instalado para generar la vista previa."
            : `No se pudo generar la vista previa PDF. ${message}`,
        };
      }
    }
  );
}

// -------------------- IPC: seleccionar repos manualmente (lo mantenemos) --------------------
function registerPickReposHandler() {
  ipcMain.removeHandler("git:pick-repos");
  ipcMain.handle("git:pick-repos", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Selecciona repositorios (carpetas con .git)",
      properties: ["openDirectory", "multiSelections", "createDirectory"],
    });
    if (canceled) return [];
    return filePaths
      .filter((p) => existsSync(path.join(p, ".git")))
      .map((p) => ({
        repoName: path.basename(p),
        repoPath: p,
      }));
  });
}

function registerTemplateIpcHandlers() {
  ipcMain.removeHandler("template:list");
  ipcMain.removeHandler("template:import-docx");
  ipcMain.removeHandler("template:read");
  ipcMain.removeHandler("template:preview-pdf");
  ipcMain.removeHandler("template:delete");

  ipcMain.handle("template:list", async () => {
    await ensureTemplatesDir();
    const dir = templatesDir();
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".fd"));

    const list = await Promise.all(
      files.map(async (fileName) => {
        const filePath = path.join(dir, fileName);
        const st = await fsp.stat(filePath);
        const stored = await readStoredTemplate(filePath);
        return {
          id: fileName,
          fileName,
          filePath,
          name: stored?.name ?? fileName.replace(/\.fd$/i, ""),
          sourceFileName: stored?.sourceFileName ?? "",
          createdAt: stored?.createdAt ?? st.birthtime.toISOString(),
          updatedAt: stored?.updatedAt ?? st.mtime.toISOString(),
          size: st.size,
        };
      })
    );

    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  });

  ipcMain.handle("template:import-docx", async () => {
    await ensureTemplatesDir();

    const pick = await dialog.showOpenDialog({
      title: "Selecciona una plantilla Word",
      filters: [{ name: "Word", extensions: ["docx"] }],
      properties: ["openFile"],
    });
    if (pick.canceled || !pick.filePaths[0]) return null;

    const sourcePath = pick.filePaths[0];
    const sourceName = path.basename(sourcePath);
    const displayName = path.basename(sourcePath, path.extname(sourcePath)) || "Plantilla";

    const docx = await fsp.readFile(sourcePath);
    const now = new Date().toISOString();
    const payload: StoredTemplateFile = {
      version: 1,
      name: displayName,
      sourceFileName: sourceName,
      createdAt: now,
      updatedAt: now,
      docxBase64: docx.toString("base64"),
    };

    const dir = templatesDir();
    let candidate = `${buildTemplateId()}.fd`;
    while (existsSync(path.join(dir, candidate))) {
      candidate = `${buildTemplateId()}.fd`;
    }

    const target = path.join(dir, candidate);
    await fsp.writeFile(target, JSON.stringify(payload, null, 2), "utf8");

    return {
      id: candidate,
      fileName: candidate,
      filePath: target,
      name: payload.name,
      sourceFileName: payload.sourceFileName,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    };
  });

  ipcMain.handle("template:read", async (_evt, id: string) => {
    if (!id) return null;
    await ensureTemplatesDir();
    const filePath = safeTemplateFilePath(id);
    if (!filePath) return null;
    if (!existsSync(filePath)) return null;

    const stored = await readStoredTemplate(filePath);
    if (!stored) return null;

    const bytes = Buffer.from(stored.docxBase64, "base64");
    return {
      id,
      name: stored.name,
      sourceFileName: stored.sourceFileName,
      bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    };
  });

  ipcMain.handle("template:preview-pdf", async (_evt, id: string) => {
    if (!id) return null;

    try {
      const preview = await generateTemplatePreviewPdf(id);
      if (!preview) return null;
      return {
        id: preview.id,
        bytes: preview.pdfBytes,
        mimeType: "application/pdf",
        fromCache: preview.fromCache,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        id,
        error: message.includes("soffice")
          ? "No se encontró LibreOffice instalado para generar la vista previa."
          : `No se pudo generar la vista previa PDF. ${message}`,
      };
    }
  });

  ipcMain.handle("template:delete", async (_evt, id: string) => {
    if (!id) return false;

    const templatePath = safeTemplateFilePath(id);
    const previewPath = safeTemplatePreviewPath(id);
    if (!templatePath) return false;

    await fsp.rm(templatePath, { force: true });
    if (previewPath) {
      await fsp.rm(previewPath, { force: true });
    }
    return true;
  });
}

function registerDraftIpcHandlers() {
  ipcMain.removeHandler("draft:list");
  ipcMain.removeHandler("draft:save");
  ipcMain.removeHandler("draft:read");
  ipcMain.removeHandler("draft:delete");

  ipcMain.handle("draft:list", async () => {
    await ensureDraftsDir();
    const dir = draftsDir();
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".fdd"));

    const list = await Promise.all(
      files.map(async (fileName) => {
        const filePath = path.join(dir, fileName);
        const st = await fsp.stat(filePath);
        const stored = await readStoredDraft(filePath);
        return {
          id: fileName,
          fileName,
          filePath,
          name: stored?.name ?? fileName.replace(/\.fdd$/i, ""),
          createdAt: stored?.createdAt ?? st.birthtime.toISOString(),
          updatedAt: stored?.updatedAt ?? st.mtime.toISOString(),
          size: st.size,
          activeStep:
            typeof stored?.state?.activeStep === "number"
              ? stored.state.activeStep
              : 0,
          visibleStepKeys: Array.isArray(stored?.state?.visibleStepKeys)
            ? stored.state.visibleStepKeys
            : undefined,
          progressState: stored?.state
            ? {
                sections: stored.state.sections,
                detailedPieces: stored.state.detailedPieces,
                detailedFixPieces: stored.state.detailedFixPieces,
                servicesProducts: stored.state.servicesProducts,
                affectedAreas: stored.state.affectedAreas,
                repositoryNames: stored.state.repositoryNames,
                communicationMatrix: stored.state.communicationMatrix,
                installationTables: stored.state.installationTables,
                reversionTables: stored.state.reversionTables,
                backupFixTables: stored.state.backupFixTables,
                installationFixTables: stored.state.installationFixTables,
                reversionFixTables: stored.state.reversionFixTables,
                visibleStepKeys: Array.isArray(stored.state.visibleStepKeys)
                  ? stored.state.visibleStepKeys
                  : undefined,
              }
            : undefined,
        };
      }),
    );

    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  });

  ipcMain.handle(
    "draft:save",
    async (
      _evt,
      payload:
        | {
            id?: string;
            name?: string;
            state?: StoredDraftFile["state"];
          }
        | undefined,
    ) => {
      await ensureDraftsDir();

      const now = new Date().toISOString();
      const requestedId = payload?.id ? path.basename(payload.id) : "";
      const id = requestedId || buildDraftId();
      const filePath = safeDraftFilePath(id);
      if (!filePath) return null;

      let createdAt = now;
      if (existsSync(filePath)) {
        const prev = await readStoredDraft(filePath);
        if (prev?.createdAt) createdAt = prev.createdAt;
      }

      const name = (payload?.name ?? "").trim();
      const state = payload?.state;
      if (!state) return null;
      if (!name || normalizeDraftName(name) === "sin titulo") {
        throw new Error("El título del borrador es requerido.");
      }

      const existingFiles = (await fsp.readdir(draftsDir())).filter((f) =>
        f.endsWith(".fdd"),
      );
      const requestedIdNorm = path.basename(id);
      const requestedNameNorm = normalizeDraftName(name);

      for (const fileName of existingFiles) {
        const candidatePath = path.join(draftsDir(), fileName);
        const stored = await readStoredDraft(candidatePath);
        if (!stored?.name) continue;
        const isSameDraft = path.basename(fileName) === requestedIdNorm;
        if (isSameDraft) continue;
        if (normalizeDraftName(stored.name) === requestedNameNorm) {
          throw new Error(
            "Ya existe otro borrador con ese nombre. Usa un título diferente.",
          );
        }
      }

      const dataToSave: StoredDraftFile = {
        version: 1,
        name,
        createdAt,
        updatedAt: now,
        state,
      };

      await fsp.writeFile(filePath, JSON.stringify(dataToSave, null, 2), "utf8");

      return {
        id,
        fileName: id,
        filePath,
        name: dataToSave.name,
        createdAt: dataToSave.createdAt,
        updatedAt: dataToSave.updatedAt,
      };
    },
  );

  ipcMain.handle("draft:read", async (_evt, id: string) => {
    if (!id) return null;
    await ensureDraftsDir();

    const filePath = safeDraftFilePath(id);
    if (!filePath || !existsSync(filePath)) return null;

    const stored = await readStoredDraft(filePath);
    if (!stored) return null;

    return {
      id,
      fileName: id,
      filePath,
      name: stored.name,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      state: stored.state,
    };
  });

  ipcMain.handle("draft:delete", async (_evt, id: string) => {
    if (!id) return false;
    await ensureDraftsDir();

    const filePath = safeDraftFilePath(id);
    if (!filePath || !existsSync(filePath)) return false;

    await fsp.unlink(filePath);
    return true;
  });
}

// -------------------- App lifecycle --------------------
// Registra handlers en carga de módulo para que estén disponibles
// incluso antes de crear la ventana (evita carreras en dev/hot reload).
registerDocxIpcHandlers();
registerPickReposHandler();
registerGitIpcHandlers();
registerTemplateIpcHandlers();
registerAppIpcHandlers();
registerDraftIpcHandlers();

app.whenReady().then(() => {
  if (process.platform === "win32") {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (WATCH_INTERVAL) {
    clearInterval(WATCH_INTERVAL);
    WATCH_INTERVAL = null;
  }
  if (process.platform !== "darwin") app.quit();
});
