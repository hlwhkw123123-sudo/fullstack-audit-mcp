# Development

## Prerequisites

Node.js 20+, npm, and Git. This repository uses TypeScript, the official MCP TypeScript server SDK, and Node's built-in test runner.

## Local workflow

1. Install locked dependencies with `npm ci --ignore-scripts`.
2. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
3. Test the MCP handshake and tool discovery using an MCP inspector/client in a temporary workspace before release.
4. Inspect `npm pack --dry-run` and the packed file list before any publication.

The MCP process must not run a scanned repository's package scripts. Analyzer tests use isolated temporary fixtures. Add new framework rules as separate pure analyzers, with evidence, confidence, severity, and false-positive notes.

## Current limitations and progress

The local verification completed on 2026-10-18: formatting, lint, type-check, build, MCP initialization/tool discovery, read-only checks, fixture analysis, contract mismatch checks, report formatting, packed-install execution, package dry-run, and `npm audit --audit-level=high` passed. The standard test run had 12 passed and one optional packed-install test skipped; the separate packed-install run had 13 passed and none failed. The npm registry returned 404 for `fullstack-audit-mcp` at that check; availability must be rechecked immediately before publication. GitHub CI has not run because no remote repository is configured.

Remaining release gates: confirm the exact public GitHub repository, configure verified repository metadata, run CI on GitHub, authenticate to npm through its official flow, recheck package name availability, and obtain explicit approval before publishing. Broader language parsers and external dependency advisory coverage remain future work. No push or package publication has been performed.
