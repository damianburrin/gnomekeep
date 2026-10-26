'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine');
function room(){const a=E.makePlayer('A','adaptive'),b=E.makePlayer('B','master'),r=E.makeRoom(a);r.players.set(b.id,b);E.startRoom(r);return {r,a,b};}
test('wave five has a real 8 hit Commander, wave ten a 14 hit King',()=>{
 const {r}=room();r.wave=5;E.enterWave(r);
 assert.equal(r.enemies.filter(e=>e.boss==='commander').length,1);
 assert.equal(r.enemies.find(e=>e.boss).hp,8);
 r.wave=10;E.enterWave(r);assert.equal(r.enemies.find(e=>e.boss).hp,14);
 assert.equal(r.enemies.find(e=>e.boss).boss,'king');
});
test('campaign wave 10 spawns portal only after every enemy including storm dies',()=>{
 const {r,a}=room();r.wave=10;E.enterWave(r);r.storm.phase='active';
 r.enemies.forEach(e=>e.hp=0);r.enemies[0].hp=1;
 E.tick(r,.05);assert.equal(r.portal,null);
 r.enemies[0].hp=0;E.tick(r,.05);assert.ok(r.portal);
 assert.equal(r.wave,10);assert.equal(r.state,'playing');assert.equal(a.score,100);
 const portal=r.portal;assert.equal(r.map[Math.floor(portal.y)][Math.floor(portal.x)],0);
});
test('entering portal gives team victory with bonus; host can record or unlock endless',()=>{
 const {r,a,b}=room();r.wave=10;E.enterWave(r);r.storm.phase='active';r.enemies.forEach(e=>e.hp=0);E.tick(r,.05);
 const pos={...r.portal};a.x=pos.x;a.y=pos.y;E.tick(r,.05);
 assert.equal(r.state,'victory');assert.equal(r.outcome,'victory');assert.equal(r.victory,true);
 assert.equal(a.score,1100);assert.equal(b.score,1100);
 const v=E.view(r,a.id);assert.equal(v.phase,'victory');assert.equal(v.hasWon,true);
 assert.equal(E.finishVictory(r,'endless'),true);
 assert.equal(r.state,'playing');assert.equal(r.outcome,'victory_endless');assert.equal(r.wave,11);
 assert.equal(r.portal,null);assert.equal(a.score,1100);
 assert.equal(r.enemies.some(e=>e.boss),false);
});
test('claiming victory ends match and preserves win as a server outcome',()=>{
 const {r,a}=room();r.wave=10;E.enterWave(r);r.storm.phase='active';r.enemies.forEach(e=>e.hp=0);E.tick(r,.05);
 a.x=r.portal.x;a.y=r.portal.y;E.tick(r,.05);
 assert.equal(E.finishVictory(r,'finish'),true);assert.equal(r.state,'ended');assert.equal(r.outcome,'victory');
});
