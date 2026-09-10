(function(root){const registry=typeof module==='object'&&module.exports?require('../registry.js'):root.TankPlugins;registry.register({kind:'tank',id:'human',version:'1.0.0',apiVersion:1,spec:{name:'人类 · 火箭兵',hp:80,shield:0,ability:'dodge',abilityCooldown:240,abilityDuration:15,movement:'strafe',muzzleScale:.55,height:2.8,speed:9,reverse:7,accel:35,turn:3,radius:.7,scale:1,mount:[0,1.65,0]},buildVisual({T,block,cylinder,paint,edge,rubber,tank,turret,limbs}){
 for(const side of [-1,1]){const leg=new T.Group();leg.position.set(0,1.2,side*.3);tank.add(leg);block(.34,.95,.35,0,-.48,0,paint,leg);block(.62,.22,.38,-.12,-1,0,rubber,leg);limbs.push(leg);}
 block(.72,.82,1,0,.04,0,paint,turret);block(.25,.65,.75,.48,0,0,edge,turret);
 cylinder(.34,.5,0,.73,0,edge,turret);block(.05,.17,.47,-.34,.76,0,rubber,turret);
 for(const side of [-1,1])block(.55,.24,.25,-.4,.12,side*.65,paint,turret);
}});})(typeof window==='undefined'?globalThis:window);
