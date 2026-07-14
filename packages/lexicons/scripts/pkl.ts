import chalk from "chalk";
import { readdirSync, statSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { $ } from "zx";
import { consola } from "consola";

function getPklFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...getPklFilesRecursive(fullPath));
      continue;
    }
    if (entry.endsWith(".pkl")) files.push(fullPath);
  }
  return files;
}

const files = getPklFilesRecursive(join("pkl", "defs"));

await Promise.all(
  files.map(async (fullPath) => {
    const outPath = fullPath
      .replace(/\.pkl$/, ".json")
      .replace(/pkl[\\/]defs/g, "lexicons");
    mkdirSync(dirname(outPath), { recursive: true });
    consola.info(`pkl eval ${chalk.cyan(fullPath)} -> ${chalk.green(outPath)}`);
    await $`pkl eval -f json ${fullPath} > ${outPath}`;
  }),
);

consola.success("Lexicons generated.");
