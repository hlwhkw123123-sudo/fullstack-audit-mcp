# Security model and limits

## Controls

- One configured root is resolved at server startup/request; user-supplied paths must be relative and remain beneath it.
- Symlinks are skipped; file real paths are checked before reading.
- The scanner limits individual files to 128 KiB, total source text to 16 MiB, and the inventory to 2,500 files. It skips common generated/dependency directories, binary files, and hidden directories.
- Environment files, private keys, and credential bundle filenames are skipped without reading. Credential-shaped source findings omit the value, and returned evidence does not contain source snippets.
- Tool schemas reject unknown fields and bound path, offset, and result limit values.
- The process only reads local files. It has no generic shell tool, network call, patch, report-write, test-run, migration, or deployment operation.
- Logs do not include source code or secrets. The server emits protocol responses on stdout and no normal logs.

## Limitations

Heuristics may miss aliases, indirect flows, framework middleware, dynamic routes, and context-specific bugs. Secret patterns are incomplete. Symlink behavior depends on filesystem semantics and must be re-reviewed for each platform. File-count and byte limits intentionally bound review. Dependency advisories are not queried; lockfiles and lifecycle hooks are only identified with simple checks. The server does not execute npm audit or external scanners. The MCP host and AI model are separate trust boundaries; the model may see the finding output and project metadata. Do not scan data you are not authorized to expose to the connected agent.

No findings does not mean a project is safe. Use specialist security review, dependency advisory tooling, tests, and runtime validation as needed.
