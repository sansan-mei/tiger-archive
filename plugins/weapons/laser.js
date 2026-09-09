(function(root){const registry=typeof module==='object'&&module.exports?require('../registry.js'):root.TankPlugins;registry.register({kind:'weapon',id:'laser',version:'1.0.0',apiVersion:1,spec:{name:'蓄力激光炮',damage:92,cooldown:144,speed:0,life:0,charge:90,minCharge:18,muzzle:4.8,trigger:'charge',delivery:'ray',range:140,minPower:.35,sound:'energy'},buildVisual({T,block,cylinder,paint,edge,glow,gun}){
    block(2.7,.28,.38,-1.8,0,0,edge,gun);
    for(const z of [-.35,.35])block(3.0,.16,.13,-1.84,0,z,glow,gun);
    for(let i=0;i<5;i++){
      const coil=new T.Mesh(new T.TorusGeometry(.25,.04,6,16),glow);coil.rotation.y=Math.PI/2;coil.position.x=-.7-i*.5;gun.add(coil);
    }
}});})(typeof window==='undefined'?globalThis:window);
