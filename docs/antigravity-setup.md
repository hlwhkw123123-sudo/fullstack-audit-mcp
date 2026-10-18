# Google Antigravity setup

Antigravity's official MCP documentation describes a local stdio server entry under a top-level `mcpServers` object. Each entry has `command`, optional string-array `args`, optional `env`, and optional `cwd`. The IDE and CLI support a workspace file at `.agents/mcp_config.json`; the IDE also supports adding the entry through its MCP manager. This guide was checked against the installed Antigravity CLI version 1.107.0 and its official MCP documentation. The installed profile already has a global config at `%USERPROFILE%\.gemini\antigravity\mcp_config.json`; its existing server names were inspected and left untouched. Use the IDE's **View raw config** control for the file it currently manages, since global locations can vary across surfaces and releases.

## Connect a local checkout

Build this project, then add this server entry to the current project's `.agents/mcp_config.json` (merge it with existing entries; keep other servers):

```json
{
  "mcpServers": {
    "fullstack-audit": {
      "command": "node",
      "args": [
        "E:\\mcp\\dist\\server.js",
        "--root",
        "C:\\path\\to\\your\\project"
      ],
      "cwd": "C:\\path\\to\\your\\project"
    }
  }
}
```

Replace `C:\\path\\to\\your\\project` with the project's full path. Keep the doubled backslashes in JSON. The server does not accept a tool-request path outside that configured root.

## Connect after npm publication

Replace the source checkout command with:

```json
{
  "mcpServers": {
    "fullstack-audit": {
      "command": "npx",
      "args": ["-y", "fullstack-audit-mcp"],
      "cwd": "C:\\path\\to\\the\\project"
    }
  }
}
```

Use the actual package name listed on npm after publication. For a project-specific workspace, set `cwd` to that project directory. The package name above is still provisional before publication.

## Verify the connection

1. Save valid JSON (no comments, trailing commas, or unquoted property names).
2. In Antigravity IDE, open the agent panel menu → **MCP Servers** → **Manage MCP Servers**. Use the server refresh/reload control if needed.
3. In Antigravity CLI, enter `/mcp` to inspect the server state and connection logs.
4. Confirm all eight tools are discovered, then request `scan_project` and check that it reports the intended root and file inventory.

No environment variables are required for standard use. `AUDIT_WORKSPACE_ROOT` can set the root explicitly, but a config root is easier to review. Never put credentials in this config; the audit server needs none.

## Troubleshooting

- **Missing `node` or `npx`:** install a supported Node.js release, restart Antigravity, and confirm the executable is on its process PATH. An absolute path to `node.exe` may be used in `command` on Windows.
- **Startup failure:** check the MCP connection log; confirm `dist/server.js` exists for source mode or the npm package installs successfully for published mode.
- **Invalid JSON:** remove comments/trailing commas and validate with a JSON editor.
- **Transport error or no tools:** ensure the command runs a stdio server and that stdout is reserved for MCP messages; use `/mcp` logs or the IDE server status to reload and diagnose.
- **Wrong project scanned:** set `cwd` and `--root` to the absolute path of the intended project. Do not rely on unsupported variable expansion.
- **Package install failure:** confirm npm connectivity and Node.js version; before publication use the source-checkout configuration.

Antigravity docs: [MCP configuration and setup](https://antigravity.google/docs/mcp).
