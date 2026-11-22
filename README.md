# ResearchOS Plugin Registry

Official plugin index repository for **ResearchOS** (SPEC-14).

## Repository Structure

```text
.
├── registry.json                    # Canonical plugin index consumed by ResearchOS
├── scripts/validate-registry.mjs    # Zero-dependency schema & SHA-256 validator
├── templates/plugin-release.yml     # GitHub Action template for plugin authors
└── .github/workflows/validate.yml   # CI checks for PRs and main branch
```

## Submitting or Updating a Plugin

1. Host your plugin in your own GitHub repository with a valid `manifest.json` at the root.
2. Publish a GitHub Release containing `<plugin-id>-<version>.zip` (you can copy `templates/plugin-release.yml` into `.github/workflows/release.yml` to automate this on tag push).
3. Fork this repository and add (or update) your entry in `registry.json`:

```json
{
  "id": "org.example.my-plugin",
  "name": "My Plugin",
  "author": "Your Name",
  "description": "One-sentence summary of what the plugin does.",
  "tags": ["literature", "efficiency"],
  "repo": "owner/repo",
  "latestVersion": "1.0.0",
  "minApiVersion": 1,
  "downloadUrl": "https://github.com/owner/repo/releases/download/v1.0.0/org.example.my-plugin-1.0.0.zip",
  "sha256": "<64-char lowercase hex sha256 of the zip>",
  "permissions": ["notes.read"],
  "networkDomains": [],
  "readmeUrl": "https://raw.githubusercontent.com/owner/repo/main/README.md",
  "verified": false,
  "updatedAt": "2026-11-22T00:00:00.000Z"
}
```

4. Run local validation before opening a Pull Request:

```bash
node scripts/validate-registry.mjs
```

5. Open a PR to `main`. CI will validate the schema and verify that `downloadUrl` matches `sha256`.
