
import toJsonSchema from '../src/utils/toJsonSchema';
const json = {};

const schema = toJsonSchema(json, {
  required: false,
  arrays: {
    mode: 'first'
  },
  objects: {
    additionalProperties: false
  },
  strings: {
    detectFormat: false
  },
  postProcessFnc: (type, schema, value) => {
    if (!schema.description && !!value && type !== 'object') {
      schema.description = JSON.stringify(value);
    }
    return schema;
  }
});
console.log(schema)
