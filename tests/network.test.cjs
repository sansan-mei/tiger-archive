const {test}=require('node:test'),assert=require('node:assert/strict');
const {RoomServer}=require('../room-server.js'),C=require('../battle-core.js'),S=require('../battle-session.js');
const {NetworkSession}=require('../network-session.js');
function setup(){
  let now=0;const rooms=new RoomServer({now:()=>now});
  function peer(){const messages=[],closed=[];const transport={bufferedAmount:0,send:s=>messages.push(JSON.parse(s)),close:(...a)=>closed.push(a)};const id=rooms.connect(transport);return {id,messages,closed,transport,last:type=>messages.findLast(m=>m.type===type)};}
  function send(p,type,extra={}){rooms.receive(p.id,JSON.stringify({type,version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,name:'测试车长',loadout:{tankType:'medium',weaponType:'standard'},...extra}));}
  function match(count=2){const peers=Array.from({length:count},peer);send(peers[0],'create');const code=peers[0].last('joined').code;for(const p of peers.slice(1))send(p,'join',{code});for(const p of peers)send(p,'ready',{ready:true});send(peers[0],'start');return {peers,room:rooms.rooms.get(code),code};}
  function tick(n=1){for(let i=0;i<n;i++){now+=1000/60;rooms.advance(1/60);}}
  return {rooms,peer,send,match,tick,setNow:value=>{now=value;}};
}
test('8-player ready room starts one authority and rejects a ninth player',()=>{
  const t=setup(),peers=Array.from({length:9},t.peer);t.send(peers[0],'create');const code=peers[0].last('joined').code;
  for(const p of peers.slice(1,8))t.send(p,'join',{code});t.send(peers[8],'join',{code});assert.match(peers[8].last('error').message,/已满/);
  t.send(peers[1],'start');assert.match(peers[1].last('error').message,/房主/);t.send(peers[0],'start');assert.match(peers[0].last('error').message,/准备/);
  for(const p of peers.slice(0,8))t.send(p,'ready',{ready:true});t.send(peers[0],'start');t.tick(6);
  const room=t.rooms.rooms.get(code);assert.equal(room.authority.battle.entities.length,8);
  const states=peers.slice(0,8).map(p=>{const r=new S.Replica();r.welcome(p.last('welcome'));assert.equal(r.receive(p.last('state')).ok,true);return r.current;});
  states.forEach(s=>assert.deepEqual(s,states[0]));assert.ok(states[0].entities.every(e=>e.controller==='human'));
});
test('loadout invalidates ready; versions and unknown rooms cannot enter',()=>{
  const t=setup(),p=t.peer();t.send(p,'create',{pluginManifest:'wrong'});assert.equal(t.rooms.rooms.size,0);
  t.send(p,'join',{code:'ABCDEF'});assert.match(p.last('error').message,/不存在/);t.send(p,'create');t.send(p,'ready',{ready:true});
  t.send(p,'loadout',{loadout:{tankType:'heavy',weaponType:'laser'}});assert.equal(p.last('room').players[0].ready,false);assert.equal(p.last('room').players[0].weaponType,'laser');
});
test('short fire press/release survives receipt within one simulation tick',()=>{
  const t=setup(),{peers,room}=t.match(),p=peers[0],w=p.last('welcome');
  function input(seq,fire){t.rooms.receive(p.id,JSON.stringify({version:C.VERSION,type:'input',matchId:w.matchId,epoch:w.epoch,connection:w.connection,seq,clientTick:0,input:{fire}}));}
  input(0,true);input(1,false);t.tick(2);assert.equal(room.authority.history.filter(e=>e.type==='shot').length,1);
  assert.equal(room.authority.battle.getEntity(w.entityId).fireHeld,false);
});
test('disconnect clears control, token resumes seat, expired seat is eliminated and host migrates',()=>{
  const t=setup(),{peers,room,code}=t.match(),p=peers[0],joined=p.last('joined'),oldWelcome=p.last('welcome');
  room.authority.battle.getEntity(joined.entityId).charge=20;t.rooms.disconnect(p.id);
  assert.equal(room.authority.battle.getEntity(joined.entityId).charge,0);assert.equal(room.host,peers[1].last('joined').entityId);
  const bad=t.peer();t.send(bad,'resume',{code,token:'wrong'});assert.ok(bad.last('error'));
  const reconnect=t.peer();t.send(reconnect,'resume',{code,token:joined.token});assert.equal(reconnect.last('welcome').entityId,joined.entityId);assert.notEqual(reconnect.last('welcome').connection,oldWelcome.connection);
  t.rooms.disconnect(reconnect.id);t.setNow(31000);t.tick();assert.equal(room.authority.battle.getEntity(joined.entityId).alive,false);assert.equal(room.phase,'finished');
  const late=t.peer();t.send(late,'resume',{code,token:joined.token});assert.ok(late.last('error'));
});
test('rematch uses a new epoch and requires everyone to prepare again',()=>{
  const t=setup(),{peers,room}=t.match();room.authority.battle.entities[1].hp=0;room.authority.battle.entities[1].alive=false;t.tick();
  assert.equal(room.phase,'finished');t.send(peers[0],'rematch');assert.equal(room.phase,'lobby');assert.ok(room.seats.every(s=>!s.ready));
  for(const p of peers)t.send(p,'ready',{ready:true});t.send(peers[0],'start');assert.equal(room.epoch,2);
});
test('room isolation, leave cleanup, packet abuse and slow transports',()=>{
  const t=setup(),a=t.match(),b=t.match();const count=b.peers[0].messages.length;
  t.send(a.peers[0],'leave');assert.equal(b.peers[0].messages.length,count);assert.equal(a.room.seats.length,1);
  const p=t.peer();p.transport.bufferedAmount=300000;t.send(p,'create');assert.ok(p.closed.length);assert.equal(t.rooms.clients.has(p.id),false);
  const q=t.peer();for(let i=0;i<122;i++)t.send(q,'ping');assert.equal(t.rooms.clients.has(q.id),false);
});
test('checkpoint restores active matches with new epoch and neutral controls',()=>{
  const t=setup(),{peers,room,code}=t.match();t.tick(10);const original=room.authority.battle.snapshot(),data=t.rooms.checkpoint();
  const restored=new RoomServer({now:()=>50000});restored.restore(data);const r=restored.rooms.get(code);
  assert.equal(r.epoch,original.epoch+1);assert.equal(r.authority.battle.tick,original.tick);assert.equal(r.seats[0].token,peers[0].last('joined').token);
  assert.ok(r.seats.every(s=>!s.clientId&&s.disconnectedAt===50000));assert.ok(r.authority.battle.entities.every(e=>e.speed===0&&e.charge===0));
  assert.throws(()=>restored.restore({...data,pluginManifest:'bad'}));
});
test('real browser transport class connects to room logic, drives, pauses only itself and resumes',()=>{
  const t=setup();let now=0;const sockets=[];
  class Socket{
    constructor(){this.listeners={};this.readyState=1;this.bufferedAmount=0;sockets.push(this);this.id=t.rooms.connect({bufferedAmount:0,send:data=>this.emit('message',{data}),close:()=>this.close()});}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,v={}){for(const fn of this.listeners[k]||[])fn(v);}
    send(data){t.rooms.receive(this.id,data);}close(){this.readyState=3;t.rooms.disconnect(this.id);this.emit('close');}
  }
  function client(type,code){const errors=[],n=new NetworkSession({url:'ws://test/ws',WebSocketImpl:Socket,now:()=>now,storage:null,onError:e=>errors.push(e),schedule:()=>0,cancel:()=>{}});n.connect({type,code,name:'Tester',loadout:{tankType:'medium',weaponType:'standard'}});sockets.at(-1).emit('open');return {n,errors};}
  const a=client('create'),b=client('join',a.n.room.code);a.n.send({type:'ready',ready:true});b.n.send({type:'ready',ready:true});a.n.send({type:'start'});
  const start=a.n.current().entities[0].z;
  for(let i=0;i<60;i++){now+=1000/60;a.n.advance(1/60,{forward:true});b.n.advance(1/60,{});t.tick();}
  assert.notEqual(a.n.current().entities[0].z,start);a.n.pause();t.tick(3);assert.equal(a.n.current().status,'playing');
  const saved=a.n.current();a.n.message(JSON.stringify({...a.n.room,type:'welcome',version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,matchId:a.n.replica.matchId,epoch:a.n.replica.epoch,entityId:a.n.playerId,connection:9,tickRate:60}));
  assert.deepEqual(a.n.current(),saved);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);a.n.close();b.n.close();
});
