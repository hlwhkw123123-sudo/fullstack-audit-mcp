#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import {
  analyze,
  configFindings,
  reviewBackend,
  reviewFrontend,
  reviewTests,
  traceIntegration,
} from "./analyzers.js";
import type { Finding, ScanResult } from "./types.js";
import { scanWorkspace } from "./workspace.js";

const requestedRoot = process.argv.indexOf("--root");
if (requestedRoot >= 0) {
  const value = process.argv[requestedRoot + 1];
  if (!value || value.startsWith("--")) {
    process.stderr.write("--root requires a workspace path.\n");
    process.exit(2);
  }
  process.env.AUDIT_WORKSPACE_ROOT = value;
}

const scanArgs = z
  .object({
    path: z.string().max(256).default("."),
    offset: z.number().int().min(0).max(100_000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
function envelope<T extends Record<string, unknown>>(data: T) {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: data,
  };
}
async function safe<T>(fn: () => Promise<T>) {
  try {
    return envelope({ ok: true, ...((await fn()) as Record<string, unknown>) });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.replace(/[\r\n\t]/g, " ").slice(0, 300)
        : "Analysis failed.";
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: false, error: message }),
        },
      ],
      structuredContent: { ok: false, error: message },
      isError: true,
    };
  }
}
function page<T>(items: T[], offset: number, limit: number) {
  return {
    items: items.slice(offset, offset + limit),
    offset,
    limit,
    total: items.length,
    hasMore: offset + limit < items.length,
  };
}
function summarize(scan: ScanResult) {
  return {
    root: scan.root,
    projectTypes: scan.projectTypes,
    fileCount: scan.files.length,
    files: scan.files.map((file) => file.path),
    skipped: scan.skipped,
    truncated: scan.truncated,
    note: "File contents are not returned by scan_project. Secret files and excluded/generated directories are skipped.",
  };
}
function findingPage(findings: Finding[], offset: number, limit: number) {
  return page(findings, offset, limit);
}

const server = new McpServer({ name: "fullstack-audit-mcp", version: "0.1.0" });
server.registerTool(
  "scan_project",
  {
    description:
      "Discover project manifests, frameworks, source file inventory, and skipped-file counts under the configured workspace. Read-only. Use path only as a relative subdirectory; results are paginated.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      const summary = summarize(scan);
      return { ...summary, files: page(summary.files, offset, limit) };
    }),
);
server.registerTool(
  "analyze_code",
  {
    description:
      "Run bounded local heuristics over supported source files. Returns evidence-based possible defects and security risks without executing repository code. Findings are not a guarantee of correctness or completeness.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      return {
        findings: findingPage(
          [...analyze(scan), ...configFindings(scan)],
          offset,
          limit,
        ),
        projectTypes: scan.projectTypes,
        skipped: scan.skipped,
      };
    }),
);
server.registerTool(
  "review_frontend",
  {
    description:
      "Review discovered frontend source for selected UI behavior and rendering risks. Static heuristics only; verify context and data sanitization.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      return {
        findings: findingPage(reviewFrontend(scan), offset, limit),
        projectTypes: scan.projectTypes,
      };
    }),
);
server.registerTool(
  "review_backend",
  {
    description:
      "Review supported backend source for likely route authorization, query construction, error handling, and configuration risks. Middleware can live elsewhere, so heuristic results require verification.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      return {
        findings: findingPage(
          [...reviewBackend(scan), ...configFindings(scan)],
          offset,
          limit,
        ),
        projectTypes: scan.projectTypes,
      };
    }),
);
server.registerTool(
  "trace_integration",
  {
    description:
      "List statically recognizable frontend request calls and backend Express-style route declarations with file and line evidence. For literal matching paths, report simple request-field mismatches when the same-line JSON object and route body reads are visible. This does not resolve dynamic URLs or prove a route is connected.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      const trace = traceIntegration(scan);
      return {
        clients: page(trace.clients, offset, limit),
        routes: page(trace.routes, offset, limit),
        mismatches: page(trace.mismatches, offset, limit),
        projectTypes: scan.projectTypes,
      };
    }),
);
server.registerTool(
  "review_security",
  {
    description:
      "Check for credential-shaped source values, dynamic code execution, raw HTML insertion, and selected backend risks. Secret file contents are never read or returned. This is not a full security audit.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      const findings = [
        ...analyze(scan),
        ...reviewBackend(scan),
        ...configFindings(scan),
      ].filter((item) => item.kind === "security_risk");
      return {
        findings: findingPage(
          [...new Map(findings.map((item) => [item.id, item])).values()],
          offset,
          limit,
        ),
        projectTypes: scan.projectTypes,
        skipped: scan.skipped,
      };
    }),
);
server.registerTool(
  "review_tests",
  {
    description:
      "Discover common test files and identify when none are found. Does not run project tests, install packages, or execute scripts.",
    inputSchema: scanArgs,
  },
  async ({ path: relative, offset, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      const files = scan.files
        .filter((file) =>
          /(?:^|\/)(?:__tests__\/|tests?\/|[^/]+\.(?:test|spec)\.)/.test(
            file.path,
          ),
        )
        .map((file) => file.path);
      return {
        testFiles: page(files, offset, limit),
        findings: reviewTests(scan),
        testsExecuted: false,
      };
    }),
);
server.registerTool(
  "generate_audit_report",
  {
    description:
      "Generate a bounded Markdown or JSON audit report in the tool response. No file is written. Findings include evidence and uncertainty; source contents and secret values are not included.",
    inputSchema: z
      .object({
        path: z.string().max(256).default("."),
        format: z.enum(["markdown", "json"]).default("markdown"),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .strict(),
  },
  async ({ path: relative, format, limit }) =>
    safe(async () => {
      const scan = await scanWorkspace(relative);
      const findings = [
        ...new Map(
          [
            ...analyze(scan),
            ...configFindings(scan),
            ...reviewFrontend(scan),
            ...reviewBackend(scan),
            ...reviewTests(scan),
          ].map((item) => [item.id, item]),
        ).values(),
      ].slice(0, limit);
      const report = {
        generatedAt: new Date().toISOString(),
        root: scan.root,
        projectTypes: scan.projectTypes,
        filesScanned: scan.files.length,
        skipped: scan.skipped,
        truncated: scan.truncated,
        findings,
        caveat:
          "Heuristic static analysis is incomplete. No scripts or tests were run. Absence of findings does not establish security or correctness.",
      };
      const markdown = [
        `# FullStack Audit Report`,
        ``,
        `- Generated: ${report.generatedAt}`,
        `- Project types: ${report.projectTypes.join(", ")}`,
        `- Files scanned: ${report.filesScanned}`,
        `- Findings returned: ${findings.length}`,
        ``,
        report.caveat,
        ...findings.flatMap((item) => [
          ``,
          `## ${item.severity.toUpperCase()}: ${item.title}`,
          ``,
          `- Type: ${item.kind} · ${item.category}`,
          `- Location: ${item.file || "project"}${item.lineStart ? `:${item.lineStart}${item.lineEnd && item.lineEnd !== item.lineStart ? `-${item.lineEnd}` : ""}` : ""}`,
          `- Confidence: ${item.confidence}`,
          `- Evidence: ${item.evidence}`,
          `- Suggested fix: ${item.suggestedFix}`,
          ...(item.reproduction
            ? [`- Reproduction: ${item.reproduction}`]
            : []),
        ]),
      ].join("\n");
      return { format, report: format === "json" ? report : markdown };
    }),
);

serveStdio(() => server);
