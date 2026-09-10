(function(root){const registry=typeof module==='object'&&module.exports?require('../registry.js'):root.TankPlugins;registry.register({kind:'weapon',id:'rapid',version:'2.1.0',apiVersion:1,spec:{name:'快速炮',damage:9,cooldown:18,speed:112,life:115,charge:0,minCharge:0,muzzle:4.4,trigger:'automatic',delivery:'projectile',range:140,minPower:1,sound:'cannon'},buildVisual({T,block,cylinder,paint,edge,glow,gun}){
    for(const z of [-.23,0,.23])cylinder(.075,2.3,-1.52,0,z,paint,gun,'x');
    block(.25,.22,.78,-2.61,0,0,edge,gun);
}});})(typeof window==='undefined'?globalThis:window);
