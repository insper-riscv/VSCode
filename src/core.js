"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function expandHome(value, home = os.homedir()) {
  if (!value) return "";
  if (value === "~") return home;
  if (value.startsWith(`~${path.sep}`)) return path.join(home, value.slice(2));
  return path.resolve(value);
}

function isSdkDirectory(candidate, exists = fs.existsSync) {
  return Boolean(candidate) && exists(path.join(candidate, "scripts", "rv32-project"));
}

function resolveLocalSdkPath(options = {}) {
  const home = options.home || os.homedir();
  const exists = options.exists || fs.existsSync;
  const candidates = [
    expandHome(options.configured || "", home),
    expandHome(options.environment || "", home),
    path.join(home, ".local", "share", "rv32-sdk")
  ].filter(Boolean);

  return candidates.find((candidate) => isSdkDirectory(candidate, exists));
}

function directoryIsEmpty(directory) {
  return !fs.existsSync(directory) || fs.readdirSync(directory).length === 0;
}

function copyTree(source, destination, options = {}) {
  const overwrite = Boolean(options.overwrite);
  const copied = [];
  const skipped = [];

  function copy(currentSource, currentDestination) {
    const stat = fs.statSync(currentSource);
    if (stat.isDirectory()) {
      fs.mkdirSync(currentDestination, { recursive: true });
      for (const entry of fs.readdirSync(currentSource)) {
        copy(path.join(currentSource, entry), path.join(currentDestination, entry));
      }
      return;
    }

    if (!overwrite && fs.existsSync(currentDestination)) {
      skipped.push(currentDestination);
      return;
    }
    fs.mkdirSync(path.dirname(currentDestination), { recursive: true });
    fs.copyFileSync(currentSource, currentDestination);
    copied.push(currentDestination);
  }

  copy(source, destination);
  return { copied, skipped };
}

function projectDirectory(resource, workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  let directory = resource ? path.dirname(path.resolve(resource)) : root;
  const relative = path.relative(root, directory);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    directory = root;
  }
  while (true) {
    if (fs.existsSync(path.join(directory, "rv32.toml"))) return directory;
    if (directory === root) return undefined;
    directory = path.dirname(directory);
  }
}

function validProjectName(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value || "");
}

const PLATFORM_CHOICES = [
  { label: "Internal memory", id: "internal-mem", description: "Default simulation platform" },
  { label: "Modular SoC", id: "modular", description: "Simulation with GPIO, timers and interrupt controllers" },
  { label: "DE0-CV (legacy)", id: "de0-cv", description: "Existing FPGA platform" },
  ...["de0-cv", "de0-nano", "de0-nano-soc", "de10-lite", "de10-nano", "de2-115", "mkr-vidor-4000"].map(
    (board) => ({ label: board.toUpperCase(), id: `periph-${board}`, description: "Physical peripheral board; device simulation unavailable" })
  )
];

function configurePlatform(manifest, platform) {
  if (!PLATFORM_CHOICES.some((choice) => choice.id === platform)) {
    throw new Error(`Unknown RV32 platform: ${platform}`);
  }
  const lines = manifest.split("\n");
  const start = lines.findIndex((line) => line.trim() === "[project]");
  if (start < 0) throw new Error("Missing [project] table");
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  const existing = lines.findIndex((line, index) =>
    index > start && index < end && /^\s*platform\s*=/.test(line));
  const value = `platform = "${platform}"`;
  if (existing >= 0) lines[existing] = value;
  else lines.splice(start + 1, 0, value);
  return lines.join("\n");
}

module.exports = {
  PLATFORM_CHOICES,
  configurePlatform,
  copyTree,
  directoryIsEmpty,
  expandHome,
  isSdkDirectory,
  projectDirectory,
  resolveLocalSdkPath,
  validProjectName
};
