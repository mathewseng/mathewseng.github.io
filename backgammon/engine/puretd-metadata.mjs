// SPDX-License-Identifier: GPL-3.0-or-later
export const PURETD = Object.freeze({
  "id": "puretd/18b0a80+money-wasm-v1",
  "name": "PureTD money",
  "file": "money.bin",
  "source": "https://github.com/alexstrehl/backgammon-ai-engine/tree/18b0a80d258e388a2ed04b0f9d81993fb6723e1b",
  "sourceCommit": "18b0a80d258e388a2ed04b0f9d81993fb6723e1b",
  "model": "cubeful_money_512_512_256_256",
  "modelSHA256": "2cd329209d05f4652b79c095df585c0eddbbc6b8f8b6901eb4bfce7ace8f1a96",
  "assets": {
    "LICENSE.txt": "26b57ef5384622abc95dc005338f68fea2c650e7b0685bc5a3f5ab7e6ed292d2",
    "money-wide.bin": "cd48b1bb58ed4a7c903c030b33d36467127b3e3b5ad0410dc8cf770e0d2d109f",
    "money.bin": "2cd329209d05f4652b79c095df585c0eddbbc6b8f8b6901eb4bfce7ace8f1a96",
    "puretd-module.mjs": "e1075c1d195cc97cf3dca7798f5dcf1dfa24a705454c6b7828604eff932928c0",
    "puretd-module.wasm": "e4d55fc888e100435997471adad2f02252d35eda85c55042c5358e1dee354040",
    "scalar/puretd-module.mjs": "e1075c1d195cc97cf3dca7798f5dcf1dfa24a705454c6b7828604eff932928c0",
    "scalar/puretd-module.wasm": "8f097c8321ca5a73af425a1a36524ca5c74bac27a17232a0d83ae1dcc6f975dc"
  }
});
export const PURETD_WIDE = Object.freeze({...PURETD, ...{
  "id": "puretd/18b0a80+wide-wasm-v1",
  "name": "PureTD wide",
  "file": "money-wide.bin",
  "model": "cubeful_money_768_768_256_256_256",
  "modelSHA256": "cd48b1bb58ed4a7c903c030b33d36467127b3e3b5ad0410dc8cf770e0d2d109f"
}});
