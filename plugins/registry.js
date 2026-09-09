/* Trusted, bundled content only. Registration closes before simulation starts. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TankPlugins=api;})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
  function createRegistry(){
    const tanks=Object.create(null),weapons=Object.create(null);let locked=false,manifest;
    function register(plugin){
      if(locked)throw new Error('Plugin registry is locked');
      if(!plugin||!['tank','weapon'].includes(plugin.kind)||!/^[a-z][a-z0-9-]{0,31}$/.test(plugin.id)||!/^\d+\.\d+\.\d+$/.test(plugin.version)||plugin.apiVersion!==1||typeof plugin.buildVisual!=='function')throw new Error('Invalid plugin metadata');
      const table=plugin.kind==='tank'?tanks:weapons;if(Object.hasOwn(table,plugin.id))throw new Error('Duplicate plugin ID');
      const s=plugin.spec;
      if(!s||typeof s.name!=='string'||!s.name.length)throw new Error('Missing plugin name');
      const ranges=plugin.kind==='tank'?{hp:[1,1000],speed:[1,30],reverse:[1,15],accel:[1,50],turn:[.1,5],radius:[1,3.1],scale:[.1,2]}:{damage:[1,1000],cooldown:[1,3600],speed:[0,200],life:[0,600],charge:[0,3600],minCharge:[0,3600],muzzle:[0,10],range:[1,200],minPower:[0,1]};
      for(const [key,[min,max]] of Object.entries(ranges))if(typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw new Error('Invalid stat: '+key);
      if(plugin.kind==='tank'){
        if(!Array.isArray(s.mount)||s.mount.length!==3||!s.mount.every(n=>Number.isFinite(n)&&Math.abs(n)<=4))throw new Error('Invalid turret mount');
      }else{
        for(const key of ['damage','cooldown','life','charge','minCharge'])if(!Number.isInteger(s[key]))throw new Error('Expected integer: '+key);
        if(!['automatic','charge'].includes(s.trigger)||!['projectile','ray'].includes(s.delivery)||!['cannon','energy'].includes(s.sound)||s.minCharge>s.charge||s.trigger==='charge'&&(!s.charge||!s.minCharge)||s.trigger==='automatic'&&(s.charge||s.minCharge)||s.delivery==='projectile'&&(!s.speed||!s.life))throw new Error('Invalid weapon behavior');
      }
      // Copy configuration: callers cannot mutate registered gameplay data.
      table[plugin.id]=freeze({...plugin,spec:JSON.parse(JSON.stringify(s))});return table[plugin.id];
    }
    function seal(){
      if(!Object.keys(tanks).length||!Object.keys(weapons).length)throw new Error('Empty plugin catalogue');
      if(!locked){manifest=canonical([...Object.values(tanks),...Object.values(weapons)].map(p=>({kind:p.kind,id:p.id,version:p.version,apiVersion:p.apiVersion,spec:p.spec})).sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)));freeze(tanks);freeze(weapons);locked=true;}return manifest;
    }
    return {register,seal,tanks,weapons,get manifest(){return seal();}};
  }
  const registry=createRegistry();registry.createRegistry=createRegistry;return registry;
});
