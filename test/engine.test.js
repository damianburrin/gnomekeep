'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine');
function setup(){const a=E.makePlayer('AAA','adaptive'),b=E.makePlayer('BBB','master'),room=E.makeRoom(a);room.code='ABCDEF';room.players.set(b.id,b);E.startRoom(room);return {room,a,b};}
test('maps generate 3 locked vaults, accessible after opening gates',()=>{
 for(let n=0;n<80;n++){
  const {map,vaults}=E.makeMap();assert.equal(map.length,23);assert.equal(vaults.length,3);
  for(const v of vaults){assert.equal(map[v.doorY][v.doorX],4);assert.equal(map[Math.floor(v.loot[0].y)][Math.floor(v.loot[0].x)],0);}
  const seen=new Set(['1,1']),q=[[1,1]];
  for(const [x,y] of q)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const xx=x+dx,yy=y+dy,k=xx+','+yy;
   if(xx>0&&yy>0&&xx<22&&yy<22&&map[yy][xx]===0&&!seen.has(k)){seen.add(k);q.push([xx,yy]);}
  }
  assert.ok(seen.size>35);
 }
});
test('start room creates shared enemies, loot, and 3 vaults',()=>{const {room}=setup();assert.equal(room.enemies.length,12);assert.equal(room.vaults.length,3);assert.ok(room.pickups.length>=15);assert.equal(room.state,'playing');});
test('shooting is two-hit and consumes ammo server-side',()=>{
 const {room,a}=setup();a.x=1.5;a.y=1.5;a.a=0;
 room.enemies=[{id:1,x:3.5,y:1.5,hp:2,ninja:false,patrol:{x:3.5,y:1.5}}];
 room.map[1][2]=0;room.map[1][3]=0;
 E.fire(room,a);assert.equal(room.enemies[0].hp,1);assert.equal(a.ammo,9);assert.equal(a.score,0);
 a.shotAt=0;E.fire(room,a);assert.equal(room.enemies[0].hp,0);assert.equal(a.ammo,8);assert.ok(a.score>=120);
});
test('five-question reload failure ends run; answer formats are exact',()=>{
 const {room,a}=setup();a.ammo=0;E.openQuiz(a,'ammo');
 for(let i=0;i<5;i++){
  const q=a.quiz.question;assert.equal(E.submitAnswer(room,a,'NOT_CORRECT',q.id),true);
  assert.equal(a.quiz.answered,i+1);E.nextQuiz(room,a);
 }
 assert.equal(a.alive,false);
 assert.equal(E.checkAnswer({n:10,to:'binary'},'00001010'),true);
 assert.equal(E.checkAnswer({n:10,to:'binary'},'1010'),false);
 assert.equal(E.checkAnswer({n:10,to:'hex'},'0A'),true);
 assert.equal(E.checkAnswer({n:10,to:'hex'},'0x0A'),false);
});
test('good reload awards bullets and time, fixed mastery remains independent',()=>{
 const {room,a,b}=setup();a.ammo=0;E.openQuiz(a,'ammo');
 let start=a.time;
 for(let i=0;i<5;i++){
  const q=a.quiz.question;const answer=i<3?E.fmt(q.n,q.to):'WRONG';E.submitAnswer(room,a,answer,q.id);E.nextQuiz(room,a);
 }
 assert.equal(a.ammo,6);assert.equal(a.time,start+45);assert.equal(a.alive,true);
 assert.equal(b.level,'master');
});
test('adaptive promotes at 8/10 and rewards streak while level changes',()=>{
 const {room,a}=setup();E.openQuiz(a,'vault');
 for(let i=0;i<10;i++){
  if(!a.quiz){E.openQuiz(a,'vault');}
  const q=a.quiz.question,answer=i<8?E.fmt(q.n,q.to):'WRONG';
  E.submitAnswer(room,a,answer,q.id);E.nextQuiz(room,a);
 }
 assert.equal(a.adaptiveLevel,1);assert.equal(a.upgrades.length,1);
});
test('new wave changes map and preserves player stats',()=>{
 const {room,a}=setup();a.score=450;a.hp=73;a.ammo=4;a.time=42;
 const old=JSON.stringify(room.map);room.wave++;E.enterWave(room);
 assert.notEqual(JSON.stringify(room.map),old);assert.equal(a.score,450);assert.equal(a.hp,73);assert.equal(a.ammo,4);assert.equal(a.time,42);assert.equal(room.enemies.length,16);
});
test('room client snapshots never contain conversion solutions',()=>{
 const {room,a}=setup();E.openQuiz(a,'time');const v=E.view(room,a.id);
 assert.ok(v.quiz.question.text);assert.equal(v.quiz.question.n,undefined);assert.equal(v.quiz.question.answer,undefined);
 assert.ok(v.players.every(p=>!p.token&&!p.session));
});
