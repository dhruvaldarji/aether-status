import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixtureDirectory = join(repoRoot, "worker/test/fixtures");

async function runVerifier(configFixture) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "aet385-verify-"));
  const temporaryRoot = join(temporaryDirectory, "checkout");

  try {
    await mkdir(join(temporaryRoot, "scripts"), { recursive: true });
    await mkdir(join(temporaryRoot, ".github/workflows"), { recursive: true });
    await mkdir(join(temporaryRoot, "worker"), { recursive: true });
    await copyFile(join(repoRoot, "scripts/verify.sh"), join(temporaryRoot, "scripts/verify.sh"));
    await copyFile(join(repoRoot, ".upptimerc.yml"), join(temporaryRoot, ".upptimerc.yml"));
    await copyFile(
      join(repoRoot, ".github/workflows/uptime.yml"),
      join(temporaryRoot, ".github/workflows/uptime.yml"),
    );
    if (configFixture) {
      await writeFile(
        join(temporaryRoot, "worker/wrangler.json"),
        await readFile(configFixture),
      );
    }

    return spawnSync("bash", [join(temporaryRoot, "scripts/verify.sh")], {
      cwd: temporaryRoot,
      encoding: "utf8",
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("accepts the matching Worker cron without editing the checkout", async () => {
  const result = await runVerifier(join(repoRoot, "worker/wrangler.json"));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: Worker cron matches \.upptimerc\.yml/);
});

test("rejects missing and invalid Worker Wrangler configs", async () => {
  const missing = await runVerifier();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Worker Wrangler config is missing/);

  const invalid = await runVerifier(join(fixtureDirectory, "wrangler-invalid.json"));
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Could not parse Worker Wrangler config/);
});

test("rejects missing triggers, empty or multiple crons, and cron mismatches", async () => {
  const cases = [
    ["wrangler-missing-triggers.json", /must contain a triggers mapping/],
    ["wrangler-empty-crons.json", /cron entry must be a nonempty string/],
    ["wrangler-multiple-crons.json", /must contain exactly one cron entry/],
    ["wrangler-mismatched-cron.json", /Worker cron mismatch/],
  ];

  for (const [fixture, expectedError] of cases) {
    const result = await runVerifier(join(fixtureDirectory, fixture));
    assert.equal(result.status, 1, fixture);
    assert.match(result.stderr, expectedError, fixture);
  }
});
