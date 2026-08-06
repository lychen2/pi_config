#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repository = "rtk-ai/rtk";
const assetName = "rtk-x86_64-pc-windows-msvc.zip";
const installDir = path.join(os.homedir(), ".local", "bin");
const destination = path.join(installDir, "rtk.exe");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    shell: options.shell ?? false,
  });
  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return result;
}

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "pi-config-installer",
    },
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response;
}

async function findFile(directory, name) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
      return target;
    }
    if (entry.isDirectory()) {
      const nested = await findFile(target, name);
      if (nested) return nested;
    }
  }
  return undefined;
}

function escapePowerShellString(value) {
  return value.replaceAll("'", "''");
}

function errorOutput(result) {
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.error) return result.error.message;
  return output || `exit code ${result.status}`;
}

function extractArchive(archivePath, destinationPath) {
  const tar = spawnSync("tar.exe", ["-xf", archivePath, "-C", destinationPath], {
    encoding: "utf8",
  });
  if (!tar.error && tar.status === 0) return;

  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `[System.IO.Compression.ZipFile]::ExtractToDirectory('${escapePowerShellString(archivePath)}', '${escapePowerShellString(destinationPath)}')`,
  ].join("; ");
  const powerShell = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ], { encoding: "utf8" });
  if (!powerShell.error && powerShell.status === 0) return;

  throw new Error(
    `Could not extract ${assetName}. tar.exe: ${errorOutput(tar)}. PowerShell fallback: ${errorOutput(powerShell)}.`,
  );
}

function userPathFromRegistry() {
  const result = spawnSync("reg.exe", ["query", "HKCU\\Environment", "/v", "Path"], {
    encoding: "utf8",
  });
  if (result.status === 1) return "";
  if (result.error || result.status !== 0) {
    throw new Error(`Could not read the user PATH: ${errorOutput(result)}`);
  }

  const match = result.stdout.match(/^\s*Path\s+REG_\w+\s+(.*)$/im);
  if (!match) {
    throw new Error("Could not parse the user PATH from the registry.");
  }
  return match[1].trim();
}

function addInstallDirectoryToPath() {
  const userPath = userPathFromRegistry();
  const entries = userPath.split(";").map((entry) => entry.trim()).filter(Boolean);
  const exists = entries.some((entry) => entry.replace(/[\\/]+$/, "").toLowerCase() === installDir.toLowerCase());
  if (!exists) {
    const updatedPath = [...entries, installDir].join(";");
    run("reg.exe", [
      "add",
      "HKCU\\Environment",
      "/v",
      "Path",
      "/t",
      "REG_EXPAND_SZ",
      "/d",
      updatedPath,
      "/f",
    ]);
  }

  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "Path";
  const processEntries = (process.env[pathKey] || "").split(path.delimiter);
  if (!processEntries.some((entry) => entry.replace(/[\\/]+$/, "").toLowerCase() === installDir.toLowerCase())) {
    process.env[pathKey] = `${installDir}${path.delimiter}${process.env[pathKey] || ""}`;
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("The RTK binary installer only supports Windows.");
  }

  const requestedVersion = process.env.RTK_VERSION?.trim();
  const version = requestedVersion && !requestedVersion.startsWith("v")
    ? `v${requestedVersion}`
    : requestedVersion;
  const releaseUrl = version
    ? `https://api.github.com/repos/${repository}/releases/tags/${version}`
    : `https://api.github.com/repos/${repository}/releases/latest`;

  console.log("Resolving the RTK Windows release...");
  const release = await (await fetchResponse(releaseUrl)).json();
  const archiveAsset = release.assets?.find((asset) => asset.name === assetName);
  const checksumsAsset = release.assets?.find((asset) => asset.name === "checksums.txt");
  if (!archiveAsset || !checksumsAsset) {
    throw new Error(`RTK release ${release.tag_name || version || "latest"} is missing ${!archiveAsset ? assetName : "checksums.txt"}.`);
  }

  const tempRoot = path.join(os.tmpdir(), `pc-rtk-${randomUUID().slice(0, 8)}`);
  const archivePath = path.join(tempRoot, assetName);
  const checksumsPath = path.join(tempRoot, "checksums.txt");
  const extractPath = path.join(tempRoot, "extracted");
  await mkdir(extractPath, { recursive: true });

  try {
    console.log(`Downloading RTK ${release.tag_name}...`);
    await writeFile(archivePath, Buffer.from(await (await fetchResponse(archiveAsset.browser_download_url)).arrayBuffer()));
    await writeFile(checksumsPath, Buffer.from(await (await fetchResponse(checksumsAsset.browser_download_url)).arrayBuffer()));

    const checksumLine = (await readFile(checksumsPath, "utf8"))
      .split(/\r?\n/)
      .find((line) => new RegExp(`\\s+\\*?${assetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(line));
    if (!checksumLine) {
      throw new Error(`checksums.txt has no entry for ${assetName}.`);
    }

    const expectedHash = checksumLine.trim().split(/\s+/)[0].toLowerCase();
    const actualHash = createHash("sha256").update(await readFile(archivePath)).digest("hex");
    if (expectedHash !== actualHash) {
      throw new Error(`RTK checksum mismatch: expected ${expectedHash}, got ${actualHash}.`);
    }

    extractArchive(archivePath, extractPath);
    const binary = await findFile(extractPath, "rtk.exe");
    if (!binary) {
      throw new Error(`${assetName} does not contain rtk.exe.`);
    }

    await mkdir(installDir, { recursive: true });
    await copyFile(binary, destination);
    addInstallDirectoryToPath();
    run(destination, ["--version"]);
    console.log(`RTK installed at ${destination}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
