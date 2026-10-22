const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), crypto=require("node:crypto");
const E=require("../engine.js"), catalog=require("../catalog.js");
test("all 44 encounters have unique names, unique artwork, and the right race",()=>{
  assert.deepEqual(Object.keys(catalog).sort(),E.makeDeck().map(c=>c.id).sort());
  const names=new Set(), images=new Set();
  for(const c of E.makeDeck()){
    const entry=catalog[c.id]; assert.ok(!names.has(entry.name),entry.name); names.add(entry.name);
    assert.equal(entry.race,c.suit==="s"?"Stonekin":c.suit==="c"?"Treefolk":null);
    const bytes=fs.readFileSync(path.join(__dirname,"..",entry.image));assert.ok(bytes.length>4000,entry.image);
    const thumbnail=fs.readFileSync(path.join(__dirname,"..",entry.image.replace("/cards/","/cards/thumbs/")));
    assert.ok(thumbnail.length>4000&&thumbnail.length<bytes.length,entry.image+" has a smaller responsive thumbnail");
    const hash=crypto.createHash("sha256").update(bytes).digest("hex");assert.ok(!images.has(hash),entry.image+" is unique art");images.add(hash);
  }
  assert.equal(images.size,44);
});
test("Ash & Briar keeps distinct names, weapon types, red targets and exact art provenance",()=>{
  const words=new Set();
  for(const entry of Object.values(catalog))for(const word of entry.name.toLowerCase().replace(/'s\b/g,"").match(/[a-z]+/g)){
    if(["the","of"].includes(word))continue;
    assert.ok(!words.has(word),word+" is repeated in the naming set");words.add(word);
  }
  const weapons=Object.values(catalog).filter(entry=>entry.id.endsWith("d"));
  assert.equal(new Set(weapons.map(entry=>entry.weaponType)).size,9);
  const potions=Object.values(catalog).filter(entry=>entry.id.endsWith("h"));
  assert.equal(new Set(potions.map(entry=>entry.potionColor.target)).size,9);
  for(const entry of potions){const hex=entry.potionColor.target;assert.match(hex,/^#[0-9A-F]{6}$/);assert.ok(parseInt(hex.slice(1,3),16)>Math.max(parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)),hex+" is in the red family");}
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../art-prompts.json"),"utf8"));
  assert.equal(manifest.edition,"Ash & Briar · 2026-10-22");
  assert.deepEqual(manifest.images.map(image=>image.id).sort(),Object.keys(catalog).sort());
  for(const image of manifest.images){
    assert.equal(image.name,catalog[image.id].name);assert.equal(image.path,catalog[image.id].image);
    assert.equal(image.sha256,crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"..",image.path))).digest("hex"));
    assert.ok(image.prompt.length>300,"exact prompt for "+image.id);
  }
});
