# FullStack Audit MCP

FullStack Audit MCP is a **read-only local MCP server** for evidence-based review of supported software projects. It gives an AI coding agent a bounded inventory and static-analysis findings; the AI agent adds semantic reasoning. Neither layer can prove that a project is defect-free or secure.

## Features

- Eight focused MCP tools for project discovery, code review, integration tracing, security, tests, and reports.
- Local-only analysis: no source code, secrets, or reports are sent to an external AI service by this server.
- Workspace-root enforcement, safe symlink skipping, size/file limits, default generated-file exclusions, secret-file skipping, and secret-value redaction.
- Findings include type, severity, category, location, evidence, confidence, and suggested fix.
- Markdown and JSON reports are returned in the tool response; files are never written.
- Repository scripts, migrations, tests, and build commands are never executed.

## Requirements

- Node.js 20 or newer.
- Google Antigravity IDE, CLI, or another MCP host that supports local stdio servers.

## Install

After publication, install with `npx -y fullstack-audit-mcp`. The package name is a local candidate until npm registry availability and ownership are verified. Until then, run from a source checkout: `npm install` followed by `npm run build`.

## Antigravity setup

Antigravity uses a JSON `mcpServers` object for local stdio servers. See [docs/antigravity-setup.md](docs/antigravity-setup.md) for the verified file locations, a beginner walkthrough, reload instructions, and troubleshooting.

## First audit

1. Open the project you want reviewed as the Antigravity workspace.
2. Add the local stdio server config shown in [the setup guide](docs/antigravity-setup.md).
3. Reload MCP servers and confirm that the eight FullStack Audit tools appear.
4. Ask the agent: “Run `scan_project`, then review the frontend, backend, security, and tests. Cite file and line evidence, label uncertainty, and do not modify files.”
5. Ask: “Generate a Markdown audit report and summarize the three highest-priority findings.”

Useful additional prompt: “Use `trace_integration` to compare frontend requests with backend routes. Call out dynamic URLs or routes you could not prove are connected.”

## Example finding

```text
HIGH · security risk · authorization · src/routes.ts:14
Possible authorization gap on a sensitive-looking route.
Evidence: The route resembles an account endpoint; no common authorization marker was found in this file. Middleware may be defined elsewhere.
Confidence: low
Suggested fix: Trace middleware and enforce authentication plus resource-level authorization.
```

This example illustrates the report shape; actual findings must come from a project scan.

## Supported frameworks

The initial analyzers recognize JavaScript and TypeScript projects, including React, Next.js, Vite, Express, and NestJS manifests. The scanner can inspect common source/configuration formats in Python, Go, Rust, Java, PHP, Ruby, C#, Vue, Svelte, SQL, GraphQL, and related files, but framework-specific semantic checks for those ecosystems are limited or absent. See [docs/supported-frameworks.md](docs/supported-frameworks.md).

## Security limits

This tool is a static heuristic reviewer, not a substitute for expert review, dependency advisory scanning, runtime testing, or threat modeling. It does not run `npm audit` or query an external vulnerability feed. It does not load project scripts. Files under standard dependency/build directories and sensitive credential files are excluded. Findings can be false positives or misses. Never interpret an empty report as proof of safety. Details: [docs/security.md](docs/security.md).

## Troubleshooting and contributing

See [docs/troubleshooting.md](docs/troubleshooting.md), [docs/development.md](docs/development.md), and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
