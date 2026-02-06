/**
 * Patch ncc CJS bundle so our TS modules' exports work at runtime.
 * ncc passes the second argument as __webpack_exports__, but TypeScript's CJS
 * output uses the identifier `exports`. In Node the bundle runs inside the
 * top-level module wrapper, so `exports` in submodules refers to the wrong
 * object. Renaming the parameter to `exports` fixes it.
 */
const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'dist', 'index.cjs');
let code = fs.readFileSync(bundlePath, 'utf8');

// Module wrapper parameter: so body's `exports.xxx =` assigns to the correct object
code = code.replace(
  /, __webpack_exports__, __nccwpck_require__\)/g,
  ', exports, __nccwpck_require__)'
);
code = code.replace(
  /__nccwpck_require__\.r\(__webpack_exports__\)/g,
  '__nccwpck_require__.r(exports)'
);

fs.writeFileSync(bundlePath, code);
console.log('Patched dist/index.cjs (ncc exports fix)');
