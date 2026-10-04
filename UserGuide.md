# User Guide

## Directory Summary Tool

### What it does

`directory_summary` is a built-in OpenCode agent tool that analyzes one directory of the current repository and returns a JSON summary of:

- **Purpose**: a short guess at what the folder is for (source module, tests, documentation, scripts, package root, a grouping of subpackages, or empty), based on its files and subdirectories.
- **Folder dependencies** (`relatedDirectories`): the other repository folders that this folder's JavaScript/TypeScript files import from. Relative imports (`./x`, `../x`), tsconfig `paths` aliases (`@/x`), `package.json` subpath imports (`#db`) and monorepo workspace packages (`@opencode-ai/core/...`) are all resolved to the folder they point at.
- **Dependency frequency**: for each related folder, `imports` counts the distinct (file, target) imports and `files` lists which files import it. Results are sorted with the most-used folder first. `dependencies` lists every individual import record.
- **External dependencies** (`externalPackages`): third-party npm packages (`kind: "package"`) and runtime builtins such as `path` or `node:fs` (`kind: "builtin"`), with the files that use each one.

It also lists the folder's files with an inferred role (entry point, source, test, configuration, …), its immediate subdirectories, `unresolvedImports`, and `skipped`/`truncated` flags so you can tell when coverage is incomplete.

Scope and safety rules:

- Only the immediate files in the folder are scanned (subdirectories are listed but not scanned). Imports between files inside the folder are internal and are not reported as dependencies.
- Imports are found with Bun's real parser, so import-like text in comments or strings is ignored. Type-only `import type` declarations are also ignored.
- Paths outside the current workspace are rejected, including symlinks that point outside it. Relative imports that escape the workspace are never followed.
- The tool asks for OpenCode's `read` permission for the directory and for every file it reads, so `permission.read` rules in `opencode.json` apply exactly as they do for the `read` tool.

### How to use it

The tool is called by the agent; you don't type it as a slash command. It takes one argument:

```json
{ "path": "packages/opencode/src/tool" }
```

`path` may be absolute or relative to the directory OpenCode was started in, and it must be non-empty.

1. Start OpenCode in the repository: `bun dev` from the repo root (or `opencode` if it is installed).
2. Ask for a summary and name the tool, for example:

   > Use the directory_summary tool on packages/opencode/src/storage and tell me what the folder does, which folders it depends on and how often, and which external packages it uses.

The same works non-interactively:

```bash
bun dev run "Use the directory_summary tool on packages/opencode/src/storage and summarize the result"
```

The tool is available to the default `build` and `plan` agents and to the `explore` subagent.

Example (abridged) result for `packages/core/src/effect`:

```json
{
  "relativePath": "packages/core/src/effect",
  "purpose": "Likely a source module containing application or library implementation.",
  "truncated": false,
  "relatedDirectories": [
    { "directory": "packages/core/src", "imports": 3, "files": ["app-node-builder.ts", "runtime.ts"] },
    { "directory": "packages/llm/src/route", "imports": 1, "files": ["app-node-platform.ts"] }
  ],
  "externalPackages": [
    { "name": "@effect/platform-node", "kind": "package", "files": ["..."] },
    { "name": "effect", "kind": "package", "files": ["..."] }
  ]
}
```

### How to manually test it

1. Start OpenCode from the repo root with `bun dev`.
2. Ask: "Use directory_summary on `packages/opencode/src/tool`." Check that `purpose` describes a source module and `files` lists files such as `read.ts` and `registry.ts`.
3. Check the internal dependencies: `relatedDirectories` should include `packages/core/src` and `packages/opencode/src/effect`, each with an `imports` count, and the folder with the highest count should come first.
4. Check the external dependencies: `externalPackages` should include `effect` (`package`) and `path` (`builtin`).
5. Ask for `packages/core/src/database`. `#sqlite` must **not** appear in `externalPackages`, because it resolves to a file inside that folder.
6. Create an empty folder inside the repo (`mkdir scratch-empty`) and summarize it. `purpose` should say "Empty directory" and every list should be empty. Remove the folder afterwards.
7. Ask for a missing path (`does-not-exist`) and an outside path (`/etc` or `..`). The tool call should fail with "Directory not found" and "must be within the current workspace", respectively.
8. Optional: add `"permission": { "read": { "*": "deny" } }` to `opencode.json`. The tool should then be blocked before it lists anything.

### Automated tests

| File                                                    | What it covers                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/opencode/test/tool/directory_summary.test.ts` | 22 behavioral tests of the tool against real temporary workspaces (no mocks of the filesystem or parser) |
| `packages/opencode/test/tool/parameters.test.ts`        | JSON Schema snapshot for the `path` parameter; empty, missing and non-string `path` are rejected         |
| `packages/opencode/test/tool/registry.test.ts`          | `directory_summary` is registered and exposed to agents                                                  |

Categories covered in `directory_summary.test.ts`:

- **Basic behavior**: valid directories (relative, absolute, workspace root), file roles, nested subdirectories listed but not scanned, empty directory, nonexistent path, file instead of directory, purpose heuristics (source, tests, package root, docs, scripts, grouping folder, unknown).
- **Dependency detection**: `./` and `../` relative imports, index and `.js`→`.ts` resolution, `@/` tsconfig aliases (including JSONC tsconfig), `package.json` `#` subpath imports, workspace packages through `exports` (root, conditional and `*` patterns), external packages and builtins, duplicate imports collapsed, counts aggregated across multiple files, internal imports excluded, unresolved imports reported.
- **Parser correctness**: static, re-export, side-effect, dynamic `import()`, `require()`, and TSX imports are detected. Imports inside line/block comments, strings, template literals and JSX attributes, plus `import type`, are ignored. Unparseable files are reported as skipped.
- **Safety and permissions**: out-of-workspace paths and symlinks rejected, relative imports escaping the workspace not followed, symlinked entries not scanned, exact `read` permission requests asserted, denial on the directory or on a file stops the tool, OS-unreadable directories and files handled, malformed arguments rejected with `InvalidArgumentsError`.
- **Output limits**: oversized files and directories with more than 200 entries are flagged as `truncated`. The dependency list is capped while `relatedDirectories` still counts every import.

Why this is sufficient: every field in the output (`purpose`, `relatedDirectories` with counts, `dependencies`, `externalPackages`, `unresolvedImports`, `skipped`/`truncated`) and every resolution branch in `directory_summary.ts` (relative, tsconfig alias, subpath import, workspace package, external, builtin, unresolved) is asserted with exact expected values. So is every rejection path (bad arguments, outside workspace, missing, not a directory, inaccessible, permission denied). The tests run the real tool through `Tool.define` against real files, so they exercise the same argument validation, permission requests and parsing that an agent call does.

Run them from the package directory:

```bash
cd packages/opencode
bun test test/tool/directory_summary.test.ts test/tool/parameters.test.ts test/tool/registry.test.ts
```
