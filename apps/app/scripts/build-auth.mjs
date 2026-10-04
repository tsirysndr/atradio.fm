import { mkdir, writeFile } from "node:fs/promises";
const result = await Bun.build({
	entrypoints: ["./src/auth/runtime.ts"],
	target: "browser",
	minify: true,
});
if (!result.success) throw new Error(result.logs.join("\n"));
const script = (await result.outputs[0].text()).replace(
	/<\/script/gi,
	"<\\/script",
);
const html =
	'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>' +
	script +
	"</script></body></html>";
await mkdir("./src/auth/generated", { recursive: true });
await writeFile(
	"./src/auth/generated/runtime.ts",
	"export const authHtml = " + JSON.stringify(html) + ";\n",
);
