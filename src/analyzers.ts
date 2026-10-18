import type { Finding, ProjectFile, ScanResult } from "./types.js";
import { findingId, parseJson, redact, secretFindings } from "./workspace.js";

const cap = (items: Finding[]): Finding[] =>
  [...new Map(items.map((item) => [item.id, item])).values()].slice(0, 100);
const matchLine = (file: ProjectFile, regex: RegExp): number | undefined => {
  const index = file.text.split(/\r?\n/).findIndex((line) => regex.test(line));
  return index < 0 ? undefined : index + 1;
};

function safeEndpoint(value: string): string {
  const unquoted = value.replace(/^['"`]/, "");
  if (/^https?:\/\//i.test(unquoted)) {
    try {
      const url = new URL(unquoted);
      return redact(`${url.origin}${url.pathname}`);
    } catch {
      return "remote endpoint (inspect source locally)";
    }
  }
  return redact(unquoted.split(/[?#]/, 1)[0] ?? unquoted);
}

export function analyze(scan: ScanResult): Finding[] {
  const results: Finding[] = [];
  for (const file of scan.files) {
    results.push(...secretFindings(file));
    const line = matchLine(file, /\beval\s*\(|new Function\s*\(/);
    if (line)
      results.push({
        id: findingId("dynamic-code", file.path, line),
        kind: "security_risk",
        severity: "high",
        category: "dynamic-code-execution",
        title: "Dynamic code execution",
        file: file.path,
        lineStart: line,
        evidence: "The source constructs executable code dynamically.",
        confidence: "high",
        suggestedFix:
          "Remove dynamic evaluation or replace it with a narrowly scoped parser and explicit dispatch.",
      });
    const unsafeHtml = matchLine(
      file,
      /dangerouslySetInnerHTML|\bv-html\s*=|\{@html\s/,
    );
    if (unsafeHtml)
      results.push({
        id: findingId("unsafe-html", file.path, unsafeHtml),
        kind: "likely_bug",
        severity: "medium",
        category: "cross-site-scripting",
        title: "Raw HTML insertion needs review",
        file: file.path,
        lineStart: unsafeHtml,
        evidence:
          "A framework escape hatch for inserting raw HTML is present; this check cannot determine whether the value is sanitized.",
        confidence: "medium",
        suggestedFix:
          "Prefer escaped text output or sanitize with a maintained allowlist sanitizer before insertion.",
      });
    const missingCatch = matchLine(file, /fetch\s*\(/);
    if (
      missingCatch &&
      !/\.catch\s*\(|try\s*\{[\s\S]*?fetch\s*\(/.test(file.text)
    )
      results.push({
        id: findingId("fetch-error", file.path, missingCatch),
        kind: "likely_bug",
        severity: "low",
        category: "error-handling",
        title: "Fetch failure handling may be missing",
        file: file.path,
        lineStart: missingCatch,
        evidence:
          "A fetch call is present, but no nearby catch/try pattern was identified in this file.",
        confidence: "low",
        suggestedFix:
          "Check network errors and non-success HTTP status codes, and show a safe user-facing error.",
      });
    if (
      /\.(?:ts|tsx|js|jsx)$/.test(file.path) &&
      /\bTODO\b|\bFIXME\b/.test(file.text)
    ) {
      const line = matchLine(file, /\bTODO\b|\bFIXME\b/);
      if (line)
        results.push({
          id: findingId("todo", file.path, line),
          kind: "suggestion",
          severity: "info",
          category: "follow-up",
          title: "Unresolved TODO or FIXME",
          file: file.path,
          lineStart: line,
          evidence: "A TODO/FIXME marker remains in source.",
          confidence: "high",
          suggestedFix:
            "Confirm whether the note represents unfinished behavior and track it if still relevant.",
        });
    }
  }
  return cap(results);
}

export function reviewFrontend(scan: ScanResult): Finding[] {
  const files = scan.files.filter((file) =>
    /\.(?:tsx?|jsx?|vue|svelte|html)$/.test(file.path),
  );
  const out: Finding[] = [];
  for (const file of files) {
    const line = matchLine(
      file,
      /onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}|onSubmit=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/,
    );
    if (line)
      out.push({
        id: findingId("empty-handler", file.path, line),
        kind: "likely_bug",
        severity: "medium",
        category: "frontend-behavior",
        title: "Empty UI event handler",
        file: file.path,
        lineStart: line,
        evidence: "An event handler is explicitly empty.",
        confidence: "high",
        suggestedFix:
          "Implement the intended action or remove the misleading handler.",
      });
  }
  return cap([...out, ...analyze({ ...scan, files })]);
}

export function reviewBackend(scan: ScanResult): Finding[] {
  const out: Finding[] = [];
  for (const file of scan.files.filter((item) =>
    /\.(?:ts|js|py|go|java|php)$/.test(item.path),
  )) {
    const authLine = matchLine(
      file,
      /(?:app|router)\.(?:get|post|put|patch|delete)\s*\([^\n]*\/(?:admin|users|account|profile)/i,
    );
    if (
      authLine &&
      !/auth|authorize|permission|requireUser|isAdmin/i.test(file.text)
    )
      out.push({
        id: findingId("route-auth", file.path, authLine),
        kind: "likely_bug",
        severity: "high",
        category: "authorization",
        title: "Sensitive-looking route may lack authorization",
        file: file.path,
        lineStart: authLine,
        evidence:
          "A route name suggests account or administrative data, and no common authorization marker was found in this file. Middleware may be defined elsewhere.",
        confidence: "low",
        suggestedFix:
          "Trace middleware and enforce authentication plus resource-level authorization before returning protected data.",
      });
    const sqlLine = matchLine(
      file,
      /(?:query|execute)\s*\([^\n]*(?:\+\s*|\$\{|%\s*\()/,
    );
    if (sqlLine)
      out.push({
        id: findingId("sql-concat", file.path, sqlLine),
        kind: "security_risk",
        severity: "high",
        category: "sql-injection",
        title: "Possible SQL string construction",
        file: file.path,
        lineStart: sqlLine,
        evidence:
          "A query call appears to interpolate or concatenate SQL. Parameterization may be provided indirectly.",
        confidence: "low",
        suggestedFix:
          "Use prepared statements or the framework's parameterized query API and validate inputs at the boundary.",
      });
  }
  return cap([...out, ...analyze(scan)]);
}

export function traceIntegration(scan: ScanResult): {
  clients: Array<{ file: string; line: number; target: string }>;
  routes: Array<{ file: string; line: number; route: string }>;
  mismatches: Array<{
    clientFile: string;
    clientLine: number;
    routeFile: string;
    routeLine: number;
    clientFields: string[];
    serverFields: string[];
  }>;
} {
  const clients: Array<{ file: string; line: number; target: string }> = [];
  const routes: Array<{ file: string; line: number; route: string }> = [];
  const mismatches: Array<{
    clientFile: string;
    clientLine: number;
    routeFile: string;
    routeLine: number;
    clientFields: string[];
    serverFields: string[];
  }> = [];
  for (const file of scan.files)
    file.text.split(/\r?\n/).forEach((text, index) => {
      if (/\bfetch\s*\(|axios\.(?:get|post|put|patch|delete)\s*\(/.test(text))
        clients.push({
          file: file.path,
          line: index + 1,
          target: safeEndpoint(
            text.match(/(?:https?:\/\/[^'"`]+|['"`]\/[^'"` ]*)/)?.[0] ??
              "dynamic endpoint (inspect source)",
          ),
        });
      const route = text.match(
        /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)/i,
      );
      if (route)
        routes.push({
          file: file.path,
          line: index + 1,
          route: `${route[1]?.toUpperCase()} ${route[2]}`,
        });
    });
  for (const client of clients) {
    const target = client.target.replace(/^['"`]/, "");
    if (!target.startsWith("/") || target.includes("${")) continue;
    const clientLines =
      scan.files
        .find((file) => file.path === client.file)
        ?.text.split(/\r?\n/) ?? [];
    const clientSource = clientLines
      .slice(client.line - 1, client.line + 8)
      .join("\n");
    const body = clientSource.match(/JSON\.stringify\s*\(\s*\{([^}]*)\}/)?.[1];
    if (!body) continue;
    const clientFields = [
      ...new Set(
        [...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)]
          .map((match) => match[1]!)
          .filter((field) => !["method", "headers", "body"].includes(field)),
      ),
    ];
    for (const route of routes) {
      const [method, routePath] = route.route.split(" ");
      if (
        routePath !== target ||
        (method && !clientSource.toLowerCase().includes(method.toLowerCase()))
      )
        continue;
      const routeLines =
        scan.files
          .find((file) => file.path === route.file)
          ?.text.split(/\r?\n/) ?? [];
      const routeSource = routeLines
        .slice(route.line - 1, route.line + 8)
        .join("\n");
      const serverFields = [
        ...new Set(
          [...routeSource.matchAll(/req\.body\.([A-Za-z_$][\w$]*)/g)].map(
            (match) => match[1]!,
          ),
        ),
      ];
      if (
        serverFields.length &&
        clientFields.length &&
        (serverFields.length !== clientFields.length ||
          serverFields.some((field) => !clientFields.includes(field)))
      ) {
        mismatches.push({
          clientFile: client.file,
          clientLine: client.line,
          routeFile: route.file,
          routeLine: route.line,
          clientFields,
          serverFields,
        });
      }
    }
  }
  return {
    clients: clients.slice(0, 100),
    routes: routes.slice(0, 100),
    mismatches: mismatches.slice(0, 100),
  };
}

export function reviewTests(scan: ScanResult): Finding[] {
  const testFiles = scan.files.filter((file) =>
    /(?:^|\/)(?:__tests__\/|tests?\/|[^/]+\.(?:test|spec)\.)/.test(file.path),
  );
  if (testFiles.length) return [];
  return [
    {
      id: findingId("no-tests", "", 0),
      kind: "suggestion",
      severity: "medium",
      category: "test-coverage",
      title: "No test files were discovered",
      file: "",
      evidence:
        "The scan found no files matching common test naming conventions.",
      confidence: "medium",
      suggestedFix:
        "Add focused tests for authentication/authorization, validation, API contracts, and critical user flows. Discovery can miss custom test layouts.",
    },
  ];
}

export function configFindings(scan: ScanResult): Finding[] {
  const out: Finding[] = [];
  const pkgFile = scan.files.find((file) => file.path === "package.json");
  if (pkgFile) {
    const pkg = parseJson(pkgFile.text);
    if (!pkg)
      out.push({
        id: findingId("bad-package-json", pkgFile.path, 1),
        kind: "likely_bug",
        severity: "high",
        category: "configuration",
        title: "package.json is malformed",
        file: pkgFile.path,
        lineStart: 1,
        evidence: "The file could not be parsed as JSON.",
        confidence: "high",
        suggestedFix:
          "Correct the JSON syntax and validate it with npm pkg fix or a JSON parser.",
      });
    else if (
      pkg.scripts &&
      Object.keys(pkg.scripts).some((name) =>
        /^(?:preinstall|install|postinstall|prepare)$/.test(name),
      )
    )
      out.push({
        id: findingId("lifecycle", pkgFile.path, 1),
        kind: "security_risk",
        severity: "medium",
        category: "supply-chain",
        title: "Package lifecycle scripts are configured",
        file: pkgFile.path,
        lineStart: 1,
        evidence:
          "A lifecycle script can execute code during installation; this MCP does not execute it.",
        confidence: "high",
        suggestedFix:
          "Review the script and dependencies before installing; remove unnecessary lifecycle hooks.",
      });
    if (pkg) {
      for (const section of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
      ]) {
        const deps = pkg[section];
        if (!deps || typeof deps !== "object") continue;
        for (const [name, spec] of Object.entries(
          deps as Record<string, unknown>,
        )) {
          if (typeof spec !== "string") continue;
          if (/^(?:\*|latest|x)$/i.test(spec.trim())) {
            out.push({
              id: findingId(`floating-dependency:${name}`, pkgFile.path, 1),
              kind: "security_risk",
              severity: "medium",
              category: "supply-chain",
              title: "Dependency uses a fully floating version",
              file: pkgFile.path,
              lineStart: 1,
              evidence: `Dependency ${name} uses ${spec}; its resolved version can change between installs.`,
              confidence: "high",
              suggestedFix:
                "Use an intentional version range and commit a lockfile; review the resolved package before upgrading.",
            });
          } else if (/^(?:git\+|https?:|file:)/i.test(spec)) {
            out.push({
              id: findingId(`nonregistry-dependency:${name}`, pkgFile.path, 1),
              kind: "security_risk",
              severity: "medium",
              category: "supply-chain",
              title: "Dependency resolves from a nonstandard source",
              file: pkgFile.path,
              lineStart: 1,
              evidence: `Dependency ${name} uses a direct URL, Git, or local path specifier.`,
              confidence: "high",
              suggestedFix:
                "Verify the source and pin an immutable revision where appropriate.",
            });
          }
        }
      }
    }
  }
  const lockNames = new Set([
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "requirements.txt",
    "poetry.lock",
    "Cargo.lock",
    "go.sum",
    "composer.lock",
  ]);
  if (pkgFile && !scan.files.some((file) => lockNames.has(file.path)))
    out.push({
      id: findingId("missing-lock", "package.json", 0),
      kind: "suggestion",
      severity: "low",
      category: "dependency-management",
      title: "No recognized lockfile was found",
      file: "package.json",
      evidence:
        "Dependency resolution may vary between installs without a committed lockfile.",
      confidence: "medium",
      suggestedFix:
        "Commit the package manager's lockfile to improve repeatability.",
    });
  return cap(out);
}
