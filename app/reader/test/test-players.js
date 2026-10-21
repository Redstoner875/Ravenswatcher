'use strict';
const assert = require('assert/strict');
const { readPlayerPositions } = require('../players');
const { readState, CURRENT_MAP_ID } = require('../state');
const { model, orientation, inverseOrientation, group, enabled, typeKey } = require('../../web/poi-map');
function main() {
  const mem = new Map(), c = 0x20000, e = 0x30000, vt = 0x40000;
  const put = (a, b) => { for (let i=0;i<b.length;i++) mem.set(a+i,b[i]); };
  const ptr = (a, v) => { const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));put(a,b); };
  const float = (a, v) => { const b=Buffer.alloc(4);b.writeFloatLE(v);put(a,b); };
  const proc = { read(a,n){const b=Buffer.alloc(n);for(let i=0;i<n;i++){if(!mem.has(a+i))return null;b[i]=mem.get(a+i);}return b;},readPtr(a){const b=this.read(a,8);return b?Number(b.readBigUInt64LE()):null;} };
  ptr(c,vt);ptr(c+8,e);ptr(e+0x30,0x50000);float(e+0x2e0,10);float(e+0x2e4,3);float(e+0x2e8,-25);
  const tracking={addresses:[c,c],vtable:vt,mapId:0};
  assert.deepEqual(readPlayerPositions(proc,tracking,0),[{id:c.toString(16),position:{x:10,y:-25,z:3}}]);
  const settings=0x60000, nameAddress=0x70000, hero='Hero_Fixture_Skin';
  ptr(e+0x28,settings);ptr(settings+8,nameAddress);
  const length=Buffer.alloc(8);length.writeUInt32LE(hero.length);put(settings+16,length);put(nameAddress,Buffer.from(hero));
  assert.equal(readPlayerPositions(proc,tracking,0)[0].hero,hero);
  length.writeUInt32LE(300);put(settings+16,length);
  assert.equal(readPlayerPositions(proc,tracking,0)[0].hero,undefined); // broken identity preserves position
  length.writeUInt32LE(hero.length);put(settings+16,length);
  float(e+0x2e0,40);assert.equal(readPlayerPositions(proc,tracking,0)[0].position.x,40); // reread, no discovery scan
  assert.deepEqual(readPlayerPositions(proc,tracking,1),[]);assert.deepEqual(readPlayerPositions(proc,tracking,-1),[]);
  assert.deepEqual(readPlayerPositions(proc,null,0),[]);
  ptr(e+0x30,0);assert.deepEqual(readPlayerPositions(proc,tracking,0),[]);ptr(e+0x30,0x50000);
  ptr(c,vt+8);assert.deepEqual(readPlayerPositions(proc,tracking,0),[]);ptr(c,vt);
  float(e+0x2e8,NaN);assert.deepEqual(readPlayerPositions(proc,tracking,0),[]);float(e+0x2e8,0);
  mem.delete(e+0x2e4);assert.deepEqual(readPlayerPositions(proc,tracking,0),[]);
  const position={x:0,y:0,z:0};
  assert.equal(readState(null,{values:{},players:[{id:'test',position}]}).players.length,1);
  let received;
  const src={get:n=>n===CURRENT_MAP_ID?0:null,maps:()=>({}),players:map=>{received=map;return [{id:'hero',position}];}};
  assert.equal(readState(src).players[0].id,'hero');assert.equal(received,0);
  const samples=[['3x3_Crystal_01','crystals'],['DreamCrystal_Big','crystals'],['6x6_Teleporter_01','teleporters'],['6x6_Healing_01','healing'],['Dark_Hills_Basic_Chest_T1','chests'],['6x6_Collectible_Key','keys'],['3x3_Blocker_01','scenery'],['Enemy_Camp_Wandering','camps'],['NewUnknownThing','other']];
  const prefs={groups:{},types:{}};
  for(const [name,g] of samples){const t={name,source:'category'};assert.equal(group(t),g);}
  const crystal={name:'DreamCrystal_Big',source:'selector'};
  assert.equal(enabled(crystal,prefs),true);prefs.groups.crystals=false;assert.equal(enabled(crystal,prefs),false);
  prefs.types[typeKey(crystal)]=true;assert.equal(enabled(crystal,prefs),true);
  assert.equal(enabled({name:'NewUnknownThing',source:'category'},{groups:{},types:{}}),false);
  for(const name of ['3x3_Crystal_01','3x3_Crystal_02','6x6_Crystal_01','Crystal01','6x6_Teleporter_01','3x3_Cart_3Pigs_Material','40x40_Enemy_Camp','3x3_Blocker_01','UnrecognisedResource']) {
    assert.equal(enabled({name,source:'category'},{groups:{},types:{}}),false,name);
  }
  for(const name of ['DreamCrystal_Big','40x40_Old_Shipyard_CrystalField','Basic_Chest_T1','Collectible_Key','Healing_01','Enemy_Wandering']) {
    assert.equal(enabled({name,source:'category'},{groups:{},types:{}}),true,name);
  }
  assert.deepEqual(model([{position},{position:{x:100,y:100,z:0}}]).project(position),{x:150,y:550});
  // Approximate landmark directions measured from the supplied screenshots.
  // Input deltas are world X/Y recovered from the prior unrotated screen axes.
  const chest=orientation({x:135,y:-1},'game');
  const book=orientation({x:-99,y:-67},'game');
  const quest=orientation({x:-21,y:-200},'game');
  const target=orientation({x:246,y:-149},'game');
  assert.ok(chest.x>0 && chest.y>0); // green chest: below-right of player
  assert.ok(book.x<0 && book.y<0 && Math.abs(book.y)>3*Math.abs(book.x));
  assert.ok(quest.x>0 && quest.y<0); // quest marker: above-right
  assert.ok(target.x>0 && target.y>0 && target.x>2*target.y);
  for(const mode of ['game','world',...[-180,-92.3,0,37.5,180].flatMap(rotation=>[true,false].map(flipY=>({rotation,flipY})))]) {
    const p={x:-123.45,y:67.89};const back=inverseOrientation(orientation(p,mode),mode);
    assert.ok(Math.hypot(p.x-back.x,p.y-back.y)<1e-10);
    const rotated=orientation(p,mode);assert.ok(Math.abs(Math.hypot(p.x,p.y)-Math.hypot(rotated.x,rotated.y))<1e-10);
    const m=model([{position:p},{position:{x:100,y:100,z:0}}],'surface',mode),v=m.world(m.project(p));
    assert.ok(Math.hypot(v.x-p.x,v.y-p.y)<1e-10);
  }
  console.log('PASS screenshot landmark directions, orientation inverses and distance preservation');
  console.log('PASS player position refresh, stale/wrong/retired hero guards, state propagation, grouping and resource visibility overrides');return 0;
}
if(require.main===module) main();
module.exports={main};
