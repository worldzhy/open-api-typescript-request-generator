# Change Log

All notable changes to this project will be documented in this file.

---

## [0.0.6] - 2026-09-21

> Zero-config CLI, optional config file, `src/` restructure, and dependency-tree cleanup. Contains breaking config renames — see below.

### Breaking Changes

- **CLI binary renamed**: `apits-gener` → `apits` (aligned with `apits.config.ts` and the package.json `apits` field).
- **`ApiConfig.serverUrl` → `input`**: now accepts an http(s) URL **or a local file path** (`.json` / `.json5` / `.yaml` / `.yml`).
- **Config field renames**: `outputFilePath` → `output` (it is a directory), `defaultRequestLib` → `client` (via the short-lived `useDefaultRequestClient`), `topImportTemplate` → `importTemplate`.
- **Config file is no longer required**: `gen` works from a positional input; `apits.config.*` became an optional escape hatch (auto-discovered). Existing config files keep working after renaming `serverUrl` → `input`.
- **`ApiConfig.name` is now optional**: derived from the input host / file name (e.g. `http://localhost:3041/api-json` → `localhost.ts`, `./user.openapi.yaml` → `userOpenapi.ts`); duplicated derived names get an index suffix.
- Removed internal `ApiConfig.configIndex`.
- **`dist/` layout follows the `src/` restructure** (e.g. `dist/cjs/core/cli.js`); the `bin/apits` entry was updated in step. Only affects consumers importing internal paths.

### Features

- **Zero-config CLI**: `apits gen <input>` or just `apits <input>`; new flags `-o/--output`, `-n/--name`, `--base-url` (supports the `[code]:` prefix), `--no-client`, `-w/--watch` (watches a local document and regenerates on change, with debounce; remote inputs are ignored with a hint).
- **Local spec file support**: JSON, JSON5 and YAML documents can be generated from directly (`js-yaml` added).
- **Config file auto-discovery**: `apits.config.local.ts` → `apits.config.ts` → `apits.config.local.json` → `apits.config.json` → the `apits` field in `package.json`. CLI flags override config-file values; in config-file mode `-n/--name` selects which source(s) to run.
- **`init` demoted to optional scaffolding**: `apits init [input]` pre-fills the document address; running without any input now prints copy-pasteable hints instead of demanding a config file.
- **Name collision safety**: multi-source configs derive unique names so generated files never overwrite each other.

### Bug Fixes

- **CLI no longer hangs under background / redirected stdio** (CI, npm scripts): `swagger-client` synchronously blocked at `require()` time in that environment. It was only referenced by unreachable dead code and has been removed entirely.

### Dependency Cleanup

- `dependencies` tree now contains **zero deprecated packages**:
  - Removed unused `rimraf`, `download-git-repo` (and `@types/rimraf`).
  - `swagger-client` `3.35.6` → `3.38.2`, then **removed entirely** (see Bug Fixes above).
  - Replaced `vtils` and `to-json-schema` (pulled deprecated `lodash.isequal`) with local implementations `utils/vtilsLite.ts` and `utils/toJsonSchema.ts` (removed `@types/to-json-schema`).
  - Added `js-yaml` (+ `@types/js-yaml`) for YAML spec parsing.

### Code Refactor & Cleanup

- **`src/` restructured** into `core/` (`cli.ts`, `generator.ts`, `writeRequestClient.ts`) and `utils/` (9 utility/converter files); package entry `index.ts` and `types.ts` stay at the root so `main`/`module`/`types` are unchanged. All files are camelCase; `Generator.ts` → `generator.ts`, `genRequest.ts` → `writeRequestClient.ts` (paired with the `client` rename).
- **Dead code removed**: `modules/genIndex.ts`, `modules/dependenciesHandler.ts`, `modules/responseDataJsonSchemaHandler.ts` (runtime response-validation chain whose consumers no longer exist), `server/mock.ts`; JSDoc link / update-time / tag rendering that depended on fake YApi placeholder data.
- Unused imports and internal-only exports trimmed (verified via `tsc --noUnusedLocals/--noUnusedParameters`).
- Removed dead exported types `SharedConfig` (incl. the never-read `requestFunctionFilePath` and three never-invoked `getRequestFunctionName` / `getRequestDataTypeName` / `getResponseDataTypeName` hooks), `CommentConfig`, and `ChangeCase` — all had zero internal references and are superseded by the hardcoded naming in `Generator`.
- Type aliases now follow PascalCase: `importTemplateType` → `ImportTemplate`; the unused alias `requestFunctionTemplateType` was removed.

### Docs

- README rewritten: zero-config quick start, CLI option table, generated-output description, optional config file section.

---

## [0.0.5] - 2026-09-21

> Build toolchain upgrade, OpenAPI nullable support, path-param type fix, and code quality cleanup.

### Build & Toolchain

- **Output layout**: `lib/` + `es/` → `dist/cjs/` + `dist/esm/`; `main`/`module`/`types` and `files` updated accordingly.
- **Dependency upgrades**:
  - `prettier`: `^2.2.1` → `^3` — `prettier.format` is now async; `formatContent` returns `Promise<string>` and all call sites are `await`ed.
  - `typescript`: `^4.2.3` → `^5`
  - `father`: `^2.30.5` → `^4`
  - `@babel/runtime`: `^7.13.10` → `^7.29.7`
  - `change-case`: `^3.0.2` → `^3.1.0`
- **tsconfig.json**: `rootDir` set to `./src`; removed `allowJs`, `suppressImplicitAnyIndexErrors`; explicit `include: ["src"]`.
- **Config loader**: replaced `ts-node/register` (with manual `compilerOptions`) with `tsx/cjs/api`'s `register()`. Added `types/tsx-api.d.ts` ambient declaration so `moduleResolution: "node"` can resolve the `exports`-only subpath.

### Dependencies

- **Removed implicit `lodash` usage**: `lodash` was never declared in `dependencies` (relied on hoisting) and the hoisted `@types/lodash` was incomplete, breaking `.d.ts` generation under TS 5. Replaced `upperFirst` with a local implementation and dropped all `lodash` imports.

### Bug Fixes

- **`nullable` types now emit `T | null`**: `json-schema-to-typescript` silently ignores OpenAPI's `nullable` keyword. Added `nullable: true` → `type: [..., 'null']` normalization in both `processJsonSchema` and `preprocessSchema` (component schemas flow through the latter).
- **Path-param field types no longer render as string literals**: merging path/query params onto a `$ref` body used `JSON.stringify`, producing `{ userId: "string" }`. A new `jsonSchemaTypeToTs` helper builds the inline type string correctly, yielding `{ userId: string }`.
- **Degenerate body schema normalization**: when Nest fails to reflect a DTO (inline type / Prisma type / missing `@ApiBody({type})`), the body resolved to a bare primitive like `{ type: 'string' }`, producing `{ id: number } & string`. Non-object root types are now stripped so params attach cleanly.
- **`components.schemas` optional-chaining guard**: a valid OpenAPI document may omit `components` entirely; `Object.keys(components.schemas)` previously threw and aborted generation. Now uses `components?.schemas ?? {}`.
- **form-data request body support**: `openapi3Format` previously only read `application/json`, silently dropping form-encoded bodies. Now expands `multipart/form-data` and `x-www-form-urlencoded` schemas into individual `formData` parameters, marking `format: binary` fields as `file`.
- **`handleBodyPamras` simplified**: removed the no-op `isJson()` check (it re-parsed a value that had just been `JSON.stringify`'d from an object, so it could never fail); body is now always marked as JSON schema.

### Features

- **Request-type degradation warning**: added `isDegradedRequestType` to detect when a generated request type has collapsed to a primitive / empty object / index-signature-only / `& string` shape. A `console.warn` points the author to fix the backend `@Body()` / `@ApiBody` decorator.

### Code Cleanup

- Removed debug `console.log` blocks in `Generator.ts` (two `path.includes('/path')` guards) and four hardcoded `if (typeName === '...')` debug guards in `utils.ts` that leaked upstream business type names.
- Removed the dead `tsc()` method and its `os` / `child_process` imports.
- All source comments translated to English; stale commented-out code and internal defect IDs removed.

### Misc

- Lockfile switched from `yarn.lock` to `package-lock.json`.
- `test` script simplified to `tsx test/index.ts`.

---

## [0.0.4] - 2026-03-09

- Internal refactor and localization pass (source comments / messages).

## [0.0.2] - 2026-01-08

- Added `--name` option for `gen` and CLI `init`; version bump.

## [0.0.1] - 2025-10-13

- Initial 0.0.x release after the 2.x → 0.0.x version reset.
