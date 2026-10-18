import { lstat, realpath, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Finding, ProjectFile, ScanResult } from "./types.js";

const MAX_FILES = 2500;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const EXCLUDED = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
  "target",
  "__pycache__",
  ".venv",
]);
const SECRET_FILE =
  /(^|\/)(\.env(?:\..*)?|[^/]*\.(?:pem|key|p12|pfx|keystore)|id_rsa|id_ed25519|credentials\.json)$/i;
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".php",
  ".rb",
  ".cs",
  ".sql",
  ".prisma",
  ".graphql",
  ".gql",
  ".md",
  ".html",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".xml",
  ".properties",
  ".sh",
]);

export function validateRelativePath(input: string): string {
  if (input.length > 1000 || input.includes("\0"))
    throw new Error("Path is invalid or too long.");
  if (path.isAbsolute(input) || /^[a-zA-Z]:/.test(input))
    throw new Error("Use a path relative to the configured workspace.");
  const normalized = path.normalize(input || ".");
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`))
    throw new Error("Path escapes the configured workspace.");
  return normalized;
}

export async function scanWorkspace(relative = "."): Promise<ScanResult> {
  const configured = process.env.AUDIT_WORKSPACE_ROOT || process.cwd();
  const root = await realpath(configured);
  const safeRelative = validateRelativePath(relative);
  const start = path.resolve(root, safeRelative);
  if (start !== root && !start.startsWith(root + path.sep))
    throw new Error("Path escapes the configured workspace.");
  const startReal = await realpath(start);
  if (startReal !== root && !startReal.startsWith(root + path.sep))
    throw new Error("Path resolves outside the configured workspace.");

  const files: ProjectFile[] = [];
  let totalBytes = 0;
  const skipped = {
    excluded: 0,
    symlink: 0,
    oversized: 0,
    binary: 0,
    unreadable: 0,
    sensitive: 0,
  };
  const walk = async (dir: string): Promise<void> => {
    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      skipped.unreadable++;
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) return;
      if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(entry.name)) {
        skipped.unreadable++;
        continue;
      }
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        skipped.symlink++;
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED.has(entry.name) || entry.name.startsWith(".")) {
          skipped.excluded++;
          continue;
        }
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SECRET_FILE.test(rel)) {
        skipped.sensitive++;
        continue;
      }
      if (
        !TEXT_EXT.has(path.extname(entry.name).toLowerCase()) &&
        ![
          "package.json",
          "package-lock.json",
          "pnpm-lock.yaml",
          "yarn.lock",
          "bun.lock",
          "bun.lockb",
          "requirements.txt",
          "Pipfile",
          "Cargo.toml",
          "go.mod",
          "composer.json",
          "Gemfile",
          "pom.xml",
          "build.gradle",
          "build.gradle.kts",
          "Dockerfile",
          "Makefile",
        ].includes(entry.name)
      )
        continue;
      try {
        const info = await lstat(full);
        if (
          !info.isFile() ||
          info.size > MAX_FILE_BYTES ||
          totalBytes + info.size > MAX_TOTAL_BYTES
        ) {
          skipped.oversized++;
          continue;
        }
        const real = await realpath(full);
        if (!real.startsWith(root + path.sep)) {
          skipped.symlink++;
          continue;
        }
        const data = await readFile(real);
        if (data.includes(0)) {
          skipped.binary++;
          continue;
        }
        totalBytes += data.byteLength;
        files.push({ path: rel, text: data.toString("utf8") });
      } catch {
        skipped.unreadable++;
      }
    }
  };
  await walk(startReal);
  const projectTypes = detectProjectTypes(files);
  return {
    root,
    files,
    skipped,
    truncated: files.length >= MAX_FILES,
    projectTypes,
  };
}

export function detectProjectTypes(files: ProjectFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.text]));
  const result = new Set<string>();
  const pkg = parseJson(byPath.get("package.json"));
  const deps = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  } as Record<string, unknown>;
  if (Object.keys(deps).length) result.add("JavaScript/TypeScript");
  if (deps.react) result.add("React");
  if (deps.next) result.add("Next.js");
  if (deps.vite) result.add("Vite");
  if (deps.express) result.add("Express");
  if (deps["@nestjs/core"]) result.add("NestJS");
  if (files.some((file) => file.path.endsWith(".py"))) result.add("Python");
  if (byPath.has("requirements.txt") || byPath.has("pyproject.toml"))
    result.add("Python");
  if (
    files.some(
      (file) => file.path.endsWith(".sql") || file.path.endsWith(".prisma"),
    )
  )
    result.add("Database schema/migrations");
  if (byPath.has("go.mod")) result.add("Go");
  if (byPath.has("Cargo.toml")) result.add("Rust");
  if (!result.size) result.add("Unknown or unsupported project type");
  return [...result];
}

export function parseJson(
  text: string | undefined,
): Record<string, any> | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function redact(text: string): string {
  return text
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED_SECRET]",
    )
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[=:]\s*["']?)[^\s"',;}]+/gi,
      "$1[REDACTED_SECRET]",
    );
}

export function secretFindings(file: ProjectFile): Finding[] {
  const findings: Finding[] = [];
  const lines = file.text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const pattern =
      /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b|(?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*["'][^"']{8,}["']/i;
    if (
      pattern.test(line) &&
      !/(example|placeholder|changeme|your[_ -]?key|redacted)/i.test(line)
    ) {
      findings.push({
        id: findingId("secret", file.path, index + 1),
        kind: "security_risk",
        severity: "high",
        category: "secret-exposure",
        title: "Possible hard-coded credential",
        file: file.path,
        lineStart: index + 1,
        evidence:
          "A credential-shaped value was found; its contents are intentionally omitted.",
        confidence: "medium",
        suggestedFix:
          "Remove the credential from source, rotate it if real, and load it from a secret manager or environment variable.",
      });
    }
  });
  return findings;
}

export function findingId(
  category: string,
  file: string,
  line: number,
): string {
  return createHash("sha256")
    .update(`${category}:${file}:${line}`)
    .digest("hex")
    .slice(0, 12);
}
