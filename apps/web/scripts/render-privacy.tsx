import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyPage } from "../src/routes/PrivacyPage";

// Serve the policy directly, without relying on an SPA fallback or JavaScript.
// Reuse the route component so the public document and in-app policy stay in sync.
const shell = await readFile("dist/index.html", "utf8");
const styles = shell.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g)?.join("\n") ?? "";
if (!styles) throw new Error("Built stylesheet not found for privacy page");
const policy = renderToStaticMarkup(<PrivacyPage />);
const html = `<!doctype html>
<html lang="en" class="dark" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Privacy Policy · atradio.fm</title>
<meta name="description" content="How atradio.fm handles account data, public activity, listening history, storage, and privacy or deletion requests." />
<link rel="canonical" href="https://atradio.fm/privacy" />
<link rel="icon" href="/favicon-64.png" />
${styles}
</head>
<body>
<div class="min-h-screen bg-synth-bg text-foreground">
<header class="border-b border-white/10 px-6 py-5"><a href="/" class="font-display text-xl font-bold text-foreground">atradio<span class="text-synth-cyan">.fm</span></a></header>
<main class="mx-auto max-w-7xl px-4 pt-8 sm:px-6">${policy}</main>
<footer class="border-t border-white/10 px-6 py-6 text-center text-sm"><a href="/" class="text-synth-cyan">Back to atradio.fm</a></footer>
</div>
</body>
</html>`;
await mkdir("dist/privacy", { recursive: true });
await writeFile("dist/privacy/index.html", html);
console.log("Generated dist/privacy/index.html");
