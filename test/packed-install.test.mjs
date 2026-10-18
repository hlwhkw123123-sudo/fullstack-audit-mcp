import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/client/stdio";

test(
  "packed npm install starts and exposes tools",
  { skip: !process.env.AUDIT_PACKED_SERVER, timeout: 15000 },
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "audit-packed-"));
    const client = new Client({ name: "audit-packed-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [process.env.AUDIT_PACKED_SERVER, "--root", root],
      cwd: root,
      env: { ...getDefaultEnvironment(), AUDIT_WORKSPACE_ROOT: root },
      stderr: "pipe",
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 8);
      assert.ok(tools.tools.some((tool) => tool.name === "scan_project"));
    } finally {
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
