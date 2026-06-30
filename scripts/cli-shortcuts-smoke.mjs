import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const cli = path.join(root, "dist", "cli", "index.js");
const tempDir = mkdtempSync(path.join(tmpdir(), "jimeng-cli-smoke-"));
const env = {
  ...process.env,
  JIMENG_CONFIG_FILE: path.join(tempDir, "config.json"),
};

function run(args) {
  return execFileSync("node", [cli, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  const setResult = JSON.parse(run(["set", "region", "jp", "--json"]));
  assert.equal(setResult.command, "config.set");
  assert.equal(setResult.data.region, "jp");

  const getResult = JSON.parse(run(["get", "region", "--json"]));
  assert.equal(getResult.command, "config.get");
  assert.equal(getResult.data.region, "jp");

  const setRatioResult = JSON.parse(run(["set", "ratio", "16:9", "--json"]));
  assert.equal(setRatioResult.command, "config.set");
  assert.equal(setRatioResult.data.ratio, "16:9");

  const getRatioResult = JSON.parse(run(["get", "ratio", "--json"]));
  assert.equal(getRatioResult.command, "config.get");
  assert.equal(getRatioResult.data.ratio, "16:9");

  const configResult = JSON.parse(run(["config", "list", "--json"]));
  assert.equal(configResult.command, "config.list");
  assert.equal(configResult.data.region, "jp");
  assert.equal(configResult.data.ratio, "16:9");

  const help = run(["image", "generate", "--help"]);
  assert.match(help, /-p, --prompt <text>/);
  assert.match(help, /-o, --output <path>/);
  assert.doesNotMatch(help, /--output-dir/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
