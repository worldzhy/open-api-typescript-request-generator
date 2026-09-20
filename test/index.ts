/**
 * Minimal assertion-based entry point for `npm test`.
 *
 * The pre-existing test files (gen.ts / requestTest.ts / json-schema-to-typescript.ts
 * / to-json-schema.ts) are demo drivers that fetch a live spec and run the
 * generator without any assertions, so regressions pass silently. This file
 * pins the three P0 generator fixes (G-1 nullable, G-2 path-param literal,
 * G-3 degenerate body) so future edits cannot quietly reintroduce them.
 *
 * Run with: `npm test` (tsx watch test/index.ts).
 */
import assert from 'node:assert/strict';
import { processJsonSchema, jsonSchemaToTsCode, getRequestDataJsonSchema } from '../src/utils';
import { RequestBodyType, Required } from '../src/types';

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  // G-1: OpenAPI `nullable: true` must normalize to JSON Schema `type: [..., 'null']`
  // so json-schema-to-typescript emits `T | null`. Before the fix,
  // `processJsonSchema` returned early and `nullable` was silently dropped.
  // ---------------------------------------------------------------------------

  // Scalar string + nullable -> type array with 'null', nullable removed.
  const nullableString = processJsonSchema({ type: 'string', nullable: true } as any);
  assert.ok(Array.isArray(nullableString.type), 'G-1: type should become an array');
  assert.deepStrictEqual(nullableString.type, ['string', 'null']);
  assert.strictEqual(nullableString.nullable, undefined, 'G-1: nullable flag must be removed');

  // Nested property nullable is normalized by the recursive walker.
  const nested = processJsonSchema({
    type: 'object',
    properties: { middleName: { type: 'string', nullable: true } }
  } as any);
  assert.deepStrictEqual(
    nested.properties!.middleName.type,
    ['string', 'null'],
    'G-1: nested nullable property should normalize'
  );

  // Enum schema + nullable -> null literal appended to the enum array.
  const enumNullable = processJsonSchema({ enum: ['active', 'archived'], nullable: true } as any);
  assert.ok(enumNullable.enum.includes(null), 'G-1: enum should include null');
  assert.strictEqual(enumNullable.nullable, undefined);

  // ---------------------------------------------------------------------------
  // G-3: A degenerate request body (bare primitive like `{type:'string'}`,
  // produced when Nest cannot reflect a DTO schema) must be coerced to an
  // object-less schema so path/query params merge cleanly instead of
  // producing `{id: number} & string`.
  // ---------------------------------------------------------------------------

  const interfaceInfo = {
    req_body_type: RequestBodyType.json,
    req_body_other: JSON.stringify({ type: 'string' }),
    req_body_is_json_schema: true,
    req_query: [],
    req_params: [
      { name: 'id', type: 'integer', required: Required.true, desc: 'path id' }
    ]
  } as any;

  const requestSchema = getRequestDataJsonSchema(interfaceInfo);
  assert.strictEqual(
    requestSchema.type,
    undefined,
    'G-3: degenerate body type should be stripped before merge'
  );
  assert.ok(
    requestSchema.properties && requestSchema.properties.id,
    'G-3: path param should attach to the coerced schema'
  );

  // ---------------------------------------------------------------------------
  // G-2: Merging path params onto a `$ref` body must emit `Ref & { id: number }`
  // and never serialize type names as string literals (`{id: "integer"}` ->
  // `id: "integer"` is a string-literal type, not a number).
  // G-3 (end-to-end): the compiled type must not contain `& string`.
  // ---------------------------------------------------------------------------

  const refSchema = {
    $ref: '#/components/schemas/UpdateUserDto',
    properties: { id: { type: 'integer' } },
    required: ['id']
  };
  const refCode = await jsonSchemaToTsCode(refSchema as any, 'PatchUserRequest');
  assert.ok(refCode.includes('UpdateUserDto'), `G-2: should reference UpdateUserDto. Got: ${refCode}`);
  assert.ok(/id:\s*number/.test(refCode), `G-2: should map integer path param to number. Got: ${refCode}`);
  assert.ok(
    !/["']string["']/.test(refCode) && !/["']integer["']/.test(refCode),
    `G-2: must not serialize type names as string literals. Got: ${refCode}`
  );
  assert.ok(!/&\s*string/.test(refCode), `G-3: must not contain '& string'. Got: ${refCode}`);

  // Degenerate-body path: compile the G-3 schema and assert no `& string`.
  const degenerateCode = await jsonSchemaToTsCode(requestSchema, 'PatchXxxRequest');
  assert.ok(!/&\s*string/.test(degenerateCode), `G-3: no '& string' in compiled type. Got: ${degenerateCode}`);

  console.log('\n  ✓ all generator regression tests passed (G-1, G-2, G-3)\n');
}

main().catch(err => {
  console.error('\n  ✗ test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
