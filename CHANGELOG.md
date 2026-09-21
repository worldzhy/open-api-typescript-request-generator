# Change Log

All notable changes to this project will be documented in this file.

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
