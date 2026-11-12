// Bundles the publishable Node packages (CLI and MCP server) to plain JavaScript in dist/.
// Their sources are TypeScript with extensionless imports, which `node` cannot run, and Node refuses
// to strip types inside node_modules, so `npx @buffersol/hotrail` needs this output. esbuild is
// already in the toolchain (tsx and Vite use it). @buffersol/hotrail-core is inlined; real npm
// dependencies (the MCP SDK, zod) stay external.
import { build } from "esbuild";
import { chmodSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["cli", "mcp"];

for (const name of targets) {
  const dir = join(root, "packages", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const outfile = join(dir, "dist", "bin.js");
  await build({
    entryPoints: [join(dir, "src", "bin.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    external: Object.keys(pkg.dependencies ?? {}).filter((d) => d !== "@buffersol/hotrail-core"),
    legalComments: "none",
    logLevel: "warning",
  });
  chmodSync(outfile, 0o755);
  console.log(`built ${pkg.name} -> packages/${name}/dist/bin.js`);
}
