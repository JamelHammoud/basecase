import copy from './copy.mjs';
import noComments from './no-comments.mjs';
import noNestedIf from './no-nested-if.mjs';
import noRestTupleParams from './no-rest-tuple-params.mjs';

export default {
  meta: { name: 'basecase' },
  rules: {
    copy,
    'no-comments': noComments,
    'no-nested-if': noNestedIf,
    'no-rest-tuple-params': noRestTupleParams,
  },
};
