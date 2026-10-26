'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine');
function makeTeam(count=4){
 const players=Array.from({length:count},(_,i)=>E.makePlayer('P'+i,'adaptive'));
 const r=E.makeRoom(players[0]);r.code='QA1234';
 for(const p of players.slice(1))r.players.set(p.id,p);
 assert.equal(E.startRoom(r),true);
 return {r,players};
}
function canReach(room,start,goal){
 const seen=new Set([Math.floor(start.y)*E.SIZE+Math.floor(start.x)]),todo=[[Math.floor(start.x),Math.floor(start.y)]];
 for(const [x,y] of todo){
  if(x===Math.floor(goal.x)&&y===Math.floor(goal.y))return true;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=x+dx,ny=y+dy,key=ny*E.SIZE+nx;
   if(nx<0||ny<0||nx>=E.SIZE||ny>=E.SIZE||room.map[ny][nx]!==0||seen.has(key))continue;
   seen.add(key);todo.push([nx,ny]);
  }
 }
 return false;
}
test('2–4 teammates get distinct geographically separated, reachable spawns across regenerated waves',()=>{
 for(let count=2;count<=4;count++){
  const {r,players}=makeTeam(count);
  for(let n=0;n<30;n++){
   if(n){r.wave++;E.enterWave(r);}
   assert.equal(new Set(players.map(p=>`${p.x},${p.y}`)).size,count);
   for(let i=0;i<count;i++){
    const p=players[i];assert.equal(r.map[Math.floor(p.y)][Math.floor(p.x)],0);
    assert.ok(canReach(r,players[0],p));
    assert.ok(p.explored.size>0);
    for(let j=i+1;j<count;j++){
     assert.ok(Math.hypot(p.x-players[j].x,p.y-players[j].y)>=4,`players ${i}, ${j} too close`);
    }
   }
  }
 }
});
test('test portal is not auto-created in normal gameplay; debug use becomes unranked',()=>{
 const {r,players}=makeTeam();const host=players[0];
 assert.equal(r.portal,null);assert.equal(r.testMode,false);
 assert.equal(E.activatePortalTest(r,host),true);
 assert.equal(r.testMode,true);assert.ok(r.portal);
 assert.equal(r.map[Math.floor(r.portal.y)][Math.floor(r.portal.x)],0);
 assert.equal(canReach(r,host,r.portal),true);
 assert.equal(E.activatePortalTest(r,host),false);
 assert.ok(E.view(r,host.id).testMode);
 const position={...r.portal};host.x=position.x;host.y=position.y;
 E.tick(r,.05);
 assert.equal(r.state,'victory');assert.equal(r.outcome,'victory');
 assert.equal(E.finishVictory(r,'finish'),true);assert.equal(r.state,'ended');
});
test('developer shortcut accepts only host when ENABLE_PORTAL_TEST=true; test results never post',async()=>{
 const S=require('../server');const {r,players}=makeTeam(2),[host,peer]=players;
 const messages=[];const hostWS={open:true,send:m=>messages.push(m),session:{room:r.code,id:host.id}};
 const peerWS={open:true,send:m=>messages.push(m),session:{room:r.code,id:peer.id}};
 host.session=hostWS;peer.session=peerWS;S.rooms.set(r.code,r);
 const previous=process.env.ENABLE_PORTAL_TEST;
 try{
  process.env.ENABLE_PORTAL_TEST='false';S.processMessage(hostWS,{type:'test_portal'});
  assert.equal(r.portal,null);
  process.env.ENABLE_PORTAL_TEST='true';S.processMessage(peerWS,{type:'test_portal'});
  assert.equal(r.portal,null);
  S.processMessage(hostWS,{type:'test_portal'});
  assert.ok(r.portal);assert.equal(r.testMode,true);
  r.state='ended';await S.postResults(r);
  assert.match(r.scorePostStatus,/not saved/i);
 }finally{
  if(previous===undefined)delete process.env.ENABLE_PORTAL_TEST;else process.env.ENABLE_PORTAL_TEST=previous;
  S.rooms.delete(r.code);S.server.close();
 }
});
