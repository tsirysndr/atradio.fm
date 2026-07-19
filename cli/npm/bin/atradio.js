#!/usr/bin/env node
"use strict";

// Thin launcher for the `atradio` CLI.
//
// The actual binary is a prebuilt Rust executable shipped in a per-platform
// optional dependency (@atradio/cli-<platform>-<arch>). npm installs only the
// package whose `os`/`cpu` match the host, so at runtime we just resolve that
// package's binary and hand off to it — no download, no postinstall.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");

// Node platform+arch -> the optional dependency that carries the binary.
const PACKAGES = {
  "darwin arm64": "@atradio/cli-darwin-arm64",
  "darwin x64": "@atradio/cli-darwin-x64",
  "linux arm64": "@atradio/cli-linux-arm64",
  "linux x64": "@atradio/cli-linux-x64",
};

// The Linux packages are built against glibc (…-unknown-linux-gnu). Detect a
// musl host up front so we can fail with a clear message instead of a cryptic
// dynamic-linker error.
function isLinuxMusl() {
  if (process.platform !== "linux") return false;
  try {
    const report =
      typeof process.report?.getReport === "function"
        ? process.report.getReport()
        : null;
    // glibc runtimes expose this field; musl does not.
    return !(report && report.header && report.header.glibcVersionRuntime);
  } catch {
    return false;
  }
}

function resolveBinary() {
  const key = `${process.platform} ${process.arch}`;

  if (process.platform === "linux" && isLinuxMusl()) {
    throw new Error(
      `atradio: prebuilt binaries are built against glibc and won't run on a ` +
        `musl-based system (e.g. Alpine).\n` +
        `Install glibc compatibility, use a glibc-based image, or build from ` +
        `source: https://github.com/tsirysndr/atradio.fm`,
    );
  }

  const pkg = PACKAGES[key];
  if (!pkg) {
    throw new Error(
      `atradio: no prebuilt binary for your platform (${key}).\n` +
        `Supported: ${Object.keys(PACKAGES).join(", ")}.\n` +
        `Build from source: https://github.com/tsirysndr/atradio.fm`,
    );
  }

  try {
    return require.resolve(`${pkg}/bin/atradio`);
  } catch (err) {
    throw new Error(
      `atradio: the platform package "${pkg}" is not installed.\n` +
        `This usually means npm skipped optional dependencies. Reinstall ` +
        `without --no-optional / --ignore-optional:\n` +
        `    npm install -g @atradio/cli\n` +
        `(original error: ${err && err.message})`,
    );
  }
}

let binary;
try {
  binary = resolveBinary();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// Belt-and-suspenders: make sure the binary is executable. npm preserves the
// mode from the published tarball, but some installers (or restrictive umasks)
// can drop the bit. Ignore failures — a read-only install may still be runnable.
try {
  fs.chmodSync(binary, 0o755);
} catch {}

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });

if (result.error) {
  console.error(`atradio: failed to launch binary: ${result.error.message}`);
  process.exit(1);
}

// Re-raise a terminating signal so callers (and Ctrl-C) behave as if they'd run
// the binary directly; otherwise propagate the exit code.
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(result.status === null ? 1 : result.status);
}
