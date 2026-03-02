import { createWriteStream } from "node:fs";
import { access, mkdir, rm, stat } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PORTABLE_GIT_URL =
  "https://github.com/git-for-windows/git/releases/download/v2.49.0.windows.1/PortableGit-2.49.0-64-bit.7z.exe";

function fileExists(target) {
  return access(target)
    .then(() => true)
    .catch(() => false);
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        download(res.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed download (${res.statusCode}): ${url}`));
        return;
      }

      const out = createWriteStream(destination);
      res.pipe(out);
      out.on("finish", () => {
        out.close();
        resolve();
      });
      out.on("error", reject);
    });

    req.on("error", reject);
  });
}

async function main() {
  if (process.platform !== "win32") {
    console.log("[portable-git] skip: only required on Windows build hosts.");
    return;
  }

  const projectRoot = process.cwd();
  const outputDir = path.join(projectRoot, "vendor", "portable-git", "windows");
  const gitExe = path.join(outputDir, "cmd", "git.exe");

  if (await fileExists(gitExe)) {
    console.log(`[portable-git] already prepared at ${gitExe}`);
    return;
  }

  const url = process.env.PORTABLE_GIT_URL || DEFAULT_PORTABLE_GIT_URL;
  const archivePath = path.join(tmpdir(), `portable-git-${Date.now()}.7z.exe`);

  await mkdir(outputDir, { recursive: true });

  console.log(`[portable-git] downloading ${url}`);
  await download(url, archivePath);

  console.log("[portable-git] extracting archive");
  await execFileAsync(archivePath, [`-o${outputDir}`, "-y"], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 10,
  });

  const extracted = await fileExists(gitExe);
  if (!extracted) {
    throw new Error("PortableGit extracted, but cmd/git.exe was not found.");
  }

  const st = await stat(gitExe);
  if (!st.isFile()) {
    throw new Error("PortableGit extraction result is invalid.");
  }

  await rm(archivePath, { force: true });
  console.log(`[portable-git] ready: ${gitExe}`);
}

main().catch((err) => {
  console.error("[portable-git] failed:", err);
  process.exitCode = 1;
});
