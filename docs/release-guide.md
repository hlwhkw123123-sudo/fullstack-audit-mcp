# Release guide

Do not publish until the package name and ownership are verified and release gates are green.

1. Confirm the target public GitHub repository identity and package name with the owner.
2. Run formatting, lint, type-check, full test, build, MCP initialize/tool discovery, read-only verification, and `npm pack --dry-run` from a clean checkout.
3. Inspect package contents and dependency/license/security reports. Confirm there are no secrets, local config, or personal data.
4. Review changelog, version, README, framework/security claims, and exact Git diff.
5. Use GitHub Actions trusted publishing for npm if enabled on the verified package. Configure OIDC provenance and minimal permissions; do not put npm tokens in source.
6. Create a version tag/release only after explicit release approval. Verify the published npm page and install in a separate temporary project.
7. Record verified URLs, package version, checksums, and test evidence in release notes.

This is a local draft at version 0.1.0. The npm registry returned 404 for the proposed unscoped package name during the check on 2026-10-18; check again before publishing. No repository URL or published package URL is claimed.
