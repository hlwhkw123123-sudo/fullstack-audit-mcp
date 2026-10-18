# Troubleshooting

## Server command not found

Confirm Node.js 20 or newer is installed and visible to Antigravity. Restart Antigravity after changing PATH. On Windows, set `command` to the full `node.exe` path if needed.

## Server fails to start

For a checkout, run `npm run build` and confirm `dist/server.js` exists. Confirm `cwd` and `--root` name a readable directory. Check Antigravity's MCP logs for the process error.

## Invalid JSON configuration

Use a JSON editor, quote all keys and strings, and remove comments and trailing commas. Preserve the existing `mcpServers` entries when merging this server.

## Transport error or missing tools

This release uses stdio. Do not redirect protocol output to a file or start a server in HTTP mode. Reload the server from Antigravity's MCP manager and inspect connection logs. A running process should advertise eight tools.

## npm installation problems

Confirm internet access to npm and supported Node.js version. Before publication, use the source checkout setup. The `fullstack-audit-mcp` package name and `npx` command are provisional until verified at release time.

## Empty or partial scan

Check the configured root, path and exclusions. Hidden, dependency, generated, binary, oversized, secret and symlinked files may be skipped. The tool reports counts, but does not expose excluded secret paths.
