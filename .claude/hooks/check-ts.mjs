// PostToolUse hook (Edit|Write): format the edited TypeScript file with Prettier,
// then typecheck the project. Type errors are fed back to Claude (exit 2), capped
// so a broken build doesn't flood the context. Silently does nothing until
// prettier/typescript are installed in the project.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const MAX_LINES = 30;

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const file = input?.tool_input?.file_path ?? input?.tool_response?.filePath;
if (!file || !/\.(ts|tsx|mts|cts)$/.test(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (script, args) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });

const prettier = join(root, "node_modules", "prettier", "bin", "prettier.cjs");
if (existsSync(prettier))
  run(prettier, ["--write", "--log-level", "warn", file]);

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc) || !existsSync(join(root, "tsconfig.json")))
  process.exit(0);

const result = run(tsc, ["--noEmit", "--pretty", "false"]);
if (result.status === 0) process.exit(0);

const lines = `${result.stdout}${result.stderr}`.trim().split(/\r?\n/);
const shown = lines.slice(0, MAX_LINES);
if (lines.length > MAX_LINES)
  shown.push(
    `... ${lines.length - MAX_LINES} more lines (run npx tsc --noEmit)`,
  );
process.stderr.write(
  `TypeScript errors after editing ${file}:\n${shown.join("\n")}\n`,
);
process.exit(2);
