'use strict';
// GNOMEKEEP 2.00: dependency-free, low-capacity RFC6455 WebSocket server.
// Designed for a single persistent Node.js instance behind HTTPS/WSS proxy.
const http=require('node:http');
const crypto=require('node:crypto');
const engine=require('./engine');
const PORT=Number(process.env.PORT||8080),MAX_ROOMS=60,MAX_PLAYERS=4,MAX_FRAME=16384;
const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const rooms=new Map(),sessions=new Map();
function encoded(obj){return Buffer.from(JSON.stringify(obj));}
function frame(opcode,payload){
 const l=payload.length,head=l<126?Buffer.alloc(2):l<65536?Buffer.alloc(4):Buffer.alloc(10);
 head[0]=0x80|opcode;if(l<126)head[1]=l;
 else if(l<65536){head[1]=126;head.writeUInt16BE(l,2)}
 else {head[1]=127;head.writeBigUInt64BE(BigInt(l),2)}
 return Buffer.concat([head,payload]);
}
class WS {
 constructor(socket){this.socket=socket;this.buf=Buffer.alloc(0);this.open=true;this.rate={window:Date.now(),count:0};this.session=null;this.lastSeen=Date.now();
  socket.on('data',b=>this.read(b));socket.on('error',()=>this.close());socket.on('close',()=>this.close());}
 send(v){if(this.open&&!this.socket.destroyed){const buf=encoded(v);if(buf.length<100000)this.socket.write(frame(1,buf));}}
 close(code=1000){if(!this.open)return;this.open=false;try{const data=Buffer.alloc(2);data.writeUInt16BE(code);this.socket.write(frame(8,data));this.socket.end()}catch(e){}if(this.session)disconnect(this.session,this);}
 read(b){
  this.lastSeen=Date.now();this.buf=Buffer.concat([this.buf,b]);if(this.buf.length>MAX_FRAME*4){this.close(1009);return;}
  while(this.buf.length>=2){
   const a=this.buf[0],h=this.buf[1],op=a&15;
   if(!(a&0x80)||a&0x70||!(h&0x80)){this.close(1002);return;}
   let len=h&127,pos=2;
   if(len===126){if(this.buf.length<4)return;len=this.buf.readUInt16BE(2);pos=4;}
   else if(len===127){if(this.buf.length<10)return;const large=this.buf.readBigUInt64BE(2);if(large>BigInt(MAX_FRAME)){this.close(1009);return;}len=Number(large);pos=10;}
   if(len>MAX_FRAME){this.close(1009);return;}
   if(this.buf.length<pos+4+len)return;
   const key=this.buf.subarray(pos,pos+4),data=Buffer.from(this.buf.subarray(pos+4,pos+4+len));this.buf=this.buf.subarray(pos+4+len);
   for(let i=0;i<len;i++)data[i]^=key[i%4];
   if(op===8){this.close();return;}if(op===9){this.socket.write(frame(10,data));continue;}if(op===10)continue;
   if(op!==1){this.close(1003);return;}
   const now=Date.now();if(now-this.rate.window>1000)this.rate={window:now,count:0};
   if(++this.rate.count>65){this.close(1008);return;}
   try{const message=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Invalid payload');processMessage(this,message);}catch(e){this.send({type:'error',message:'Invalid message.'});}
  }
 }
}
function error(ws,message){ws.send({type:'error',message});}
function code(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<6;i++)out+=alphabet[crypto.randomInt(alphabet.length)];return out;}
function sessionLink(room,p,ws){
 if(p.session?.open&&p.session!==ws)p.session.close();
 p.session=ws;p.connected=true;p.disconnectAt=0;ws.session={room:room.code,id:p.id};sessions.set(p.token,ws.session);
 ws.send({type:'joined',room:room.code,id:p.id,token:p.token,host:room.host===p.id,mode:p.level});ws.send(engine.view(room,p.id));
 broadcast(room,{type:'roster',players:[...room.players.values()].map(engine.publicPlayer)});
}
function disconnect(session,ws){
 const room=rooms.get(session.room),p=room?.players.get(session.id);
 if(!p||p.session!==ws)return;p.session=null;p.connected=false;p.disconnectAt=Date.now();
 if(room.state==='lobby'){
  room.players.delete(p.id);sessions.delete(p.token);
  if(room.host===p.id)room.host=room.players.keys().next().value||null;
  if(!room.players.size)rooms.delete(room.code);
 }
 if(room.players.size)broadcast(room,{type:'roster',host:room.host,players:[...room.players.values()].map(engine.publicPlayer)});
}
function broadcast(room,message){for(const p of room.players.values())if(p.session?.open)p.session.send(message);}
function getConnectedPlayer(ws){
 if(!ws.session)return [];
 const room=rooms.get(ws.session.room),p=room?.players.get(ws.session.id);
 if(!room||!p||p.session!==ws)return [];
 return [room,p];
}
function processMessage(ws,m){
 if(typeof m.type!=='string')return;
 if(m.type==='create'){
  if(ws.session)return error(ws,'Already in a room.');
  if(rooms.size>=MAX_ROOMS)return error(ws,'Server full.');
  if(!/^[A-Za-z0-9]{1,3}$/.test(m.name||''))return error(ws,'Enter 1–3 initials.');
  const level=['adaptive','apprentice','explorer','master'].includes(m.level)?m.level:'adaptive';
  const p=engine.makePlayer(m.name,level),room=engine.makeRoom(p);
  do{room.code=code()}while(rooms.has(room.code));rooms.set(room.code,room);
  sessionLink(room,p,ws);return;
 }
 if(m.type==='join'){
  if(ws.session)return error(ws,'Already in a room.');
  const room=rooms.get(String(m.code||'').trim().toUpperCase());
  if(!room)return error(ws,'Room code not found.');
  if(room.state!=='lobby')return error(ws,'The match has already started.');
  if(room.players.size>=MAX_PLAYERS)return error(ws,'Room is full (4 players).');
  if(!/^[A-Za-z0-9]{1,3}$/.test(m.name||''))return error(ws,'Enter 1–3 initials.');
  const level=['adaptive','apprentice','explorer','master'].includes(m.level)?m.level:'adaptive';
  const p=engine.makePlayer(m.name,level);room.players.set(p.id,p);sessionLink(room,p,ws);return;
 }
 if(m.type==='reconnect'){
  if(ws.session)return error(ws,'Already connected.');
  const token=String(m.token||'');if(!/^[a-f0-9]{40}$/.test(token))return error(ws,'Invalid reconnect token.');
  for(const room of rooms.values())for(const p of room.players.values()){
   if(p.token===token&&Date.now()-p.disconnectAt<120000){sessionLink(room,p,ws);return;}
  }
  return error(ws,'Your previous match has expired.');
 }
 const [room,p]=getConnectedPlayer(ws);if(!room)return error(ws,'Join a room first.');
 if(m.type==='start'){
  if(room.host!==p.id)return error(ws,'Only the room host can start.');
  if(room.players.size<2)return error(ws,'At least 2 players are required.');
  if(!engine.startRoom(room))return error(ws,'Match already started.');
  broadcast(room,{type:'started',wave:room.wave});return;
 }
 if(m.type==='input'){
  if(room.state!=='playing'||!p.alive||p.quiz)return;
  const flags={};for(const key of ['f','b','l','r','tl','tr','sprint'])flags[key]=m[key]===true;
  if(typeof m.a==='number'&&Number.isFinite(m.a))flags.a=Math.max(-Math.PI*100,Math.min(Math.PI*100,m.a));
  p.input=flags;p.inputAt=Date.now();return;
 }
 if(m.type==='shoot'){if(room.state==='playing')engine.fire(room,p);return;}
 if(m.type==='answer'){
  if(!p.quiz)return;
  if(typeof m.answer!=='string'||m.answer.length>16)return error(ws,'Invalid answer.');
  engine.submitAnswer(room,p,m.answer,m.qid);return;
 }
 if(m.type==='next'){engine.nextQuiz(room,p);return;}
 if(m.type==='promotion_claim'){p.upgrades.shift();return;}
 if(m.type==='end'){
  if(p.alive)engine.killPlayer(room,p,'PLAYER ENDED RUN');
  if([...room.players.values()].every(q=>!q.alive))room.state='ended';return;
 }
 if(m.type==='finish_room'&&room.host===p.id){
  for(const q of room.players.values())if(q.alive)engine.killPlayer(room,q,'TEAM ENDED RUN');
  room.state='ended';return;
 }
 if(m.type==='ping'){ws.send({type:'pong',at:Date.now()});return;}
}
async function postResults(room){
 if(room.posted)return;room.posted=true;
 const endpoint=process.env.LEADERBOARD_ENDPOINT||'',secret=process.env.SCORE_API_SECRET||'';
 if(!endpoint||secret.length<32||/CHANGE_THIS|YOUR_/.test(secret)){
  room.scorePostStatus='Online results not configured. Your team score is shown here only.';return;
 }
 if(!endpoint.startsWith('https://')&&!endpoint.startsWith('http://127.0.0.1:')){
  room.scorePostStatus='Leaderboard endpoint requires HTTPS.';return;
 }
 const payload={match_id:crypto.randomBytes(16).toString('hex'),room_code:room.code,wave:room.wave,
  players:[...room.players.values()].map(p=>({initials:p.name,score:p.score,kills:p.kills,question_level:p.level,accuracy:p.attempted?Math.round(p.correct*100/p.attempted):0}))};
 const raw=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000)),signature=crypto.createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
 try{
  const controller=new AbortController(),t=setTimeout(()=>controller.abort(),8000);
  const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-gnomekeep-timestamp':timestamp,'x-gnomekeep-signature':signature},body:raw,signal:controller.signal});clearTimeout(t);
  const data=await res.json().catch(()=>null);
  room.scorePostStatus=res.ok&&data?.ok?'Team score safely recorded in MySQL.':'Score not saved: '+(data?.error||res.status);
 }catch(e){room.scorePostStatus='Could not reach PHP leaderboard: '+e.message;}
 broadcast(room,{type:'save_status',message:room.scorePostStatus});
}
const server=http.createServer((req,res)=>{
 if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,version:'2.00',rooms:rooms.size}));return;}
 res.writeHead(404,{'content-type':'text/plain'});res.end('GNOMEKEEP multiplayer WebSocket service');
});
server.on('upgrade',(req,socket,head)=>{
 try{
  if(req.url!=='/ws')throw Error('Not found');
  if(req.headers.upgrade?.toLowerCase()!=='websocket'||!req.headers.connection?.toLowerCase().includes('upgrade'))throw Error('Bad upgrade');
  const key=req.headers['sec-websocket-key'];if(typeof key!=='string'||!/^[-A-Za-z0-9+/]{22}==$/.test(key)||Buffer.from(key,'base64').length!==16)throw Error('Bad key');
  if(req.headers['sec-websocket-version']!=='13')throw Error('Bad version');
  const origin=req.headers.origin||'';
  if(allowed.length&&!allowed.includes(origin))throw Error('Origin denied');
  if(!allowed.length&&process.env.NODE_ENV==='production')throw Error('Set ALLOWED_ORIGINS in production');
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const ws=new WS(socket);if(head?.length)ws.read(head);
 }catch(e){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}
});
const TICK=.05;
setInterval(()=>{
 const now=Date.now();
 for(const room of rooms.values()){
  if(room.state==='playing'){
   for(const p of room.players.values())if(p.connected&&p.inputAt&&now-p.inputAt>500)p.input={};
   engine.tick(room,TICK);
  }
  // A match can also end from the manual End Game action, outside tick().
  if(room.state==='ended'&&!room.posted){void postResults(room);}
  if(room.state==='lobby'&&now-room.updated>2*3600_000||room.state==='ended'&&now-room.updated>15*60_000){
   for(const p of room.players.values()){if(p.session?.open)p.session.close();sessions.delete(p.token);}rooms.delete(room.code);
  }
  for(const p of room.players.values())if(!p.connected&&p.disconnectAt&&now-p.disconnectAt>120000&&room.state==='lobby'){room.players.delete(p.id);sessions.delete(p.token);}
 }
},50).unref();
setInterval(()=>{
 for(const room of rooms.values()){
  for(const p of room.players.values())if(p.session?.open){p.session.send(engine.view(room,p.id));}
 }
},100).unref();
if(require.main===module){server.listen(PORT,'0.0.0.0',()=>console.log(`GNOMEKEEP v2 multiplayer server :${PORT}`));}
module.exports={server,rooms,processMessage,postResults};
