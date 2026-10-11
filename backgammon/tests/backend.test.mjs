import test from "node:test";
import assert from "node:assert/strict";
import {supportsSIMD,backendPath} from "../engine/backend.mjs";
test("SIMD feature detection validates a real vector module and safely rejects unavailable support",()=>{
  let module;
  assert.equal(supportsSIMD({validate(bytes){module=bytes;return true;}}),true);
  assert.ok(WebAssembly.validate(module));
  assert.equal(supportsSIMD({validate:()=>false}),false);
  assert.equal(supportsSIMD({validate(){throw Error("Unavailable");}}),false);
  assert.equal(supportsSIMD(null),false);
  assert.equal(backendPath("scalar"),"./vendor/");
  assert.equal(backendPath("simd"),"./vendor/simd/");
});
