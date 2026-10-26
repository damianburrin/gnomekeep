'use strict';
const {randomBytes,randomInt,createHmac}=require('node:crypto');
const SIZE=23, TWO=Math.PI*2;
const LEVELS=[{name:'Apprentice',max:31},{name:'Explorer',max:127},{name:'Master',max:255}];
const round=n=>Math.round(n*100)/100;
const rand=(a,b)=>a+Math.random()*(b-a), randInt=(a,b)=>randomInt(a,b+1);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const validTile=(map,x,y)=>x>=0&&y>=0&&y<SIZE&&x<SIZE&&map[y][x]===0;
function makeMap(){
 const map=Array.from({length:SIZE},()=>Array(SIZE).fill(1));
 const stack=[[1,1]];map[1][1]=0;
 while(stack.length){
  const [x,y]=stack[stack.length-1],opts=[];
  for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2]]){
   const nx=x+dx,ny=y+dy;
   if(nx>0&&ny>0&&nx<SIZE-1&&ny<SIZE-1&&map[ny][nx]===1)opts.push([nx,ny,dx,dy]);
  }
  if(!opts.length){stack.pop();continue;}
  const [nx,ny,dx,dy]=opts[randInt(0,opts.length-1)];
  map[y+dy/2][x+dx/2]=0;map[ny][nx]=0;stack.push([nx,ny]);
 }
 // Widen isolated corridors slightly without breaking map connectivity.
 for(let i=0;i<21;i++){
  const x=randInt(2,SIZE-3),y=randInt(2,SIZE-3);
  if(map[y][x]===1&&map[y-1][x]===0&&map[y+1][x]===0)map[y][x]=0;
  else if(map[y][x]===1&&map[y][x-1]===0&&map[y][x+1]===0)map[y][x]=0;
 }
 const vaults=[];
 for(let i=0;i<3;i++){
  const options=[];
  for(let y=3;y<SIZE-3;y++)for(let x=3;x<SIZE-3;x++){
    if(map[y][x]!==1||Math.hypot(x-1,y-1)<5)continue;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(map[y-dy][x-dx]!==0)continue;
      const ix=x+dx,iy=y+dy,fx=x+2*dx,fy=y+2*dy;
      if(map[iy][ix]!==1||map[fy][fx]!==1)continue;
      if(vaults.some(v=>Math.hypot(v.doorX-x,v.doorY-y)<4))continue;
      options.push({x,y,dx,dy,ix,iy,fx,fy});
    }
  }
  if(!options.length)break;
  const v=options[randInt(0,options.length-1)];
  map[v.y][v.x]=4;map[v.iy][v.ix]=0;map[v.fy][v.fx]=0;
  vaults.push({id:i+1,doorX:v.x,doorY:v.y,entryX:v.x-v.dx,entryY:v.y-v.dy,open:false,loot:[{x:v.ix+.5,y:v.iy+.5},{x:v.fx+.5,y:v.fy+.5}]});
 }
 return {map,vaults};
}
function wall(room,x,y,r=.16){
 const map=room.map;
 for(const [tx,ty] of [[x-r,y-r],[x+r,y-r],[x-r,y+r],[x+r,y+r]]){
  if(!validTile(map,Math.floor(tx),Math.floor(ty)))return true;
 }
 return false;
}
function traceClear(room,ax,ay,bx,by){
 const d=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(d/.14));
 for(let i=1;i<n;i++){const t=i/n;if(!validTile(room.map,Math.floor(ax+(bx-ax)*t),Math.floor(ay+(by-ay)*t)))return false;}
 return true;
}
function reachable(map,x,y){
 const field=new Int16Array(SIZE*SIZE).fill(-1),q=[y*SIZE+x];field[q[0]]=0;
 for(let h=0;h<q.length;h++){
  const pos=q[h],cx=pos%SIZE,cy=(pos/SIZE)|0;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=cx+dx,ny=cy+dy,k=ny*SIZE+nx;
   if(validTile(map,nx,ny)&&field[k]<0){field[k]=field[pos]+1;q.push(k);}
  }
 }
 return field;
}
function paths(room,target){
 const tx=Math.floor(target.x),ty=Math.floor(target.y),key=ty*SIZE+tx;
 if(!room.fields)room.fields=new Map();
 if(room.fields.has(key))return room.fields.get(key);
 const f=reachable(room.map,tx,ty);room.fields.set(key,f);
 if(room.fields.size>14)room.fields.delete(room.fields.keys().next().value);
 return f;
}
function stepTowards(room,obj,target,speed,dt){
 const d=dist(obj,target);
 if(d<.06)return;
 let goal=target;
 if(!traceClear(room,obj.x,obj.y,target.x,target.y)){
  const f=paths(room,target),cx=Math.floor(obj.x),cy=Math.floor(obj.y);
  let best=f[cy*SIZE+cx],opts=[];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const nx=cx+dx,ny=cy+dy;
   if(!validTile(room.map,nx,ny))continue;
   const val=f[ny*SIZE+nx];if(val>=0&&val<best){best=val;opts=[nx+.5,ny+.5];}
  }
  if(opts.length)goal={x:opts[0],y:opts[1]};
 }
 const dx=goal.x-obj.x,dy=goal.y-obj.y,len=Math.hypot(dx,dy);
 if(len<.01)return;
 const nx=obj.x+dx/len*Math.min(speed*dt,len),ny=obj.y+dy/len*Math.min(speed*dt,len);
 if(!wall(room,nx,obj.y,.17))obj.x=nx;
 if(!wall(room,obj.x,ny,.17))obj.y=ny;
}
function makePlayer(name,level){
 return {id:randomBytes(6).toString('hex'),token:randomBytes(20).toString('hex'),name:name.toUpperCase().slice(0,3),level,
  x:1.5,y:1.5,a:0,hp:100,ammo:10,time:90,hunger:100,thirst:100,armour:0,weapon:0,
  score:0,kills:0,damageCooldown:0,shotAt:0,quiz:null,quizSeen:new Set(),attempted:0,correct:0,
  adaptiveLevel:0,windowAnswered:0,windowCorrect:0,upgrades:[],alive:true,connected:true,input:{},inputAt:0,explored:new Set(),
  source:'',streak:0,ended:false,submitted:false,session:null,disconnectAt:0,reviewText:'',levelChanged:false};
}
function publicPlayer(p){return {id:p.id,name:p.name,x:round(p.x),y:round(p.y),a:round(p.a),hp:round(p.hp),ammo:p.ammo,time:round(p.time),
 hunger:round(p.hunger),thirst:round(p.thirst),armour:round(p.armour),weapon:p.weapon,score:p.score,kills:p.kills,alive:p.alive,
 connected:p.connected,level:p.level,questionLevel:LEVELS[p.level==='adaptive'?p.adaptiveLevel:Math.max(0,['apprentice','explorer','master'].indexOf(p.level))].name,
 accuracy:p.attempted?Math.round(p.correct/p.attempted*100):0,inQuiz:!!p.quiz};}
function spawn(room){
 room.enemies=[];room.pickups=[];room.fields=new Map();room.nextEnemy=1;room.nextPickup=1;
 const tiles=[];for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++)if(validTile(room.map,x,y))tiles.push({x:x+.5,y:y+.5});
 const people=[...room.players.values()],isFar=c=>people.every(p=>dist(c,p)>5)&&room.enemies.every(e=>dist(e,c)>.67);
 const size=room.wave>=4?3:room.wave>=2?2:1;
 let anchor=null;
 for(let i=0;i<12+4*(room.wave-1);i++){
  const slot=i%size,group=Math.floor(i/size);
  if(slot===0||!anchor){const opts=tiles.filter(isFar);if(!opts.length)break;anchor=opts[randInt(0,opts.length-1)];}
  const options=slot===0?[anchor]:tiles.filter(c=>dist(c,anchor)<2.4&&dist(c,anchor)>.6&&isFar(c));
  const pt=options.length?options[randInt(0,options.length-1)]:anchor;
  room.enemies.push({id:room.nextEnemy++,x:pt.x,y:pt.y,hp:2,ninja:false,heading:rand(0,TWO),phase:rand(0,TWO),
   fireCooldown:rand(.5,2),patrol:{x:anchor.x,y:anchor.y},mode:'patrol',lastSeen:null,squadId:group,groupSlot:slot});
 }
 const kinds=['ammo','ammo','ammo','ammo','ammo','ammo','med','med','med','food','food','food','food','water','water','water','armour','armour','weapon'];
 for(const kind of kinds){
  const opts=tiles.filter(c=>people.every(p=>dist(c,p)>1.6)&&room.pickups.every(item=>dist(c,item)>1.1));
  if(!opts.length)continue;
  const pt=opts[randInt(0,opts.length-1)];
  room.pickups.push({id:room.nextPickup++,kind,x:pt.x,y:pt.y,claimedBy:new Set()});
 }
 for(const v of room.vaults)for(const pt of v.loot){
  room.pickups.push({id:room.nextPickup++,kind:['ammo','food','med','armour'][randInt(0,3)],x:pt.x,y:pt.y,claimedBy:new Set()});
 }
 room.storm={phase:'pending',delay:rand(15,30),remaining:3,count:0};
 room.events=[];
}
function makeRoom(host){
 const initial=makeMap();const room={code:'',host:host.id,players:new Map([[host.id,host]]),state:'lobby',wave:1,
 map:initial.map,vaults:initial.vaults,enemies:[],pickups:[],fields:new Map(),storm:null,events:[],time:0,
 created:Date.now(),updated:Date.now(),eventSeq:0,nextEnemy:1,nextPickup:1,scorePostStatus:'',posted:false,postedAt:0};
 return room;
}
function enterWave(room){
 const {map,vaults}=makeMap();room.map=map;room.vaults=vaults;
 for(const p of room.players.values()){
   p.x=1.5;p.y=1.5;p.a=0;p.explored=new Set();p.damageCooldown=1.3;
 }
 spawn(room);exploreAll(room);room.events.push({type:'wave',wave:room.wave});
}
function startRoom(room){if(room.state!=='lobby')return false;room.state='playing';room.wave=1;room.time=0;enterWave(room);return true;}
function explore(room,p){
 for(let y=Math.max(0,Math.floor(p.y)-3);y<=Math.min(SIZE-1,Math.floor(p.y)+3);y++){
  for(let x=Math.max(0,Math.floor(p.x)-3);x<=Math.min(SIZE-1,Math.floor(p.x)+3);x++){
   if(Math.hypot(x+.5-p.x,y+.5-p.y)<=3.4&&traceClear(room,p.x,p.y,x+.5,y+.5))p.explored.add(y*SIZE+x);
  }
 }
}
function exploreAll(room){for(const p of room.players.values())explore(room,p)}
function questionsLevel(p){return LEVELS[p.level==='adaptive'?p.adaptiveLevel:Math.max(0,['apprentice','explorer','master'].indexOf(p.level))]}
function nextQuestion(p){
 const level=questionsLevel(p),options=[];
 for(let i=0;i<6;i++)for(let n=0;n<=level.max;n++)if(!p.quizSeen.has(i+':'+n))options.push({i,n});
 if(!options.length){p.quizSeen.clear();return nextQuestion(p)}
 const choice=options[randInt(0,options.length-1)];p.quizSeen.add(choice.i+':'+choice.n);
 const types=[['denary','binary'],['binary','denary'],['denary','hex'],['hex','denary'],['binary','hex'],['hex','binary']];
 const [from,to]=types[choice.i],n=choice.n;
 const value=fmt(n,from,true);
 const names={denary:'denary',hex:'hexadecimal',binary:'binary'};
 const forms=[`Convert ${value} from ${names[from]} to ${names[to]}.`,`The dungeon terminal shows ${value} (${names[from]}). Enter its ${names[to]} equivalent.`,`Decode ${value} (${names[from]}) into ${names[to]}.`,`Gnome cipher: ${value} in ${names[from]} — give the ${names[to]} value.`];
 return {n,from,to,text:forms[randInt(0,forms.length-1)],id:randomBytes(4).toString('hex')};
}
function fmt(n,type,prefix=false){if(type==='binary')return n.toString(2).padStart(8,'0');if(type==='hex')return (prefix?'0x':'')+n.toString(16).toUpperCase().padStart(2,'0');return String(n);}
function checkAnswer(q,s){
 const answer=String(s||'').trim().toUpperCase();
 if(q.to==='binary')return /^[01]{8}$/.test(answer)&&parseInt(answer,2)===q.n;
 if(q.to==='hex')return /^[0-9A-F]{2}$/.test(answer)&&parseInt(answer,16)===q.n;
 return /^(0|[1-9][0-9]{0,2})$/.test(answer)&&Number(answer)===q.n;
}
function quizView(p){const q=p.quiz;if(!q)return null;
 return {type:q.type,completed:q.completed||false,correct:q.correct,total:q.total,answered:q.answered,feedback:q.feedback||'',
    title:q.type==='ammo'?'AMMUNITION RECHARGE':q.type==='time'?'TIME RESCUE':q.type==='vault'?'UNLOCK TREASURE VAULT':'SUPPLY LOCK',
    question:q.question?{id:q.question.id,text:q.question.text,to:q.question.to}:null};
}
function openQuiz(p,type,context={}){
 if(p.quiz||!p.alive)return false;
 p.quiz={type,context,correct:0,answered:0,total:type==='ammo'||type==='time'?5:type==='vault'?3:1,
 completed:false,feedback:'',question:nextQuestion(p)};p.input={};return true;
}
function recordAnswer(room,p,q,correct){
 p.attempted++;if(correct){p.correct++;p.streak++;if(p.streak%3===0){p.score+=25;event(room,{type:'streak',player:p.id,score:25})}}else p.streak=0;
 if(p.level==='adaptive'){
  p.windowAnswered++;if(correct)p.windowCorrect++;
  if(p.windowAnswered===10){
    const previous=p.adaptiveLevel,accuracy=p.windowCorrect;
    if(accuracy>=8)p.adaptiveLevel=Math.min(2,p.adaptiveLevel+1);
    else if(accuracy<5)p.adaptiveLevel=Math.max(0,p.adaptiveLevel-1);
    p.reviewText=`${accuracy}/10 correct`;
    if(p.adaptiveLevel>previous){p.upgrades.push({name:LEVELS[p.adaptiveLevel].name,accuracy,range:LEVELS[p.adaptiveLevel].max});}
    p.windowAnswered=0;p.windowCorrect=0;
  }
 }
}
function finishQuiz(room,p){
 const q=p.quiz;if(!q)return;
 if(q.type==='ammo'){
  if(q.correct===0)killPlayer(room,p,'AMMO QUIZ FAILED (0/5)');
  else{p.ammo+=q.correct*2;p.time+=q.correct*15;event(room,{type:'reward',player:p.id,message:`+${q.correct*2} BULLETS · +${q.correct*15}s`});}
 }else if(q.type==='time'){
  if(q.correct===0)killPlayer(room,p,'TIME RESCUE FAILED (0/5)');
  else{p.time+=q.correct*15;event(room,{type:'reward',player:p.id,message:`+${q.correct*15}s TIME`});}
 }else if(q.type==='pickup'){
  const item=room.pickups.find(i=>i.id===q.context.pickup);
  if(item){item.claimedBy.add(p.id);if(q.correct){rewardPickup(p,item.kind);event(room,{type:'reward',player:p.id,message:`${item.kind.toUpperCase()} UNLOCKED`});}}
 }else if(q.type==='vault'&&q.correct>=3){
  const vault=room.vaults.find(v=>v.id===q.context.vault);
  if(vault&&!vault.open){vault.open=true;room.map[vault.doorY][vault.doorX]=0;room.fields.clear();event(room,{type:'vault',id:vault.id,player:p.id});}
 }
 p.quiz=null;
}
function submitAnswer(room,p,text,id){
 const quiz=p.quiz;if(!quiz||quiz.completed||!quiz.question||quiz.feedback||id!==quiz.question.id)return false;
 const q=quiz.question,ok=checkAnswer(q,text);
 quiz.answered++;if(ok)quiz.correct++;
 recordAnswer(room,p,q,ok);
 quiz.feedback=(ok?'✓ CORRECT':'✗ NOT QUITE')+` · ${fmt(q.n,q.from,true)} = ${fmt(q.n,q.to)} · ${quiz.correct}/${quiz.answered} correct`;
 if(quiz.type==='vault'){
  quiz.completed=quiz.correct>=3;
 }else quiz.completed=quiz.answered>=quiz.total;
 return true;
}
function nextQuiz(room,p){
 const q=p.quiz;if(!q||!q.feedback)return false;
 if(q.completed){finishQuiz(room,p);return true;}
 q.question=nextQuestion(p);q.feedback='';return true;
}
function rewardPickup(p,kind){
 if(kind==='ammo')p.ammo+=5+[0,0,2,4][p.weapon];
 if(kind==='food'){p.hp=Math.min(100,p.hp+20);p.hunger=Math.min(100,p.hunger+55);}
 if(kind==='med')p.hp=Math.min(100,p.hp+35);
 if(kind==='water')p.thirst=Math.min(100,p.thirst+50);
 if(kind==='armour')p.armour=60;
 if(kind==='weapon')p.weapon=Math.min(3,p.weapon+1);
}
function event(room,e){e.id=++room.eventSeq;e.at=Date.now();room.events.push(e);if(room.events.length>45)room.events.splice(0,room.events.length-45);}
function killPlayer(room,p,reason){
 if(!p.alive)return;p.alive=false;p.hp=0;p.input={};p.quiz=null;p.ended=true;
 event(room,{type:'death',player:p.id,reason});
}
function handlePickup(room,p){
 if(p.quiz)return;
 for(const item of room.pickups){
  if(item.claimedBy.has(p.id)||dist(p,item)>.28)continue;
  if(item.kind==='ammo'||item.kind==='water'||item.kind==='weapon'){
   item.claimedBy.add(p.id);rewardPickup(p,item.kind);event(room,{type:'reward',player:p.id,message:`${item.kind.toUpperCase()} COLLECTED`});
  }else openQuiz(p,'pickup',{pickup:item.id});
  break;
 }
}
function doorChallenge(room,p,forward){
 if(!forward||p.quiz)return;
 for(const v of room.vaults){
  if(v.open||dist(p,{x:v.doorX+.5,y:v.doorY+.5})>.79)continue;
  const dx=v.doorX+.5-p.x,dy=v.doorY+.5-p.y,len=Math.hypot(dx,dy);
  const projectedX=p.x+Math.cos(p.a)*.22,projectedY=p.y+Math.sin(p.a)*.22;
  if(len>0&&Math.cos(p.a)*dx/len+Math.sin(p.a)*dy/len>.86&&wall(room,projectedX,projectedY,.19)){openQuiz(p,'vault',{vault:v.id});break;}
 }
}
function fire(room,p){
 if(room.state!=='playing'||!p.alive||p.quiz)return;
 const now=Date.now(),delay=[235,193,159,125][p.weapon];if(now-p.shotAt<delay)return;
 p.shotAt=now;if(p.ammo<=0){openQuiz(p,'ammo');return;}
 p.ammo--;
 let target=null,nearest=25;
 for(const e of room.enemies){
  if(e.hp<=0)continue;const d=dist(p,e),ang=Math.atan2(e.y-p.y,e.x-p.x)-p.a;
  if(d<nearest&&Math.abs(Math.atan2(Math.sin(ang),Math.cos(ang)))<Math.atan2(.32,d)+.04&&traceClear(room,p.x,p.y,e.x,e.y)){nearest=d;target=e;}
 }
 let result='miss';if(target){target.hp--;result=target.hp?'hit':'kill';if(target.hp===0){p.kills++;p.score+=100+20*room.wave;}}
 event(room,{type:'shot',player:p.id,x:p.x,y:p.y,a:p.a,result,target:target?.id||null});
 if(!p.ammo)openQuiz(p,'ammo');
}
function movePlayer(room,p,dt){
 const inp=p.input||{},forward=(inp.f?1:0)-(inp.b?1:0),side=(inp.r?1:0)-(inp.l?1:0),move=Math.hypot(forward,side);
 if(inp.tl)p.a-=dt*2.55;if(inp.tr)p.a+=dt*2.55;
 if(Number.isFinite(inp.a)){
  const requested=inp.a; // Mouse aim is client-supplied; only server-validated shots deal damage.
  p.a=Math.atan2(Math.sin(requested),Math.cos(requested));
 }
 if(move>0){
  const a=p.a;const speed=(inp.sprint?3.3:2.55)*dt;
  const dx=(Math.cos(a)*forward-Math.sin(a)*side)/move*speed,dy=(Math.sin(a)*forward+Math.cos(a)*side)/move*speed;
  const nx=p.x+dx,ny=p.y+dy;
  if(!wall(room,nx,p.y,.19))p.x=nx;
  if(!wall(room,p.x,ny,.19))p.y=ny;
  doorChallenge(room,p,forward>0);
 }
 explore(room,p);
 handlePickup(room,p);
}
function storm(room,dt){
 const s=room.storm;if(!s)return;
 if(s.phase==='pending'){s.delay-=dt;if(s.delay<=0){s.phase='warning';s.remaining=3;event(room,{type:'warning',message:'NINJA GNOME STORM IN 3 SECONDS!'});}}
 else if(s.phase==='warning'){
  s.remaining-=dt;
  if(s.remaining<=0){
   s.phase='active';s.count=randInt(6,8);
   const people=[...room.players.values()].filter(p=>p.alive);
   const tiles=[];
   for(let y=1;y<SIZE-1;y++)for(let x=1;x<SIZE-1;x++)if(validTile(room.map,x,y)){
    const pos={x:x+.5,y:y+.5},d=people.length?Math.min(...people.map(p=>dist(p,pos))):0;
    if(d>1.55&&d<5.6)tiles.push(pos);
   }
   for(let i=0;i<s.count;i++){
    if(!tiles.length)break;
    const pt=tiles[randInt(0,tiles.length-1)];
    room.enemies.push({id:room.nextEnemy++,x:pt.x,y:pt.y,hp:2,ninja:true,heading:rand(0,TWO),phase:0,fireCooldown:rand(.0,.35),patrol:pt,mode:'hunt',lastSeen:null});
   }
   event(room,{type:'warning',message:`${s.count} NINJA GNOMES TELEPORTED IN!`});
  }
 }
}
function enemyTick(room,dt){
 const active=[...room.players.values()].filter(p=>p.alive&&p.connected&&!p.quiz);
 for(const e of room.enemies){
  if(e.hp<=0)continue;e.fireCooldown-=dt;
  if(!active.length)continue;
  const targets=active.filter(p=>dist(e,p)<8&&traceClear(room,e.x,e.y,p.x,p.y));
  targets.sort((a,b)=>dist(e,a)-dist(e,b));
  const seen=targets[0],nearest=active.slice().sort((a,b)=>dist(e,a)-dist(e,b))[0];
  let dest=null;
  if(seen){e.lastSeen={x:seen.x,y:seen.y};e.mode='hunt';dest=seen;}
  else if(e.ninja||room.wave>=3){dest=nearest;e.mode='hunt';}
  else if(e.lastSeen){dest=e.lastSeen;e.mode='search';if(dist(e,dest)<.4)e.lastSeen=null;}
  else {e.mode='patrol';if(room.wave===2&&e.groupSlot>0){const leader=room.enemies.find(o=>o.squadId===e.squadId&&o.groupSlot===0&&o.hp>0);if(leader)e.patrol={x:leader.x,y:leader.y};}if(dist(e,e.patrol)<.2){const options=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:Math.floor(e.x)+dx+.5,y:Math.floor(e.y)+dy+.5})).filter(p=>validTile(room.map,Math.floor(p.x),Math.floor(p.y)));if(options.length)e.patrol=options[randInt(0,options.length-1)];}dest=e.patrol;}
  if(dest&&dist(e,dest)>1.22)stepTowards(room,e,dest,e.ninja?1.55:room.wave>=3?1.08:.74,dt);
  if(seen&&e.fireCooldown<=0){
   e.fireCooldown=rand(2.1,3.2);
   if(seen.damageCooldown<=0){
    const damage=seen.armour>0?8:10;
    seen.hp=Math.max(0,seen.hp-damage);seen.damageCooldown=1.25;
    event(room,{type:'hurt',player:seen.id,source:{x:round(e.x),y:round(e.y)},damage});
    if(seen.hp<=0)killPlayer(room,seen,'DEFEATED BY GNOMES');
   }
   event(room,{type:'enemy_shot',enemy:e.id,player:seen.id,x:round(e.x),y:round(e.y)});
  }
 }
}
function tick(room,dt){
 if(room.state!=='playing')return;room.time+=dt;room.updated=Date.now();room.events=room.events.filter(e=>Date.now()-e.at<1700);
 for(const p of room.players.values()){
  if(!p.alive)continue;
  if(p.damageCooldown>0)p.damageCooldown=Math.max(0,p.damageCooldown-dt);
  if(p.quiz||!p.connected)continue;
  p.time=Math.max(0,p.time-dt);
  p.armour=Math.max(0,p.armour-dt);
  p.hunger=Math.max(0,p.hunger-.75*dt);p.thirst=Math.max(0,p.thirst-1.05*dt);
  p.hp=Math.max(0,p.hp-(.04+(p.hunger===0?.17:0)+(p.thirst===0?.17:0))*dt);
  if(p.hp<=0){killPlayer(room,p,'STARVATION OR DEHYDRATION');continue;}
  if(p.time<=0){openQuiz(p,'time');continue;}
  movePlayer(room,p,dt);
 }
 storm(room,dt);enemyTick(room,dt);
 if(room.enemies.every(e=>e.hp<=0)){
  if(room.storm.phase==='pending'){room.storm.delay=0;storm(room,0);}
  else if(room.storm.phase==='active'){
   for(const p of room.players.values())if(p.alive)p.score+=100;
   room.wave++;enterWave(room);event(room,{type:'waveclear',wave:room.wave-1,bonus:100});
  }
 }
 if([...room.players.values()].every(p=>!p.alive))room.state='ended';
}
function view(room,viewer){
 const p=room.players.get(viewer);
 return {type:'snapshot',code:room.code,host:room.host,phase:room.state,wave:room.wave,
  map:room.state==='lobby'?null:room.map, // full collision map for rendering; minimap uses the fog mask only
  vaults:room.vaults.map(v=>({id:v.id,x:v.doorX,y:v.doorY,open:v.open})),
  enemies:room.enemies.filter(e=>e.hp>0).map(e=>({id:e.id,x:round(e.x),y:round(e.y),hp:e.hp,ninja:e.ninja,phase:round(e.phase)})),
  pickups:room.pickups.filter(i=>!p?.explored||(!i.claimedBy.has(viewer)&&(!p||p.explored.has(Math.floor(i.y)*SIZE+Math.floor(i.x))))).map(i=>({id:i.id,x:i.x,y:i.y,kind:i.kind})),
  players:[...room.players.values()].map(publicPlayer),self:viewer,quiz:p?quizView(p):null,
  promotion:p?.upgrades[0]||null,explored:p?[...p.explored]:[],storm:{phase:room.storm?.phase||'pending',remaining:Math.ceil(room.storm?.remaining||0),alive:room.enemies.filter(e=>e.hp>0&&e.ninja).length},
  events:room.events};
}
module.exports={SIZE,LEVELS,makeMap,makePlayer,makeRoom,startRoom,enterWave,tick,fire,movePlayer,openQuiz,submitAnswer,nextQuiz,killPlayer,view,randInt,round,publicPlayer,spawn,exploreAll,checkAnswer,fmt,traceClear};
