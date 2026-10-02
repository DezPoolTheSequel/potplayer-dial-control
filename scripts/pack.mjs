// Builds a self-contained .streamDeckPlugin installer in dist/.
//
// nut-js and koffi are kept external by rollup (they load native addons from their own folders),
// so a plain `streamdeck pack` would ship without them and crash on any other PC. This script
// copies the plugin into dist/stage, installs just those runtime packages inside it (Windows
// binaries, since it runs on Windows), and packs that.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const UUID = "com.desmond-harris.potplayer-dial-control";
const SRC = `${UUID}.sdPlugin`;
const STAGE_ROOT = path.join("dist", "stage");
const STAGE = path.join(STAGE_ROOT, SRC);
const run = (cmd, cwd = ".") => {
	console.log(`> ${cmd}`);
	execSync(cmd, { cwd, stdio: "inherit", shell: true });
};

if (process.platform !== "win32") {
	console.error("Run this on Windows so the Windows native binaries get bundled.");
	process.exit(1);
}

// 1. Fresh production build
run("npm run build");

// 2. Stage a clean copy (no logs, no source maps)
fs.rmSync(STAGE_ROOT, { recursive: true, force: true });
fs.cpSync(SRC, STAGE, {
	recursive: true,
	filter: (p) => {
		const rel = path.relative(SRC, p).replace(/\\/g, "/");
		return !(rel === "logs" || rel.startsWith("logs/") || rel.endsWith("/logs") || rel.includes("/logs/") || rel.endsWith(".map") || rel.endsWith(".log"));
	},
});

// 3. Install only the runtime packages rollup leaves external
const root = JSON.parse(fs.readFileSync("package.json", "utf8"));
const runtime = ["@nut-tree-fork/nut-js", "koffi"];
const deps = Object.fromEntries(runtime.map((n) => [n, root.dependencies[n]]));
fs.writeFileSync(
	path.join(STAGE, "package.json"),
	JSON.stringify({ name: "potplayer-dial-control-runtime", private: true, dependencies: deps, allowScripts: root.allowScripts ?? {} }, null, 2),
);
run("npm install --omit=dev --no-audit --no-fund --no-package-lock", STAGE);

// 4. Pack
run(`npx streamdeck pack "${STAGE}" --output dist --force`);
console.log(`\nDone: dist\\${UUID}.streamDeckPlugin`);
