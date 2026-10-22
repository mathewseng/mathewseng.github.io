const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), crypto=require("node:crypto");
const E=require("../engine.js"), catalog=require("../catalog.js");
test("all 44 encounters have unique names, unique artwork, and the right race",()=>{
  assert.deepEqual(Object.keys(catalog).sort(),E.makeDeck().map(c=>c.id).sort());
  const names=new Set(), images=new Set();
  for(const c of E.makeDeck()){
    const entry=catalog[c.id]; assert.ok(!names.has(entry.name),entry.name); names.add(entry.name);
    assert.equal(entry.race,c.suit==="s"?"Hollow Court":c.suit==="c"?"Briarborn":null);
    const bytes=fs.readFileSync(path.join(__dirname,"..",entry.image));assert.ok(bytes.length>4000,entry.image);
    const hash=crypto.createHash("sha256").update(bytes).digest("hex");assert.ok(!images.has(hash),entry.image+" is unique art");images.add(hash);
  }
  assert.equal(images.size,44);
});
