# Supported languages and frameworks

The MVP performs bounded text scanning and a small set of pattern checks. “Detected” means a manifest or source extension was recognized; it does not mean complete semantic analysis.

| Ecosystem                   | Detection                                   | Analysis coverage                                                  |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| JavaScript / TypeScript     | `package.json`, common extensions           | General source heuristics                                          |
| React, Next.js, Vite        | Dependencies in `package.json`              | Selected frontend patterns; framework-specific coverage is partial |
| Express, NestJS             | Dependencies in `package.json`              | Express-style route patterns; NestJS checks are limited            |
| Python                      | `.py`, `requirements.txt`, `pyproject.toml` | File inventory only; limited general checks                        |
| Go, Rust                    | `go.mod`, `Cargo.toml`                      | File inventory only                                                |
| Java, Kotlin, PHP, Ruby, C# | Common text extensions/build files          | File inventory only                                                |
| Vue, Svelte                 | Common source extensions                    | Raw HTML pattern checks only                                       |
| SQL, Prisma, GraphQL        | Common schema extensions                    | Inventory and limited text checks                                  |

Not supported as semantic framework analyzers in this release: Django/FastAPI, Rails, Laravel, Spring, ASP.NET, Angular, database-specific migration semantics, mobile frameworks, compiled/binary projects, and generated code. No LLM is called by the MCP process.
