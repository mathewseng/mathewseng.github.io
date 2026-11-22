/** Load the site's GNUbg evaluator from this checkout. */
import fs from 'node:fs';
import { createEvaluator } from '../../../engine/evaluate.mjs';
import engineFactory from '../../../engine/vendor/simd/gnubg-core-module.js';

const engineDir = new URL('../../../engine/vendor/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, engineDir));

export async function loadEvaluator() {
  const packed = read('gnubg-core-module.data');
  const data = packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength);
  const compiled = await WebAssembly.compile(read('simd/gnubg-core-module.wasm'));
  const module = await engineFactory({
    getPreloadedPackage: () => data,
    instantiateWasm(imports, receive) { const instance = new WebAssembly.Instance(compiled, imports); receive(instance, compiled); return instance.exports; },
    print: () => {}, printErr: v => process.stderr.write(v + '\n'),
  });
  return createEvaluator(module);
}
