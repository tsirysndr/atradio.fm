#!/usr/bin/env node
// Stamp a release version across the npm packages under cli/npm:
//   - the main package (@atradio/cli) `version`
//   - every platform package `version`
//   - the main package's optionalDependencies, pinned to the exact version
//
// Usage: node scripts/stamp-version.mjs <version>   (leading "v" is stripped)

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raw = process.argv[2];
if (!raw) {
  console.error("usage: node scripts/stamp-version.mjs <version>");
  process.exit(1);
}
const version = raw.replace(/^v/, "");

const npmDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const platformsDir = join(npmDir, "platforms");

function patch(pkgDir, mutate) {
  const file = join(pkgDir, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  mutate(pkg);
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  return pkg.name;
}

// Platform packages first, so we know their names for the optionalDependencies.
const platformNames = [];
for (const entry of readdirSync(platformsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(platformsDir, entry.name);
  if (!existsSync(join(dir, "package.json"))) continue;
  const name = patch(dir, (pkg) => {
    pkg.version = version;
  });
  platformNames.push(name);
}

// Main package: version + pin every optional dependency to this version.
patch(npmDir, (pkg) => {
  pkg.version = version;
  pkg.optionalDependencies = Object.fromEntries(
    platformNames.sort().map((name) => [name, version]),
  );
});

console.log(
  `Stamped ${version} across @atradio/cli and ${platformNames.length} platform packages.`,
);
