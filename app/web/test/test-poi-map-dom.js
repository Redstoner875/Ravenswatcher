// Optional DOM checks: install jsdom in a separate tool directory and expose it through NODE_PATH.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const dom = new JSDOM(fs.readFileSync(root + '/app/web/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://fixture.test' });
const w = dom.window, d = w.document;
w.eval(fs.readFileSync(root + '/app/web/poi-map.js', 'utf8'));
const panel = d.getElementById('poi-map-panel'); panel.open = true;
const coord = (x,y,z=0) => ({x,y,z});
const spawnNames = ['40x40_Dark_Hills_Start_Update3', '64x64_Storm_Island_Starting_Tile_Update3', '40x40_Avalon_Starting_Tile_Update3'];
spawnNames.forEach((name, map_id) => {
  const spawn = { id:'spawn', name, label:'Spawn area', icon:'map_spawn.png', source:'category', position:coord(0,0) };
  w.PoiMap.render({ map_id, map_tiles:[spawn] });
  assert.equal(d.querySelectorAll('.poi-marker').length, 1);
  assert.ok(d.querySelector('[data-group-toggle="spawn"]'));
  assert.match(d.querySelector('.poi-marker image').getAttribute('href'), /map_spawn\.png$/);
  d.querySelector('[data-group-toggle="spawn"]').click();
  assert.equal(d.querySelectorAll('.poi-marker').length, 0);
  d.getElementById('poi-map-defaults').click();
  assert.equal(d.querySelectorAll('.poi-marker').length, 1);
});
const one = { id:'a', name:'<img src=x onerror=bad()>', label:'Chest', icon:'chest.png', tier:1, outline:'map_chest_outline.png', source:'selector', position:coord(-120,240) };
const two = { ...one, id:'b', name:'Camp', label:'Camp', source:'category', position:coord(360,0) };
const interior = { ...one, id:'c', name:'Room', source:'sublevel', position:coord(10,20) };
const missing = { ...one, id:'d', name:'Unknown', position:null };
w.PoiMap.render({ map_id:0, map_tiles:[one,two,interior,missing] });
assert.equal(d.querySelectorAll('.poi-marker').length,2);
assert.equal(d.querySelectorAll('#poi-map-rows tr').length,3);
assert.match(d.getElementById('poi-map-status').textContent,/2 of 3 placements positioned/);
assert.equal(d.querySelector('#poi-map-rows img'),null);
d.querySelector('.poi-marker').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));
assert.match(d.getElementById('poi-map-selection').textContent,/X -120, Y 240/);
const layer = d.getElementById('poi-map-layer'); layer.value = 'sublevel'; layer.dispatchEvent(new w.Event('change'));
assert.equal(d.querySelectorAll('.poi-marker').length,1);
layer.value = 'all'; layer.dispatchEvent(new w.Event('change')); assert.equal(d.querySelectorAll('.poi-marker').length,3);
// Zoom and pan with browser coordinate-transform calls stubbed only for jsdom.
const svg = d.getElementById('poi-map');
svg.createSVGPoint = () => ({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y}}});
svg.getScreenCTM = () => ({inverse(){return {}}});
svg.setPointerCapture = () => {};
svg.dispatchEvent(new w.WheelEvent('wheel',{deltaY:-1,clientX:400,clientY:300,cancelable:true}));
assert.ok(Number(svg.getAttribute('viewBox').split(' ')[2]) < 800);
svg.dispatchEvent(new w.MouseEvent('pointerdown',{button:0,clientX:100,clientY:100}));
svg.dispatchEvent(new w.MouseEvent('pointermove',{clientX:150,clientY:130}));
assert.notEqual(svg.getAttribute('viewBox').split(' ')[0], '0');
d.getElementById('poi-map-fit').click(); assert.equal(svg.getAttribute('viewBox'),'0 0 800 600');
let download, exported;
w.URL.createObjectURL = b => {exported=b;return 'blob:test'}; w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function(){download=this.download};
d.getElementById('poi-map-export').click(); assert.ok(exported); assert.equal(download,'ravenswatch-pois-0.json');
w.PoiMap.render({ map_id:1,map_tiles:null }); assert.equal(d.querySelectorAll('.poi-marker').length,0); assert.match(d.getElementById('poi-map-status').textContent,/Waiting/);
w.PoiMap.render({ map_id:1,map_tiles:[] }); assert.match(d.getElementById('poi-map-status').textContent,/0 of 0/);
assert.equal(d.querySelectorAll('#tiles-list').length,1);
assert.equal(d.getElementById('tiles').children.length,2); // header and original roster, no implicit grid row
assert.equal(svg.querySelectorAll('circle').length,0);
assert.equal(svg.querySelector('image')?.getAttribute('width'),undefined); // roster is empty here
const crystal={id:'crystal',name:'DreamCrystal_Big',label:'Big Dream Crystal',source:'category',icon:'map_crystal.png',outline:'map_crystal_outline.png',tier:2,position:coord(0,0)};
const teleporter={id:'tp',name:'6x6_Teleporter_01',source:'category',position:coord(100,100)};
const scenery={id:'scenery',name:'3x3_Blocker_01',source:'category',position:coord(200,200)};
const fixture={map_id:0,map_tiles:[crystal,teleporter,scenery],players:[{id:'hero-a',position:coord(20,20)}]};
w.PoiMap.render(fixture);
assert.equal(d.querySelectorAll('.poi-marker').length,1); // only real POIs start visible
assert.equal(d.querySelectorAll('.poi-player').length,1);
assert.equal(d.getElementById('poi-map-player').value,'hero-a');
assert.match(d.getElementById('poi-map-player-status').textContent,/Tracking your character/);
assert.equal(svg.querySelector('.poi-marker image').getAttribute('width'),'75');
assert.equal(d.getElementById('poi-map-icon-size').value,'75');
assert.equal(d.getElementById('poi-map-icon-size').max,'150');
assert.equal(svg.querySelector('.poi-marker .poi-graphic rect').getAttribute('fill'),'#ffff00');
assert.equal(svg.querySelectorAll('circle').length,0);
assert.equal(d.getElementById('poi-map-rotation').value,'0');
const slider=d.getElementById('poi-map-rotation'), degrees=d.getElementById('poi-map-rotation-number');
const originalTransform=d.querySelector('.poi-marker').getAttribute('transform');
slider.value='37.5';slider.dispatchEvent(new w.Event('input'));
assert.notEqual(d.querySelector('.poi-marker').getAttribute('transform'),originalTransform);
assert.equal(degrees.value,'37.5');
assert.equal(JSON.parse(w.localStorage.getItem('ravenswatch:poi-map:v2')).rotation,37.5);
degrees.value='-23.4';degrees.dispatchEvent(new w.Event('input'));assert.equal(slider.value,'-23.4');
d.getElementById('poi-map-rotate-right').click();assert.equal(degrees.value,'-8.4');
d.getElementById('poi-map-rotate-left').click();assert.equal(degrees.value,'-23.4');
d.getElementById('poi-map-flip-y').click();assert.equal(JSON.parse(w.localStorage.getItem('ravenswatch:poi-map:v2')).flipY,false);
d.getElementById('poi-map-reset-rotation').click();assert.equal(degrees.value,'0');assert.equal(d.getElementById('poi-map-flip-y').checked,true);
const before=d.querySelector('.poi-marker').getAttribute('transform');
d.getElementById('poi-map-show-all').click();assert.equal(d.querySelectorAll('.poi-marker').length,3);
assert.equal(d.querySelector('.poi-marker').getAttribute('transform'),before); // filters do not rescale the map
const crystalToggle=d.querySelector('[data-group-toggle="crystals"]');crystalToggle.click();
assert.equal(d.querySelectorAll('.poi-marker').length,2);
const leaf=[...d.querySelectorAll('[data-type-key]')].find(n=>n.dataset.typeKey.includes('DreamCrystal_Big'));leaf.click();
assert.equal(d.querySelectorAll('.poi-marker').length,3);
d.getElementById('poi-map-hide-all').click();assert.equal(d.querySelectorAll('.poi-marker').length,0);assert.equal(d.querySelectorAll('.poi-player').length,1);
d.getElementById('poi-map-defaults').click();assert.equal(d.querySelectorAll('.poi-marker').length,1);
const size=d.getElementById('poi-map-icon-size');size.value='56';size.dispatchEvent(new w.Event('input'));
assert.equal(svg.querySelector('.poi-marker image').getAttribute('width'),'56');
assert.equal(JSON.parse(w.localStorage.getItem('ravenswatch:poi-map:v2')).size,56);
const marker=d.querySelector('.poi-marker');marker.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter'}));
assert.match(d.getElementById('poi-map-selection').textContent,/28.3 units from you/);
w.PoiMap.render({...fixture,players:[{id:'hero-a',position:coord(30,30)}]});
assert.equal(d.querySelector('.poi-marker'),marker); // player frames do not rebuild POI controls or markers
assert.match(d.getElementById('poi-map-selection').textContent,/42.4 units from you/);
const follow=d.getElementById('poi-map-follow');follow.click();assert.notEqual(svg.getAttribute('viewBox'),'0 0 800 600');
const show=d.getElementById('poi-map-show-players');show.click();assert.equal(d.querySelectorAll('.poi-player').length,0);show.click();
w.PoiMap.render({...fixture,players:[{id:'hero-a',position:coord(30,30)},{id:'hero-b',position:coord(80,80)}]});
assert.equal(d.getElementById('poi-map-player').value,''); // no guessed local identity in co-op
const playerSelect=d.getElementById('poi-map-player');playerSelect.value='hero-b';playerSelect.dispatchEvent(new w.Event('change'));
assert.match(d.getElementById('poi-map-player-status').textContent,/X 80.0/);
assert.equal(d.querySelectorAll('.poi-player').length,2);
w.PoiMap.render({...fixture,players:[]});assert.equal(d.querySelectorAll('.poi-player').length,0);
assert.match(d.getElementById('poi-map-player-status').textContent,/unavailable/);
// Completion belongs to one placement, not every POI sharing its artwork/name.
const secondCrystal={...crystal,id:'crystal-two',position:coord(50,50)};
const duplicateFixture={...fixture,map_tiles:[crystal,secondCrystal,teleporter,scenery]};
w.PoiMap.render(duplicateFixture);
const firstDone=d.querySelector('[data-poi-id="crystal"]'), secondDone=d.querySelector('[data-poi-id="crystal-two"]');
// The earlier keyboard selection marked the first crystal completed.
assert.equal(firstDone.getAttribute('aria-pressed'),'true');assert.equal(secondDone.getAttribute('aria-pressed'),'false');
assert.equal(firstDone.querySelector('.poi-completed-x').style.display,'');
assert.ok(firstDone.classList.contains('poi-completed'));
firstDone.dispatchEvent(new w.MouseEvent('click'));assert.equal(firstDone.getAttribute('aria-pressed'),'false');
firstDone.dispatchEvent(new w.MouseEvent('click'));assert.equal(firstDone.getAttribute('aria-pressed'),'true');
d.getElementById('poi-map-hide-all').click();d.getElementById('poi-map-show-all').click();
assert.equal(d.querySelector('[data-poi-id="crystal"]').getAttribute('aria-pressed'),'true');
assert.equal(d.querySelector('[data-poi-id="crystal-two"]').getAttribute('aria-pressed'),'false');
slider.value='18';slider.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('[data-poi-id="crystal"]').getAttribute('aria-pressed'),'true');
d.getElementById('poi-map-clear-completed').click();assert.equal(d.querySelectorAll('.poi-completed').length,0);
d.querySelector('[data-poi-id="crystal"]').dispatchEvent(new w.MouseEvent('click'));
w.PoiMap.render({...duplicateFixture,map_id:3});assert.equal(d.querySelectorAll('.poi-completed').length,0);
console.log('PASS singular completion toggles, gray/X state, duplicate isolation, filter persistence, clear and map reset');
w.PoiMap.render({...fixture,no_run:true});assert.equal(d.querySelectorAll('.poi-player').length,0);assert.equal(d.querySelectorAll('.poi-marker').length,0);
console.log('PASS filters, individual types, stable bounds, larger icons, colored masks without circles, persistence, player updates, manual co-op choice, follow and distance');
console.log('PASS DOM rendering, marker selection, layer controls, safe resource labels, missing/loading states, pan/zoom/fit handlers, export and original panel structure');
degrees.value='999';degrees.dispatchEvent(new w.Event('input'));degrees.dispatchEvent(new w.Event('change'));assert.equal(degrees.value,'180');
degrees.value='';degrees.dispatchEvent(new w.Event('input'));degrees.dispatchEvent(new w.Event('change'));assert.equal(degrees.value,'180');
slider.value='112.5';slider.dispatchEvent(new w.Event('input'));d.getElementById('poi-map-flip-y').click();
const settings=w.localStorage.getItem('ravenswatch:poi-map:v2');
const reopened=new JSDOM(fs.readFileSync(root+'/app/web/index.html','utf8'),{runScripts:'outside-only',url:'https://fixture.test'});
reopened.window.localStorage.setItem('ravenswatch:poi-map:v2',settings);
reopened.window.eval(fs.readFileSync(root+'/app/web/poi-map.js','utf8'));
assert.equal(reopened.window.document.getElementById('poi-map-rotation').value,'112.5');
assert.equal(reopened.window.document.getElementById('poi-map-flip-y').checked,false);
assert.equal(reopened.window.document.getElementById('poi-map-icon-size').value,'56');
reopened.window.close();
console.log('PASS manual rotation controls, fractional degrees, bounds, reset, flip and saved settings reload');
// New POI groups do not inherit the saved Scenery visibility switch.
const harp={id:'harp',name:'6x6_Ruin_01',source:'category',position:coord(-109,-156.5),icon:'map_harp.png'};
const sacrifice={id:'sacrifice',name:'6x6_Bleeding_01',source:'category',position:coord(-164,-134),icon:'map_sacrificial_altar.png'};
w.PoiMap.render({map_id:0,map_name:'Dark Hills',map_tiles:[harp,sacrifice,scenery],players:[{id:'hero',position:coord(-123,-128,8)}]});
d.getElementById('poi-map-defaults').click();
assert.equal(d.querySelectorAll('.poi-marker').length,2);
assert.equal(w.PoiMap.group(harp),'harps');assert.equal(w.PoiMap.group(sacrifice),'sacrifices');
assert.ok(d.querySelector('[data-group="harps"] [data-type-key]'));
assert.ok(d.querySelector('[data-group="sacrifices"] [data-type-key]'));
assert.equal(d.querySelector('[data-group="scenery"] [data-type-key]').dataset.typeKey.includes('6x6_Ruin_01'),false);
// Assets arriving after the frame enable terrain and its independent automatic orientation.
layer.value='surface';layer.dispatchEvent(new w.Event('change'));
const terrain={image:'terrain_dark_hills.png',projection:'diagonal-half-v1',bounds:{x:-225,y:-220,width:450,height:450}};
w.PoiMap.setAssets({TERRAIN_MAPS:{'Dark Hills':terrain}});
assert.ok(svg.querySelector('.poi-terrain'));assert.equal(degrees.value,'0');assert.equal(d.getElementById('poi-map-flip-y').checked,false);
assert.match(d.getElementById('poi-map-terrain-status').textContent,/fully revealed/);
const terrainMatrix=svg.querySelector('.poi-terrain').getAttribute('transform');
const hp=d.querySelector('[data-poi-id="harp"]');hp.dispatchEvent(new w.MouseEvent('click'));
const harpPosition=hp.getAttribute('transform');
d.querySelector('[data-group-toggle="scenery"]').click();
assert.equal(d.querySelector('[data-poi-id="harp"]').getAttribute('transform'),harpPosition);
degrees.value='45';degrees.dispatchEvent(new w.Event('input'));
assert.notEqual(svg.querySelector('.poi-terrain').getAttribute('transform'),terrainMatrix);
assert.notEqual(d.querySelector('[data-poi-id="harp"]').getAttribute('transform'),harpPosition);
assert.equal(d.querySelector('[data-poi-id="harp"]').getAttribute('aria-pressed'),'true');
d.getElementById('poi-map-terrain').click();assert.equal(svg.querySelector('.poi-terrain'),null);
assert.equal(degrees.value,'112.5'); // prior manual-only orientation was retained
d.getElementById('poi-map-terrain').click();assert.equal(degrees.value,'45');
const layerControl=d.getElementById('poi-map-layer');layerControl.value='sublevel';layerControl.dispatchEvent(new w.Event('change'));
assert.equal(svg.querySelector('.poi-terrain'),null);
layerControl.value='surface';layerControl.dispatchEvent(new w.Event('change'));assert.ok(svg.querySelector('.poi-terrain'));
svg.querySelector('.poi-terrain').dispatchEvent(new w.Event('error'));
assert.equal(svg.querySelector('.poi-terrain'),null);assert.match(d.getElementById('poi-map-terrain-status').textContent,/unavailable/);
assert.ok(d.querySelector('[data-poi-id="harp"]'));
console.log('PASS separate enabled harp/altar groups, terrain asset arrival, fixed bounds, independent orientation, completion persistence and image/layer fallback');
const healing={id:'heal',name:'6x6_Healing_01',source:'category',position:coord(1,2),icon:'map_healing.png'};
const stash={id:'stash',name:'40x40_Thieves_Stashes_Entrance_Combat_Room_01',source:'category',position:coord(20,30),icon:'map_thieves_stash.png'};
const quest={id:'quest',name:'64x64_JackQuest_JackOldHouseCamp',source:'category',position:coord(40,50),icon:'map_side_quest.png'};
const jack={id:'jack',name:'40x40_JackQuest_BeanstalkGrowsPlace',source:'category',position:coord(60,70),icon:'map_side_quest.png'};
w.PoiMap.render({map_id:0,map_tiles:[healing,stash,quest,jack,sacrifice,{...quest,id:'fallback',icon:null},{...quest,id:'unresolved',position:null}]});
d.getElementById('poi-map-defaults').click();size.value='150';size.dispatchEvent(new w.Event('input'));
assert.equal(d.querySelector('[data-poi-id="heal"] image').getAttribute('width'),'150');
assert.equal(d.querySelector('[data-poi-id="stash"] image').getAttribute('width'),'150');
assert.equal(d.querySelector('[data-poi-id="quest"] image').getAttribute('width'),'120');
assert.equal(d.querySelector('[data-poi-id="jack"] image').getAttribute('width'),'120');
assert.equal(d.querySelector('[data-poi-id="fallback"] text').textContent,'!');
for(const id of ['heal','stash','quest','jack','sacrifice','fallback']) {
  const marker=d.querySelector(`[data-poi-id="${id}"]`), hit=marker.querySelector('.poi-hit-target');
  assert.equal(hit.getAttribute('pointer-events'),'all');assert.equal(hit.getAttribute('fill'),'transparent');
  assert.equal(marker.querySelector('.poi-graphic').getAttribute('pointer-events'),'none');
  hit.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert.equal(marker.getAttribute('aria-pressed'),'true');assert.equal(marker.querySelector('.poi-completed-x').style.display,'');
  const button=d.querySelector(`[data-completion-id="${id}"]`);
  assert.equal(button.getAttribute('aria-pressed'),'true');button.click();assert.equal(marker.getAttribute('aria-pressed'),'false');
}
const unresolvedButton=d.querySelector('[data-completion-id="unresolved"]');unresolvedButton.click();assert.equal(unresolvedButton.getAttribute('aria-pressed'),'true');
assert.equal(svg.querySelectorAll('circle').length,0);
const migrated=new JSDOM(fs.readFileSync(root+'/app/web/index.html','utf8'),{runScripts:'outside-only',url:'https://fixture.test'});
migrated.window.localStorage.setItem('ravenswatch:poi-map:v2',JSON.stringify({visibilityVersion:3,size:40,rotation:23,groups:{scenery:false}}));
migrated.window.eval(fs.readFileSync(root+'/app/web/poi-map.js','utf8'));
assert.equal(migrated.window.document.getElementById('poi-map-icon-size').value,'75');
assert.equal(migrated.window.document.getElementById('poi-map-rotation').value,'23');migrated.window.close();
console.log('PASS 75 default, 150 maximum, larger healing/stashes, exclamation-only Jack, transparent click targets for all POI types and table completion including unresolved entries');
const colorCases = [
  ['red-cauldron','Cauldron','map_cauldron.png',3,'#ff0000'],
  ['green-grimoire','Grimoire','map_grimoire.png',1,'#1fff00'],
  ['yellow-chest','Basic_Chest_T2','map_chest.png',2,'#ffff00'],
  ['unknown-mirror','Mirror','map_mirror.png',null,'#bdcbd5'],
];
w.PoiMap.render({map_id:0,map_tiles:colorCases.map(([id,name,icon,tier],i)=>({id,name,icon,tier,
  outline:icon.replace('.png','_outline.png'),source:'selector',position:coord(i*20,0)}))});
for(const [id,,,,color] of colorCases) {
  const art=d.querySelector(`[data-poi-id="${id}"] .poi-graphic`);
  assert.equal(art.querySelector('rect').getAttribute('fill'),color);
  assert.equal(art.querySelector('mask').style.getPropertyValue('mask-type'),'alpha');
}
const cauldron=d.querySelector('[data-poi-id="red-cauldron"]');
cauldron.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(cauldron.getAttribute('aria-pressed'),'true');
cauldron.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(cauldron.getAttribute('aria-pressed'),'false');
assert.equal(cauldron.querySelector('.poi-graphic rect').getAttribute('fill'),'#ff0000');
assert.equal(svg.querySelectorAll('circle').length,0);
console.log('PASS saturated tier outlines, neutral unknown-tier outlines and restored color after completion undo');
w.close();
