import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";

test(
  "MCP initializes, lists all tools, scans, and rejects traversal safely",
  { timeout: 15000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "audit-mcp-"));
    const client = new Client({ name: "audit-test-client", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("dist/server.js"), "--root", root],
      cwd: root,
      env: { ...getDefaultEnvironment(), AUDIT_WORKSPACE_ROOT: root },
      stderr: "pipe",
    });
    try {
      await writeFile(path.join(root, "app.ts"), "export const ready = true;");
      await client.connect(transport);
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
        "analyze_code",
        "generate_audit_report",
        "review_backend",
        "review_frontend",
        "review_security",
        "review_tests",
        "scan_project",
        "trace_integration",
      ]);
      const scan = await client.callTool({
        name: "scan_project",
        arguments: {},
      });
      assert.equal(scan.structuredContent.ok, true);
      assert.equal(scan.structuredContent.fileCount, 1);
      const traversal = await client.callTool({
        name: "scan_project",
        arguments: { path: "../outside" },
      });
      assert.equal(traversal.isError, true);
      assert.equal(traversal.structuredContent.ok, false);
      const invalid = await client.callTool({
        name: "scan_project",
        arguments: { path: ".", unexpected: true },
      });
      assert.equal(invalid.isError, true);
      const markdown = await client.callTool({
        name: "generate_audit_report",
        arguments: { format: "markdown" },
      });
      assert.match(
        markdown.structuredContent.report,
        /# FullStack Audit Report/,
      );
      const json = await client.callTool({
        name: "generate_audit_report",
        arguments: { format: "json" },
      });
      assert.equal(typeof json.structuredContent.report, "object");
      assert.match(
        json.structuredContent.report.caveat,
        /does not establish security/,
      );
    } finally {
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
