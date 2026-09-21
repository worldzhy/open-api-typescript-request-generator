/**
 * Minimal JSON-value → JSON-Schema converter tailored to the options used by
 * this project. Replaces the `to-json-schema` dependency, which transitively
 * pulls in the deprecated `lodash.isequal` package.
 *
 * Supported options (the only combination used in this repo):
 *   - required: false           (never marks fields required)
 *   - arrays.mode: 'first'      (array items schema = schema of first item)
 *   - objects.additionalProperties: false
 *   - strings.detectFormat: false
 *   - postProcessFnc(type, schema, value, defaultFn)
 */

type JsonSchema = Record<string, any>;

interface ToJsonSchemaOptions {
  required?: boolean;
  arrays?: { mode?: 'first' | 'all' | 'uniform' | 'tuple' };
  objects?: { additionalProperties?: boolean };
  strings?: { detectFormat?: boolean };
  postProcessFnc?: (type: string, schema: JsonSchema, value: any, defaultFn: () => JsonSchema) => JsonSchema;
}

function getType(val: any): string | undefined {
  if (typeof val === 'string') return 'string';
  if (typeof val === 'number' && isFinite(val)) {
    return val % 1 === 0 ? 'integer' : 'number';
  }
  if (typeof val === 'boolean') return 'boolean';
  if (Array.isArray(val)) return 'array';
  if (val === null) return 'null';
  if (val instanceof Date) return 'date';
  if (val && typeof val === 'object') return 'object';
  return undefined;
}

function getSchema(value: any, options: ToJsonSchemaOptions): JsonSchema {
  const type = getType(value);
  if (!type) {
    throw new Error("Type of value couldn't be determined");
  }

  let schema: JsonSchema;

  switch (type) {
    case 'object': {
      schema = { type: 'object' };
      const keys = Object.keys(value);
      if (keys.length > 0) {
        schema.properties = keys.reduce<Record<string, JsonSchema>>((acc, key) => {
          acc[key] = getSchema(value[key], options);
          return acc;
        }, {});
      }
      if (options.objects?.additionalProperties === false && keys.length > 0) {
        schema.additionalProperties = false;
      }
      break;
    }
    case 'array': {
      schema = { type: 'array' };
      if (value.length > 0 && options.arrays?.mode === 'first') {
        schema.items = getSchema(value[0], options);
      }
      break;
    }
    case 'string':
      schema = { type: 'string' };
      break;
    default:
      schema = { type };
  }

  // postProcessFnc replaces the default common post-processor.
  if (options.postProcessFnc) {
    schema = options.postProcessFnc(type, schema, value, () => schema);
  }

  return schema;
}

export default function toJsonSchema(value: any, options: ToJsonSchemaOptions = {}): JsonSchema {
  return getSchema(value, options);
}
