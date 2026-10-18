# Installation

## Published package

The proposed command is:

```powershell
npx -y fullstack-audit-mcp
```

This name is provisional until the npm registry is checked and the package is published by its owner. Do not assume it is available yet.

## Run from source

1. Install Node.js 20 or newer from the official Node.js download page.
2. Open a terminal in this repository.
3. Install dependencies with `npm ci --ignore-scripts` after a committed `package-lock.json` is available.
4. Build with `npm run build`.
5. Run from the project folder with `node dist/server.js --root "C:\\path\\to\\your\\project"`.

For Antigravity, use the workspace-local MCP entry shown in [antigravity-setup.md](antigravity-setup.md). The server treats the configured root as its access boundary.
