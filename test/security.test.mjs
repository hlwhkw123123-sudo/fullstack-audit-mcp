import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  validateRelativePath,
  scanWorkspace,
  redact,
  secretFindings,
} from "../dist/workspace.js";
import {
  analyze,
  traceIntegration,
  configFindings,
} from "../dist/analyzers.js";

test("rejects traversal and absolute paths", () => {
  assert.throws(() => validateRelativePath("../outside"), /escapes/);
  assert.throws(() => validateRelativePath("C:\\outside"), /relative/);
  assert.throws(() => validateRelativePath("a\0b"), /invalid/);
});

test("skips symlink escapes, oversized files, and secret files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "audit-out-"));
  const old = process.env.AUDIT_WORKSPACE_ROOT;
  try {
    await writeFile(path.join(outside, "leak.ts"), "secret");
    await symlink(outside, path.join(root, "escape"), "junction");
    await writeFile(path.join(root, ".env"), "API_KEY=very-private-value");
    await writeFile(path.join(root, "huge.ts"), "x".repeat(140_000));
    await writeFile(path.join(root, "ok.ts"), "export const safe = true;");
    process.env.AUDIT_WORKSPACE_ROOT = root;
    const scan = await scanWorkspace();
    assert.deepEqual(
      scan.files.map((file) => file.path),
      ["ok.ts"],
    );
    assert.equal(scan.skipped.symlink, 1);
    assert.equal(scan.skipped.oversized, 1);
    assert.equal(scan.skipped.sensitive, 1);
  } finally {
    if (old === undefined) delete process.env.AUDIT_WORKSPACE_ROOT;
    else process.env.AUDIT_WORKSPACE_ROOT = old;
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("redacts secret-like strings and findings never include secret value", () => {
  const secret = "not-a-real-test-secret-value-123";
  assert.equal(redact(`token=${secret}`).includes(secret), false);
  const found = secretFindings({
    path: "src/config.ts",
    text: `const token = "${secret}";`,
  });
  assert.equal(found.length, 1);
  assert.equal(JSON.stringify(found).includes(secret), false);
});

test("deduplicates a repeated static finding by stable identity", () => {
  const scan = {
    root: ".",
    projectTypes: [],
    skipped: {},
    truncated: false,
    files: [{ path: "src/x.ts", text: "eval(input);" }],
  };
  const first = analyze(scan);
  const second = analyze(scan);
  assert.equal(first.length, 1);
  assert.deepEqual(
    first.map((x) => x.id),
    second.map((x) => x.id),
  );
});

test("scanner does not modify project files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-ro-"));
  const old = process.env.AUDIT_WORKSPACE_ROOT;
  try {
    const target = path.join(root, "app.ts");
    const initial = "export const x = 1;";
    await writeFile(target, initial);
    process.env.AUDIT_WORKSPACE_ROOT = root;
    await scanWorkspace();
    assert.equal(await readFile(target, "utf8"), initial);
  } finally {
    if (old === undefined) delete process.env.AUDIT_WORKSPACE_ROOT;
    else process.env.AUDIT_WORKSPACE_ROOT = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("skips filenames containing display-control characters", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-name-"));
  const old = process.env.AUDIT_WORKSPACE_ROOT;
  try {
    await writeFile(path.join(root, "bad\u202eevil.ts"), "export const x = 1;");
    process.env.AUDIT_WORKSPACE_ROOT = root;
    const scan = await scanWorkspace();
    assert.equal(scan.files.length, 0);
    assert.equal(scan.skipped.unreadable, 1);
  } finally {
    if (old === undefined) delete process.env.AUDIT_WORKSPACE_ROOT;
    else process.env.AUDIT_WORKSPACE_ROOT = old;
    await rm(root, { recursive: true, force: true });
  }
});

test("reports simple client/server contract field mismatch", () => {
  const scan = {
    root: ".",
    projectTypes: [],
    skipped: {},
    truncated: false,
    files: [
      {
        path: "web/api.ts",
        text: 'fetch("/api/users", { method: "POST", body: JSON.stringify({ userId: input.userId }) });',
      },
      {
        path: "api/routes.ts",
        text: "app.post('/api/users', (req, res) => use(req.body.id));",
      },
    ],
  };
  const trace = traceIntegration(scan);
  assert.equal(trace.mismatches.length, 1);
  assert.deepEqual(trace.mismatches[0].clientFields, ["userId"]);
  assert.deepEqual(trace.mismatches[0].serverFields, ["id"]);
});

test("integration trace removes query secrets from endpoint references", () => {
  const scan = {
    root: ".",
    projectTypes: [],
    skipped: {},
    truncated: false,
    files: [
      {
        path: "web/api.ts",
        text: 'fetch("https://user:pass@example.invalid/api?token=not-a-real-test-value-12345");',
      },
    ],
  };
  const target = traceIntegration(scan).clients[0].target;
  assert.equal(target, "https://example.invalid/api");
  assert.doesNotMatch(target, /pass|token|ghp_/i);
});

test("malformed package configuration yields a finding without throwing", () => {
  const scan = {
    root: ".",
    projectTypes: [],
    skipped: {},
    truncated: false,
    files: [{ path: "package.json", text: "{ bad json" }],
  };
  assert.equal(configFindings(scan)[0].category, "configuration");
});

test("flags floating and direct-source package dependencies", () => {
  const scan = {
    root: ".",
    projectTypes: [],
    skipped: {},
    truncated: false,
    files: [
      {
        path: "package.json",
        text: JSON.stringify({
          dependencies: {
            risky: "*",
            custom: "git+https://example.invalid/repo",
          },
        }),
      },
    ],
  };
  const findings = configFindings(scan);
  assert.equal(
    findings.filter((item) => item.category === "supply-chain").length,
    2,
  );
});

test("deliberate fixture exposes frontend, backend, and contract issues", async () => {
  const root = path.resolve("test/fixtures/frontend-backend");
  const old = process.env.AUDIT_WORKSPACE_ROOT;
  try {
    process.env.AUDIT_WORKSPACE_ROOT = root;
    const scan = await scanWorkspace();
    assert.ok(scan.projectTypes.includes("React"));
    assert.ok(scan.projectTypes.includes("Express"));
    const frontend = (await import("../dist/analyzers.js")).reviewFrontend(
      scan,
    );
    const backend = (await import("../dist/analyzers.js")).reviewBackend(scan);
    assert.ok(frontend.some((item) => item.category === "frontend-behavior"));
    assert.ok(backend.some((item) => item.category === "sql-injection"));
    assert.ok(traceIntegration(scan).mismatches.length > 0);
  } finally {
    if (old === undefined) delete process.env.AUDIT_WORKSPACE_ROOT;
    else process.env.AUDIT_WORKSPACE_ROOT = old;
  }
});
