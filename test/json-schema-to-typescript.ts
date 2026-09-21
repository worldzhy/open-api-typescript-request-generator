import { compile } from 'json-schema-to-typescript';
import { JSONSchema4 } from 'json-schema';
import { preprocessSchema } from '../src/utils/utils';

const jsonSchema: JSONSchema4 = {
  type: 'object',
  required: ['pagination', 'test'],
  properties: {
    pagination: {
      type: 'object',
      properties: {
        countOfCurrentPage: { type: 'number', description: 'Number of items in the current page' },
        countOfTotal: { type: 'number', description: 'Total number of items across all pages' },
        page: { type: 'number', description: 'Page number, starts from 0' },
        pageSize: { type: 'number', description: 'Page size, the number of items per page' }
      },
      required: ['countOfCurrentPage', 'countOfTotal', 'page', 'pageSize'],
      description: 'Pagination information for the response'
    },
    test: {
      tsType: 'InterfaceAAA'
    },
    enumEmptyTest: {
      "type": "number",
      "enum": [],
    }
  }
};

const fakeTypeName = 'THISISAFAKETYPENAME';
// 预处理schema后再编译
const processedSchema = preprocessSchema(jsonSchema);
compile(processedSchema, fakeTypeName).then(res => {
  console.log(res);
});
