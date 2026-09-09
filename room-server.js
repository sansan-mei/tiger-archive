'use strict';
const {randomBytes}=require('node:crypto');
const C=require('./battle-core.js'),{Authority,decode,validateSnapshot}=require('./battle-session.js');
const codePattern=/^[A-F0-9]{6}$/;
// No timers or listeners here: the production adapter and tests drive the same rules.
class RoomServer{
  constructor({now=()=>Date.now(),maxRooms=16,maxClients=160,graceMs=30000}={}){
    this.now=now;this.maxRooms=maxRooms;this.maxClients=maxClients;this.graceMs=graceMs;this.rooms=new Map();this.clients=new Map();this.accumulator=0;
  }
  connect(transport){
    if(this.clients.size>=this.maxClients){transport.close(1013,'Server full');return null;}
    const id=randomBytes(12).toString('hex');this.clients.set(id,{id,transport,room:null,seat:null,tokens:120,budgetAt:this.now(),lastSeen:this.now()});return id;
  }
  send(client,message){
    if(!client)return false;
    try{
      if(client.transport.bufferedAmount>262144){client.transport.close(1013,'Slow connection');this.disconnect(client.id);return false;}
      const data=JSON.stringify(message);if(Buffer.byteLength(data)>65536)throw new Error('State packet exceeds limit');
      client.transport.send(data);return true;
    }catch{client.transport.close(1011,'Connection error');this.disconnect(client.id);return false;}
  }
  error(client,message){this.send(client,{type:'error',message});}
  member(client){const room=this.rooms.get(client.room),seat=room?.seats.find(s=>s.id===client.seat);if(!room||!seat)throw new Error('请先加入房间');return {room,seat};}
  loadout(raw){if(!raw||!Object.hasOwn(C.TANKS,raw.tankType)||!Object.hasOwn(C.WEAPONS,raw.weaponType))throw new Error('车体或武器无效');return {tankType:raw.tankType,weaponType:raw.weaponType};}
  receive(id,raw){
    const client=this.clients.get(id);if(!client)return;
    const now=this.now();client.tokens=Math.min(120,client.tokens+(now-client.budgetAt)*.08);client.budgetAt=now;
    if(client.tokens<1){client.transport.close(1008,'Rate limit');this.disconnect(id);return;}client.tokens--;client.lastSeen=now;
    try{
      const m=decode(raw);
      if(m.type==='input'){
        const {room}=this.member(client);if(room.phase!=='playing')return;
        const result=room.authority.receive(id,m);if(!result.ok)throw new Error(result.reason);
        const value=room.authority.commands.get(client.seat),queue=client.inputQueue||(client.inputQueue=[]),last=queue.at(-1);
        if(value.cancelFire)queue.length=0;
        if(last&&last.fire===value.fire&&last.interact===value.interact&&!value.cancelFire)queue[queue.length-1]=value;else queue.push(value);
        if(queue.length>8){client.transport.close(1008,'Too many input edges');this.disconnect(id);}return;
      }
      if(m.type==='ping'){this.send(client,{type:'pong',sentAt:m.sentAt});return;}
      if(['create','join','resume'].includes(m.type)){
        if(client.room)throw new Error('请先离开当前房间');
        if(m.version!==C.VERSION||m.pluginManifest!==C.PLUGIN_MANIFEST)throw new Error('游戏版本不一致，请刷新页面');
        if(m.type==='resume'){
          const room=this.rooms.get(m.code),seat=room?.seats.find(s=>typeof m.token==='string'&&s.token===m.token);
          if(!seat||seat.clientId||seat.disconnectedAt===null||now-seat.disconnectedAt>=this.graceMs)throw new Error('重连凭证已失效，请重新加入房间');
          seat.clientId=id;seat.disconnectedAt=null;client.room=room.code;client.seat=seat.id;this.joined(client,room,seat);
          if(room.authority){this.send(client,room.authority.attach(id,seat.id));this.send(client,this.packet(room));}
          this.broadcastRoom(room);return;
        }
        const loadout=this.loadout(m.loadout);
        if(typeof m.name!=='string'||!m.name.trim()||m.name.length>16||/[\x00-\x1f\x7f]/.test(m.name))throw new Error('昵称需为 1–16 个字符');
        let room;
        if(m.type==='create'){
          if(this.rooms.size>=this.maxRooms)throw new Error('房间已满，请稍后重试');
          let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(this.rooms.has(code));
          room={code,phase:'lobby',seats:[],host:null,authority:null,epoch:0,createdAt:now};this.rooms.set(code,room);
        }else{
          if(typeof m.code!=='string'||!codePattern.test(m.code))throw new Error('房间码为 6 位字母或数字');
          room=this.rooms.get(m.code);if(!room)throw new Error('房间不存在');
          if(room.phase!=='lobby')throw new Error('对局已开始，暂不能加入');
          if(room.seats.length>=8)throw new Error('房间已满（最多 8 人）');
        }
        const seat={id:'p'+randomBytes(6).toString('hex'),name:m.name.trim(),loadout,ready:false,clientId:id,token:randomBytes(24).toString('hex'),disconnectedAt:null};
        room.seats.push(seat);room.host??=seat.id;client.room=room.code;client.seat=seat.id;this.joined(client,room,seat);this.broadcastRoom(room);return;
      }
      const {room,seat}=this.member(client);
      if(m.type==='leave'){this.removeSeat(room,seat);this.send(client,{type:'left'});return;}
      if(m.type==='loadout'){
        if(room.phase!=='lobby')throw new Error('仅能在准备大厅修改配置');seat.loadout=this.loadout(m.loadout);seat.ready=false;
      }else if(m.type==='ready'){
        if(room.phase!=='lobby'||typeof m.ready!=='boolean')throw new Error('当前不能准备');seat.ready=m.ready;
      }else if(m.type==='start'){
        if(room.host!==seat.id)throw new Error('只有房主可以开局');
        if(room.phase!=='lobby'||room.seats.length<2||room.seats.some(s=>!s.clientId||!s.ready))throw new Error('至少 2 人，且所有玩家在线并准备后才能开局');
        room.authority=new Authority({matchId:room.code,epoch:++room.epoch,participants:room.seats.map((s,i)=>({id:s.id,controller:'human',...s.loadout,spawn:i}))});
        room.phase='playing';room.startedAt=now;for(const s of room.seats){const c=this.clients.get(s.clientId);if(c)c.inputQueue=[];}
        for(const s of room.seats)this.send(this.clients.get(s.clientId),room.authority.attach(s.clientId,s.id));
        room.authority.battle.start();this.broadcastState(room);
      }else if(m.type==='rematch'){
        if(room.host!==seat.id||room.phase!=='finished')throw new Error('对局结束后由房主返回大厅');
        room.phase='lobby';room.createdAt=now;room.authority=null;for(const s of room.seats)s.ready=false;
      }else throw new Error('未知消息');
      this.broadcastRoom(room);
    }catch(error){this.error(client,error.message);}
  }
  joined(client,room,seat){this.send(client,{type:'joined',code:room.code,entityId:seat.id,token:seat.token});}
  packet(room){const packet=room.authority.statePacket();packet.events=packet.events.slice(-64);return packet;}
  broadcastState(room){const packet=this.packet(room);for(const seat of [...room.seats])this.send(this.clients.get(seat.clientId),packet);}
  broadcastRoom(room){
    const message={type:'room',code:room.code,phase:room.phase,host:room.host,players:room.seats.map(s=>({id:s.id,name:s.name,...s.loadout,ready:s.ready,connected:!!s.clientId}))};
    for(const seat of [...room.seats])this.send(this.clients.get(seat.clientId),message);
  }
  migrateHost(room){if(!room.seats.some(s=>s.id===room.host&&s.clientId))room.host=(room.seats.find(s=>s.clientId)||room.seats[0])?.id??null;}
  eliminate(room,seat){
    const a=room.authority,e=a?.battle.getEntity(seat.id);if(e?.alive&&a.battle.status==='playing'){
      const index=a.battle.events.length;a.battle.damage(e,e.hp,null,{x:e.x,y:e.y,z:e.z});
      a.history.push(...a.battle.events.slice(index));if(a.history.length>256)a.history.splice(0,a.history.length-256);
    }
  }
  removeSeat(room,seat){
    const client=this.clients.get(seat.clientId);if(client){room.authority?.detach(client.id);client.room=null;client.seat=null;}
    this.eliminate(room,seat);room.seats=room.seats.filter(s=>s!==seat);
    if(!room.seats.length){this.rooms.delete(room.code);return;}this.migrateHost(room);this.broadcastRoom(room);
  }
  disconnect(id){
    const client=this.clients.get(id);if(!client)return;this.clients.delete(id);
    const room=this.rooms.get(client.room),seat=room?.seats.find(s=>s.id===client.seat);
    if(seat&&seat.clientId===id){room.authority?.detach(id);seat.clientId=null;seat.ready=false;seat.disconnectedAt=this.now();this.migrateHost(room);this.broadcastRoom(room);}
  }
  checkpoint(){
    return {version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,savedAt:this.now(),rooms:[...this.rooms.values()].map(room=>({
      code:room.code,phase:room.phase,host:room.host,epoch:room.epoch,createdAt:room.createdAt,startedAt:room.startedAt,finishedAt:room.finishedAt,
      seats:room.seats.map(s=>({...s,clientId:null})),snapshot:room.authority?.battle.snapshot()||null
    }))};
  }
  restore(data){
    if(!data)return;
    if(data.version!==C.VERSION||data.pluginManifest!==C.PLUGIN_MANIFEST)throw new Error('Redis checkpoint plugin/version mismatch');
    if(!Array.isArray(data.rooms)||data.rooms.length>this.maxRooms)throw new Error('Invalid saved room count');
    const recovered=new Map();
    for(const saved of data.rooms){
      if(!codePattern.test(saved.code)||recovered.has(saved.code)||!['lobby','playing','finished'].includes(saved.phase)||!Array.isArray(saved.seats)||saved.seats.length>8||!saved.seats.length)throw new Error('Invalid saved room');
      const room={...saved,seats:saved.seats.map(s=>({...s,loadout:this.loadout(s.loadout),clientId:null,ready:false,disconnectedAt:this.now()})),authority:null};
      if(saved.snapshot){
        validateSnapshot(saved.snapshot);
        const participants=saved.snapshot.entities.map((e,i)=>({id:e.id,controller:'human',tankType:e.tankType,weaponType:e.weaponType,spawn:i}));
        room.authority=new Authority({participants,matchId:saved.code,epoch:saved.epoch+1});
        room.authority.battle.restore({...saved.snapshot,epoch:saved.epoch+1});room.epoch=saved.epoch+1;
        for(const e of room.authority.battle.entities)room.authority.battle.releaseControl(e.id);
      }else if(saved.phase!=='lobby')throw new Error('Missing saved match');
      delete room.snapshot;recovered.set(room.code,room);
    }
    this.rooms=recovered;this.accumulator=0;
  }
  advance(seconds){
    const now=this.now();
    for(const client of [...this.clients.values()])if(!client.room&&now-client.lastSeen>60000){client.transport.close(1000,'Idle');this.disconnect(client.id);}
    for(const room of [...this.rooms.values()]){
      for(const seat of [...room.seats])if(!seat.clientId&&seat.disconnectedAt!==null&&now-seat.disconnectedAt>=this.graceMs)this.removeSeat(room,seat);
      if(room.phase==='lobby'&&now-room.createdAt>1800000){for(const seat of [...room.seats]){const client=this.clients.get(seat.clientId);this.error(client,'大厅已过期，请创建新房间');this.removeSeat(room,seat);this.send(client,{type:'left'});}}
      if(room.phase==='playing'&&now-room.startedAt>900000){const b=room.authority.battle;b.status='finished';b.winnerId=null;room.authority.history.push(b.emit('end',{winnerId:null}));}
    }
    this.accumulator+=Math.min(.25,Math.max(0,seconds));
    while(this.accumulator+1e-9>=C.DT){
      this.accumulator-=C.DT;
      for(const room of this.rooms.values())if(room.phase==='playing'){
        for(const seat of room.seats){const client=this.clients.get(seat.clientId);if(client?.inputQueue?.length)room.authority.commands.set(seat.id,client.inputQueue.shift());}
        room.authority.step();const b=room.authority.battle;
        if(b.tick%3===0||b.status==='finished')this.broadcastState(room);
        if(b.status==='finished'){room.phase='finished';room.finishedAt=now;this.broadcastRoom(room);}
      }
    }
    for(const room of [...this.rooms.values()])if(room.phase==='finished'&&now-room.finishedAt>300000){
      for(const seat of [...room.seats]){const client=this.clients.get(seat.clientId);this.removeSeat(room,seat);this.send(client,{type:'left'});}
    }
  }
}
module.exports={RoomServer};
