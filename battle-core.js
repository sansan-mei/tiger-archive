/* Authoritative simulation: no DOM, renderer, timers, network library or wall clock. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./plugins/catalog.js'):root.TankPlugins);if(typeof module==='object'&&module.exports)module.exports=api;else root.TankBattle=api;})(typeof window==='undefined'?globalThis:window,function(Plugins){
  'use strict';
  const VERSION=4,TICK_RATE=60,DT=1/TICK_RATE,MAX_PLAYERS=8;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const wrap=a=>((a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  const turn=(a,b,s)=>wrap(a+clamp(wrap(b-a),-s,s));
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const PLUGIN_MANIFEST=Plugins.seal();
  const TANKS=Object.freeze(Object.fromEntries(Object.entries(Plugins.tanks).map(([id,p])=>[id,p.spec])));
  const WEAPONS=Object.freeze(Object.fromEntries(Object.entries(Plugins.weapons).map(([id,p])=>[id,p.spec])));
  const MAP=Object.freeze({
    id:'triple-deck-ramps-v2',
    levels:[{id:0,y:0,bound:64},{id:1,y:8,bound:46},{id:2,y:16,bound:46}],
    obstacles:[
      {id:'g1',floor:0,x:-17,z:11,w:13,d:8,h:4},{id:'g2',floor:0,x:18,z:9,w:11,d:9,h:4},
      {id:'g3',floor:0,x:0,z:-12,w:17,d:8,h:4},{id:'g4',floor:0,x:-47,z:-18,w:7,d:16,h:4},
      {id:'g5',floor:0,x:47,z:-18,w:7,d:16,h:4},
      {id:'m1',floor:1,x:-15,z:0,w:9,d:15,h:4},{id:'m2',floor:1,x:15,z:0,w:9,d:15,h:4},
      {id:'m3',floor:1,x:0,z:25,w:10,d:6,h:3},
      {id:'t1',floor:2,x:0,z:0,w:13,d:12,h:4},{id:'t2',floor:2,x:-21,z:-1,w:6,d:10,h:3},
      {id:'t3',floor:2,x:22,z:11,w:7,d:7,h:3}
    ],
    ramps:[
      {id:'west-01',width:12,a:{floor:0,x:-36,z:30},b:{floor:1,x:-36,z:2}},
      {id:'east-01',width:12,a:{floor:0,x:36,z:30},b:{floor:1,x:36,z:2}},
      {id:'west-12',width:12,a:{floor:1,x:-36,z:-30},b:{floor:2,x:-36,z:-2}},
      {id:'east-12',width:12,a:{floor:1,x:36,z:-30},b:{floor:2,x:36,z:-2}}
    ],
    spawns:[
      {x:0,z:52,floor:0},{x:-50,z:-48,floor:0},{x:50,z:-48,floor:0},
      {x:-29,z:34,floor:1},{x:29,z:34,floor:1},{x:0,z:-33,floor:1},
      {x:-28,z:29,floor:2},{x:24,z:-34,floor:2}
    ]
  });
  // The same deck rectangles are used by projectile collision and rendering.
  function deckRects(map,level){
    let rects=[{x0:-level.bound,x1:level.bound,z0:-level.bound,z1:level.bound}];
    for(const r of map.ramps.filter(r=>r.b.floor===level.id)){
      const hole={x0:r.a.x-r.width/2,x1:r.a.x+r.width/2,z0:Math.min(r.a.z,r.b.z),z1:Math.max(r.a.z,r.b.z)};
      rects=rects.flatMap(q=>{
        const x0=Math.max(q.x0,hole.x0),x1=Math.min(q.x1,hole.x1),z0=Math.max(q.z0,hole.z0),z1=Math.min(q.z1,hole.z1);
        if(x0>=x1||z0>=z1)return [q];
        return [{...q,x1:x0},{...q,x0:x1},{x0,x1,z0:q.z0,z1:z0},{x0,x1,z0:z1,z1:q.z1}].filter(v=>v.x1>v.x0&&v.z1>v.z0);
      });
    }
    return rects;
  }
  function rampHeight(map,r,z){return map.levels[r.a.floor].y+(z-r.a.z)/(r.b.z-r.a.z)*(map.levels[r.b.floor].y-map.levels[r.a.floor].y);}
  function slabHit(a,b,min,max){
    let lo=0,hi=1;
    for(const axis of ['x','y','z']){
      const d=b[axis]-a[axis];
      if(Math.abs(d)<1e-10){if(a[axis]<min[axis]||a[axis]>max[axis])return null;continue;}
      let t0=(min[axis]-a[axis])/d,t1=(max[axis]-a[axis])/d;
      if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);
      if(lo>hi)return null;
    }
    return lo;
  }
  function boxHit(a,b,o,pad=0){
    return slabHit({x:a.x,y:0,z:a.z},{x:b.x,y:0,z:b.z},{x:o.x-o.w/2-pad,y:-1,z:o.z-o.d/2-pad},{x:o.x+o.w/2+pad,y:1,z:o.z+o.d/2+pad});
  }
  function normalizeInput(raw={}){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid input');
    const allowed=['forward','reverse','left','right','brake','fire','interact','aimLeft','aimRight','cancelFire','aimYaw','aimPitch'];
    if(Object.keys(raw).some(k=>!allowed.includes(k)))throw new Error('Unknown input field');
    const input={};
    for(const key of allowed.slice(0,10)){if(raw[key]!==undefined&&typeof raw[key]!=='boolean')throw new Error('Invalid input flag');input[key]=raw[key]===true;}
    if(raw.aimYaw!==undefined){if(!finite(raw.aimYaw)||Math.abs(raw.aimYaw)>Math.PI*8)throw new Error('Invalid aim yaw');input.aimYaw=wrap(raw.aimYaw);}
    if(raw.aimPitch!==undefined){if(!finite(raw.aimPitch)||Math.abs(raw.aimPitch)>.65)throw new Error('Invalid aim pitch');input.aimPitch=clamp(raw.aimPitch,-.55,.55);}
    return input;
  }
  function defaultParticipants(loadout={tankType:'medium',weaponType:'standard'}){
    return MAP.spawns.map((spawn,i)=>({id:i?'bot'+i:'p1',controller:i?'bot':'human',tankType:i?['light','medium','heavy'][i%3]:loadout.tankType,weaponType:i?['rapid','standard','laser'][i%3]:loadout.weaponType,spawn:i}));
  }
  class Battle{
    constructor({participants=defaultParticipants(),matchId='local',epoch=1,map=MAP}={}){
      if(!Array.isArray(participants)||participants.length<2||participants.length>MAX_PLAYERS)throw new Error('A match requires 2–8 participants');
      if(new Set(participants.map(p=>p.id)).size!==participants.length)throw new Error('Duplicate player ID');
      this.map=clone(map);this.matchId=matchId;this.epoch=epoch;this.tick=0;this.status='ready';this.winnerId=null;this.nextBullet=1;this.nextEvent=1;this.events=[];this.bullets=[];
      this.entities=participants.map((p,i)=>{
        if(typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,32}$/.test(p.id)||!['human','bot'].includes(p.controller)||!Object.hasOwn(TANKS,p.tankType)||!Object.hasOwn(WEAPONS,p.weaponType))throw new Error('Invalid participant');
        const s=this.map.spawns[p.spawn??i];if(!s)throw new Error('Invalid spawn');
        const spec=TANKS[p.tankType];
        return {id:p.id,controller:p.controller,tankType:p.tankType,weaponType:p.weaponType,x:s.x,y:this.map.levels[s.floor].y,z:s.z,floor:s.floor,heading:-Math.PI/2,aim:-Math.PI/2,pitch:0,hp:spec.hp,maxHp:spec.hp,alive:true,speed:0,cooldown:0,charge:0,fireHeld:false,needsRelease:false,rampId:null,rampDir:0,kills:0,brain:{target:null,path:[],pathTick:0,blocked:0}};
      });
      for(const e of this.entities)if(!this.valid(e.x,e.z,e.floor,e))throw new Error('Overlapping or obstructed spawn');
    }
    get time(){return this.tick/TICK_RATE;}
    getEntity(id){return this.entities.find(e=>e.id===id);}
    start(){if(this.status==='ready'||this.status==='paused')this.status='playing';}
    pause(){if(this.status==='playing')this.status='paused';}
    emit(type,data={}){const event={eventId:this.nextEvent++,tick:this.tick,epoch:this.epoch,type,...data};this.events.push(event);return event;}
    surface(body,x,z){
      const radius=TANKS[body.tankType].radius;
      const flat=floor=>({floor,y:this.map.levels[floor].y,rampId:null,rampDir:0});
      if(body.rampId){
        const r=this.map.ramps.find(r=>r.id===body.rampId),u=(z-r.a.z)/(r.b.z-r.a.z);
        if(Math.abs(x-r.a.x)>r.width/2-radius)return null;
        if(u<=0)return flat(r.a.floor);if(u>=1)return flat(r.b.floor);
        return {floor:r.a.floor,y:rampHeight(this.map,r,z),rampId:r.id,rampDir:body.rampDir};
      }
      for(const r of this.map.ramps){
        if(body.floor!==r.a.floor&&body.floor!==r.b.floor)continue;
        const u=(z-r.a.z)/(r.b.z-r.a.z),old=(body.z-r.a.z)/(r.b.z-r.a.z);
        if(u<=0||u>=1||Math.abs(x-r.a.x)>=r.width/2+radius)continue;
        if(Math.abs(x-r.a.x)>r.width/2-radius)return null;
        const entering=body.floor===r.a.floor?old<=.001&&u<.05:old>=.999&&u>.95;
        if(!entering)return null;
        return {floor:r.a.floor,y:rampHeight(this.map,r,z),rampId:r.id,rampDir:body.floor===r.a.floor?1:-1};
      }
      return flat(body.floor);
    }
    valid(x,z,floor,body=null,{ignoreEntities=false,margin=0,surface=null}={}){
      const level=this.map.levels[floor];if(!level)return false;
      const radius=(body?TANKS[body.tankType].radius:3.1)+margin,y=surface?.y??level.y;
      if(Math.abs(x)>level.bound-radius||Math.abs(z)>level.bound-radius)return false;
      // Flat-floor navigation must go around ramp sides / upper deck openings.
      if(!surface)for(const r of this.map.ramps){
        if(floor!==r.a.floor&&floor!==r.b.floor)continue;
        const u=(z-r.a.z)/(r.b.z-r.a.z);
        if(z>Math.min(r.a.z,r.b.z)-margin&&z<Math.max(r.a.z,r.b.z)+margin&&Math.abs(x-r.a.x)<r.width/2+radius)return false;
      }
      for(const o of this.map.obstacles){
        const oy=this.map.levels[o.floor].y;if(y>=oy+o.h||y+3<=oy)continue;
        const dx=Math.max(Math.abs(x-o.x)-o.w/2,0),dz=Math.max(Math.abs(z-o.z)-o.d/2,0);
        if(dx*dx+dz*dz<(radius+.12)**2)return false;
      }
      if(!ignoreEntities)for(const other of this.entities){
        if(other===body||!other.alive)continue;
        if(Math.abs(other.y-y)<3&&Math.hypot(x-other.x,z-other.z)<radius+TANKS[other.tankType].radius+.25)return false;
      }
      return true;
    }
    collision(a,b,owner=null,{bodies=true}={}){
      let closest=null;
      const check=(t,data)=>{if(t!==null&&(!closest||t<closest.t))closest={t,...data};};
      for(const o of this.map.obstacles){
        const y=this.map.levels[o.floor].y;
        check(slabHit(a,b,{x:o.x-o.w/2-.12,y:y-.1,z:o.z-o.d/2-.12},{x:o.x+o.w/2+.12,y:y+o.h,z:o.z+o.d/2+.12}),{kind:'cover',id:o.id});
      }
      for(const level of this.map.levels)for(const q of deckRects(this.map,level)){
        check(slabHit(a,b,{x:q.x0,y:level.y-.6,z:q.z0},{x:q.x1,y:level.y,z:q.z1}),{kind:'floor',id:level.id});
      }
      for(const r of this.map.ramps){
        const transform=p=>({...p,y:p.y-rampHeight(this.map,r,p.z)});
        check(slabHit(transform(a),transform(b),{x:r.a.x-r.width/2,y:-.6,z:Math.min(r.a.z,r.b.z)},{x:r.a.x+r.width/2,y:0,z:Math.max(r.a.z,r.b.z)}),{kind:'ramp',id:r.id});
        for(const side of [-1,1]){const x=r.a.x+side*(r.width/2-.12);check(slabHit(transform(a),transform(b),{x:x-.12,y:0,z:Math.min(r.a.z,r.b.z)},{x:x+.12,y:.7,z:Math.max(r.a.z,r.b.z)}),{kind:'ramp',id:r.id});}
      }
      if(bodies)for(const e of this.entities){
        if(!e.alive||e.id===owner)continue;
        const r=TANKS[e.tankType].radius*.87;
        check(slabHit(a,b,{x:e.x-r,y:e.y+.15,z:e.z-r},{x:e.x+r,y:e.y+3.0,z:e.z+r}),{kind:'tank',id:e.id});
      }
      if(closest)closest.point={x:a.x+(b.x-a.x)*closest.t,y:a.y+(b.y-a.y)*closest.t,z:a.z+(b.z-a.z)*closest.t};
      return closest;
    }
    sight(a,b){
      if(!b.alive)return false;
      return !this.collision({x:a.x,y:a.y+2.2,z:a.z},{x:b.x,y:b.y+1.8,z:b.z},a.id,{bodies:false});
    }
    rampOptions(body){
      return this.map.ramps.flatMap(r=>{
        const from=r.a.floor===body.floor?r.a:r.b.floor===body.floor?r.b:null;if(!from)return [];
        const to=from===r.a?r.b:r.a,sign=Math.sign(to.z-from.z);
        return [{id:r.id,from:{...from,z:from.z-sign*4},to:{...to,z:to.z+sign*4},distance:Math.hypot(body.x-from.x,body.z-from.z)}];
      }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
    }
    route(body,to){
      const floor=body.floor,spacing=4,bound=this.map.levels[floor].bound-4,n=Math.floor(bound*2/spacing)+1;
      const world=p=>({x:p.x*spacing-bound,z:p.z*spacing-bound}),key=p=>p.z*n+p.x;
      const clear=(a,b,margin=0)=>{
        const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.65));
        for(let i=0;i<=steps;i++)if(!this.valid(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,floor,body,{ignoreEntities:true,margin}))return false;
        return true;
      };
      // Snap to a reachable free cell, not merely the closest grid coordinate:
      // a tank can legally stand beside a wall whose nearest grid cell is occupied.
      const cells=[];
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){
        const p={x,z},point=world(p);
        if(this.valid(point.x,point.z,floor,body,{ignoreEntities:true,margin:.5}))cells.push(p);
      }
      const sorted=cells.slice().sort((a,b)=>Math.hypot(world(a).x-body.x,world(a).z-body.z)-Math.hypot(world(b).x-body.x,world(b).z-body.z)||key(a)-key(b));
      const start=sorted.find(p=>clear(body,world(p)));
      const goal=cells.slice().sort((a,b)=>Math.hypot(world(a).x-to.x,world(a).z-to.z)-Math.hypot(world(b).x-to.x,world(b).z-to.z)||key(a)-key(b))[0];
      if(!start||!goal)return [];
      const passable=new Set(cells.map(key)),open=[{...start,g:0,f:0}],best=new Map([[key(start),0]]),parent=new Map(),closed=new Set();let found=null;
      while(open.length){
        open.sort((a,b)=>a.f-b.f||key(a)-key(b));const cur=open.shift(),id=key(cur);if(closed.has(id))continue;closed.add(id);
        if(cur.x===goal.x&&cur.z===goal.z){found=id;break;}
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const next={x:cur.x+dx,z:cur.z+dz};if(next.x<0||next.z<0||next.x>=n||next.z>=n||!passable.has(key(next)))continue;
          if(!clear(world(cur),world(next),.5))continue;
          const k=key(next),g=cur.g+1;if(g>=(best.get(k)??Infinity))continue;
          parent.set(k,id);best.set(k,g);open.push({...next,g,f:g+Math.abs(next.x-goal.x)+Math.abs(next.z-goal.z)});
        }
      }
      if(found===null)return [];
      const path=[];
      for(let id=found;;id=parent.get(id)){
        if(id===undefined)return [];path.push(world({x:id%n,z:Math.floor(id/n)}));if(id===key(start))break;
      }
      path.reverse();if(clear(world(goal),to))path.push({x:to.x,z:to.z});return path;
    }
    botInput(body){
      const targets=this.entities.filter(e=>e.id!==body.id&&e.alive);
      targets.sort((a,b)=>(Math.abs(a.floor-body.floor)*100+Math.hypot(a.x-body.x,a.z-body.z))-(Math.abs(b.floor-body.floor)*100+Math.hypot(b.x-body.x,b.z-body.z))||a.id.localeCompare(b.id));
      const target=targets[0];if(!target)return {};
      const dx=target.x-body.x,dz=target.z-body.z,range=Math.hypot(dx,dz),los=this.sight(body,target);
      const aimYaw=Math.atan2(dz,-dx),aimPitch=Math.atan2(target.y-body.y,Math.max(1,range));
      const input={aimYaw,aimPitch:clamp(aimPitch,-.55,.55)};
      let goal=null,direct=false;
      if(body.rampId){
        const r=this.map.ramps.find(r=>r.id===body.rampId),to=body.rampDir>0?r.b:r.a;
        goal={x:to.x,z:to.z+Math.sign(r.b.z-r.a.z)*body.rampDir*4};direct=true;
      }else if(body.floor!==target.floor){
        const dir=Math.sign(target.floor-body.floor),portal=this.rampOptions(body).find(p=>Math.sign(p.to.floor-body.floor)===dir);
        if(portal){goal=portal.from;if(Math.abs(body.x-goal.x)<1.2&&(body.z-goal.z)*Math.sign(portal.to.z-goal.z)>-1&&(body.z-goal.z)*Math.sign(portal.to.z-goal.z)<5){goal=portal.to;direct=true;}}
      }else if(!los||range>31)goal=target;
      if(goal){
        if(!direct&&(this.tick>=body.brain.pathTick||body.brain.target!==target.id)){body.brain.path=this.route(body,goal);body.brain.pathTick=this.tick+240;body.brain.target=target.id;}
        while(body.brain.path.length&&Math.hypot(body.brain.path[0].x-body.x,body.brain.path[0].z-body.z)<.75)body.brain.path.shift();
        const next=direct?goal:body.brain.path[0]||goal,desired=Math.atan2(next.z-body.z,-(next.x-body.x)),diff=wrap(desired-body.heading);
        input.left=diff>.10;input.right=diff<-.10;input.forward=Math.abs(diff)<.18;input.brake=!input.forward;
        if(body.brain.blocked>20){input.forward=false;input.reverse=true;input.left=true;if(body.brain.blocked>48)body.brain.blocked=0;}
      }
      if(los&&range<95&&Math.abs(wrap(aimYaw-body.aim))<.09&&!body.cooldown)input.fire=true;
      return input;
    }
    damage(target,amount,owner,point){
      if(!target.alive)return false;
      target.hp=Math.max(0,target.hp-amount);this.emit('damage',{id:target.id,owner,hp:target.hp,...point});
      if(!target.hp){target.alive=false;target.speed=0;target.charge=0;const killer=this.getEntity(owner);if(killer)killer.kills++;this.emit('destroy',{id:target.id,owner,x:target.x,y:target.y+1.5,z:target.z});}
      return true;
    }
    resolveHit(hit,shot){
      this.emit('impact',{owner:shot.owner,kind:hit.kind,targetId:hit.kind==='tank'?hit.id:null,...hit.point,weaponType:shot.weaponType});
      if(hit.kind==='tank')this.damage(this.getEntity(hit.id),shot.damage,shot.owner,hit.point);
    }
    shoot(body,power=1){
      if(this.status!=='playing'||!body.alive||body.cooldown)return false;
      const spec=WEAPONS[body.weaponType],c=Math.cos(body.pitch),dir={x:-Math.cos(body.aim)*c,y:Math.sin(body.pitch),z:Math.sin(body.aim)*c};
      const start={x:body.x,y:body.y+2.2,z:body.z},length=spec.muzzle*TANKS[body.tankType].scale;
      const muzzle={x:start.x+dir.x*length,y:start.y+dir.y*length,z:start.z+dir.z*length};
      body.cooldown=spec.cooldown;body.charge=0;
      const shot={id:this.nextBullet++,owner:body.id,weaponType:body.weaponType,damage:Math.round(spec.damage*power),...muzzle,dx:dir.x,dy:dir.y,dz:dir.z,life:spec.life};
      this.emit('shot',{id:body.id,weaponType:body.weaponType,power,...muzzle,dx:dir.x,dy:dir.y,dz:dir.z});
      const near=this.collision(start,muzzle,body.id);
      if(spec.delivery==='ray'){
        const end={x:start.x+dir.x*spec.range,y:start.y+dir.y*spec.range,z:start.z+dir.z*spec.range},hit=near||this.collision(muzzle,end,body.id);
        this.emit('beam',{id:body.id,from:muzzle,to:hit?hit.point:end,power});
        if(hit)this.resolveHit(hit,shot);
      }else if(near)this.resolveHit(near,shot);else this.bullets.push(shot);
      return true;
    }
    releaseControl(id){
      const body=this.getEntity(id);if(!body)return;
      body.speed=0;body.charge=0;body.fireHeld=false;body.needsRelease=true;
    }
    tickEntity(body,input){
      if(input.cancelFire){input={...input,fire:false};body.charge=0;body.fireHeld=false;body.needsRelease=true;}
      const spec=TANKS[body.tankType],weapon=WEAPONS[body.weaponType];
      if(!body.alive)return;
      if(body.cooldown)body.cooldown--;
      if(!input.fire)body.needsRelease=false;
      body.heading=wrap(body.heading+((input.left?1:0)-(input.right?1:0))*spec.turn*DT);
      const throttle=(input.forward?1:0)-(input.reverse?1:0),desired=input.brake?0:throttle>0?spec.speed:throttle<0?-spec.reverse:0;
      body.speed+=clamp(desired-body.speed,-spec.accel*DT,spec.accel*DT);if(input.brake)body.speed=0;
      const nx=body.x-Math.cos(body.heading)*body.speed*DT,nz=body.z+Math.sin(body.heading)*body.speed*DT;
      const surface=this.surface(body,nx,nz);
      if(surface&&this.valid(nx,nz,surface.floor,body,{surface})){
        const oldRamp=body.rampId,oldFloor=body.floor;
        Object.assign(body,{x:nx,z:nz,...surface});body.brain.blocked=0;
        if(oldRamp!==body.rampId){body.brain.path=[];body.brain.pathTick=0;if(oldRamp)this.emit('rampExit',{id:body.id,floor:body.floor});else this.emit('rampEnter',{id:body.id,rampId:body.rampId});}
        if(oldFloor!==body.floor)body.brain.pathTick=0;
      }else{if(Math.abs(body.speed)>.1)body.brain.blocked++;body.speed=0;}
      if(input.aimLeft||input.aimRight)body.aim=wrap(body.aim+((input.aimLeft?1:0)-(input.aimRight?1:0))*1.8*DT);
      else if(input.aimYaw!==undefined)body.aim=turn(body.aim,input.aimYaw,(body.controller==='bot'?1.8:2.8)*DT);
      if(input.aimPitch!==undefined)body.pitch+=clamp(input.aimPitch-body.pitch,-1.6*DT,1.6*DT);
      if(weapon.trigger==='charge'){
        if(input.fire&&!body.needsRelease&&!body.cooldown){
          body.charge=Math.min(weapon.charge,body.charge+1);
          if(body.charge===weapon.charge){this.shoot(body);body.needsRelease=true;}
        }else if(!input.fire&&body.fireHeld&&body.charge){
          if(body.charge>=weapon.minCharge&&!body.cooldown)this.shoot(body,weapon.minPower+(1-weapon.minPower)*body.charge/weapon.charge);
          body.charge=0;
        }
      }else if(input.fire)this.shoot(body);
      body.fireHeld=input.fire===true;
    }
    step(inputs={}){
      this.events=[];if(this.status!=='playing')return [];
      this.tick++;
      for(const body of this.entities){
        const raw=body.controller==='bot'?this.botInput(body):(inputs[body.id]||{});
        this.tickEntity(body,normalizeInput(raw));
      }
      const alive=[];
      for(const shot of this.bullets){
        const speed=WEAPONS[shot.weaponType].speed,end={x:shot.x+shot.dx*speed*DT,y:shot.y+shot.dy*speed*DT,z:shot.z+shot.dz*speed*DT};
        const hit=this.collision(shot,end,shot.owner);shot.life--;
        if(hit){this.resolveHit(hit,shot);continue;}
        Object.assign(shot,end);if(shot.life>0&&Math.abs(shot.x)<80&&Math.abs(shot.z)<80&&shot.y>-2&&shot.y<50)alive.push(shot);
      }
      this.bullets=alive;
      const survivors=this.entities.filter(e=>e.alive);
      if(survivors.length<=1){this.status='finished';this.winnerId=survivors[0]?.id??null;this.emit('end',{winnerId:this.winnerId});}
      return clone(this.events);
    }
    snapshot(){
      return {version:VERSION,pluginManifest:PLUGIN_MANIFEST,mapId:this.map.id,matchId:this.matchId,epoch:this.epoch,tick:this.tick,status:this.status,winnerId:this.winnerId,nextBullet:this.nextBullet,nextEvent:this.nextEvent,entities:clone(this.entities),bullets:clone(this.bullets)};
    }
    restore(snapshot){
      if(snapshot.pluginManifest!==PLUGIN_MANIFEST||snapshot.version!==VERSION||snapshot.mapId!==this.map.id)throw new Error('Incompatible snapshot');
      for(const k of ['matchId','epoch','tick','status','winnerId','nextBullet','nextEvent'])this[k]=snapshot[k];
      this.entities=clone(snapshot.entities);this.bullets=clone(snapshot.bullets);this.events=[];
    }
  }
  return {VERSION,PLUGIN_MANIFEST,TICK_RATE,DT,MAX_PLAYERS,TANKS,WEAPONS,MAP,Battle,normalizeInput,defaultParticipants,wrap,turn,boxHit,slabHit,clone,deckRects,rampHeight};
});
