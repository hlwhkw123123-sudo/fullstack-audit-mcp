# Usage guide

All tools read files under the server's configured workspace root. Their `path` input is a relative subdirectory, defaulting to `.`. Results are bounded and paginated with `offset` and `limit` where offered. No tool writes into the project.

| Tool                    | Purpose                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scan_project`          | Detect manifests/frameworks, list readable source/config files, and report exclusions.                                                 |
| `analyze_code`          | Run general static heuristics for likely defects and risks.                                                                            |
| `review_frontend`       | Review supported UI source for selected frontend behavior issues.                                                                      |
| `review_backend`        | Inspect routes, query construction, and backend configuration patterns.                                                                |
| `trace_integration`     | Pair recognizable client request sites with route declarations and report simple literal request-field mismatches for agent follow-up. |
| `review_security`       | Find selected credential, dynamic-code, raw-HTML, and backend risk patterns.                                                           |
| `review_tests`          | Locate conventional test files; it never runs them.                                                                                    |
| `generate_audit_report` | Return a bounded Markdown or JSON report without writing a file.                                                                       |

## Example prompts

- “Scan the project. Tell me which files and frameworks were discovered and what was skipped.”
- “Review the backend. Separate confirmed evidence from likely authorization concerns, and note middleware you could not trace.”
- “Trace the API integration. Compare request paths with route declarations; do not claim a match where a URL is dynamic.”
- “Review the tests and list important behaviors that appear uncovered. Do not run commands.”
- “Generate a JSON report, then explain the highest-severity findings in plain language.”

The MCP tools expose bounded project facts and heuristic results. The AI agent performs the semantic reasoning and should cite tool evidence, describe uncertainty, and avoid treating guesses as confirmed defects.
