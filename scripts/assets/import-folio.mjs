// Import selected MIT-licensed Folio 2025 assets into the native Three.js format.
// Input is the adjacent shallow checkout; no application build or server is run.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const upstream=process.argv[2] || path.resolve(root,'../bruno-folio-reference');
const decoderPath=path.join(root,'node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js');
const ctx={module:{exports:{}},exports:{},require,console,process,Buffer,__dirname:path.dirname(decoderPath),setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(decoderPath,'utf8'),ctx);
const D=await ctx.module.exports({});
const draco={preload(){},decodeDracoFile(bytes,done,ids,types,colorSpace,fail){
 try {
  const decoder=new D.Decoder(),buffer=new D.DecoderBuffer();buffer.Init(new Int8Array(bytes),bytes.byteLength);
  const mesh=new D.Mesh(),status=decoder.DecodeBufferToMesh(buffer,mesh);if(!status.ok())throw Error(status.error_msg());
  const geometry=new T.BufferGeometry();
  for(const [name,id] of Object.entries(ids)){
   const a=decoder.GetAttributeByUniqueId(mesh,id),out=new D.DracoFloat32Array();decoder.GetAttributeFloatForAllPoints(mesh,a,out);
   const values=new Float32Array(mesh.num_points()*a.num_components());for(let i=0;i<values.length;i++)values[i]=out.GetValue(i);
   geometry.setAttribute(name,new T.BufferAttribute(values,a.num_components()));D.destroy(out);
  }
  const indices=new Uint32Array(mesh.num_faces()*3),face=new D.DracoInt32Array();
  for(let i=0;i<mesh.num_faces();i++){decoder.GetFaceFromMesh(mesh,i,face);for(let j=0;j<3;j++)indices[i*3+j]=face.GetValue(j);}
  geometry.setIndex(new T.BufferAttribute(indices,1));D.destroy(face);D.destroy(mesh);D.destroy(buffer);D.destroy(decoder);done(geometry);
 } catch(e){fail(e);}
}};
async function load(relative){
 const bytes=fs.readFileSync(path.join(upstream,'static',relative));
 const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(28+n);
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 loader.register(()=>({name:'FOLIO_EMBEDDED_TEXTURES',loadTexture(index){
  const definition=json.images[json.textures[index].source],v=json.bufferViews[definition.bufferView];
  const uri=`data:${definition.mimeType};base64,${bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength).toString('base64')}`;
  const texture=new T.Texture();texture.flipY=false;texture.magFilter=T.NearestFilter;
  texture.source.toJSON=function(meta){const value={uuid:this.uuid,url:uri};if(meta?.images)meta.images[this.uuid]=value;return value;};
  return Promise.resolve(texture);
 }}));
 return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'' )).scene;
}
const kit=new T.Group();kit.name='folio-original';
for(const name of ['terrain','scenery','benches','fences','lanterns','poleLights']){
 const scene=await load(`${name}/${name}.glb`);scene.name=name;kit.add(scene);
 console.log(name,scene.children.map(n=>n.name).join(', ').slice(0,1200));
}
const trees={};
for(const name of ['oak','birch','cherry']){
 const visual=await load(`${name}Trees/${name}TreesVisual.glb`),refs=await load(`${name}Trees/${name}TreesReferences.glb`);
 visual.name=name+'Trees';kit.add(visual);refs.updateMatrixWorld(true);
 trees[name]=refs.children.map(o=>{o.updateMatrix();return o.matrix.toArray();});
 console.log(name,trees[name].length);
}
const bushes=await load('bushes/bushesReferences.glb');
kit.userData.treeReferences=trees;kit.userData.bushReferences=bushes.children.map(o=>{o.updateMatrix();return o.matrix.toArray();});
kit.updateMatrixWorld(true);
const result=kit.toJSON();result.metadata.generator='Bruno Simon Folio 2025 map';
fs.writeFileSync(path.join(root,'client/environment/bruno/map.json'),JSON.stringify(result));
console.log('Saved original map',fs.statSync(path.join(root,'client/environment/bruno/map.json')).size);
// Server collision data is derived from the same original transforms as the client.
const scale=4/3,bound=128,n=129,cell=2,heights=Array(n*n).fill(0),obstacles=[];
const terrain=kit.getObjectByName('terrain').children[0],pos=terrain.geometry.attributes.position;
for(let i=0;i<pos.count;i++){
 const x=Math.round((pos.getX(i)*scale+bound)/cell),z=Math.round((pos.getZ(i)*scale+bound)/cell);
 heights[z*n+x]=Math.round(pos.getY(i)*scale*1000)/1000;
}
for(const mesh of kit.getObjectByName('scenery').children.filter(o=>o.name.startsWith('bridge'))){
 const box=new T.Box3().setFromObject(mesh);
 const ray=new T.Raycaster(),up=new T.Vector3(0,-1,0);
 for(let iz=Math.max(0,Math.floor((box.min.z*scale+bound)/cell));iz<=Math.min(n-1,Math.ceil((box.max.z*scale+bound)/cell));iz++)
 for(let ix=Math.max(0,Math.floor((box.min.x*scale+bound)/cell));ix<=Math.min(n-1,Math.ceil((box.max.x*scale+bound)/cell));ix++){
  ray.set(new T.Vector3((ix*cell-bound)/scale,5,(iz*cell-bound)/scale),up);
  const hits=ray.intersectObject(mesh,false).filter(h=>h.face.normal.y>.4);
  if(hits.length)heights[iz*n+ix]=Math.round(hits[0].point.y*scale*1000)/1000;
 }
}
function obstacle(box,id){
 if(box.isEmpty()||box.max.y<.2||box.min.y>2.5)return;
 const w=(box.max.x-box.min.x)*scale,d=(box.max.z-box.min.z)*scale;
 if(w<.08||d<.08||w>40||d>40)return;
 obstacles.push({id,floor:0,x:+((box.min.x+box.max.x)*scale/2).toFixed(3),z:+((box.min.z+box.max.z)*scale/2).toFixed(3),w:+w.toFixed(3),d:+d.toFixed(3),h:+Math.max(.3,box.max.y*scale).toFixed(3)});
}
for(const kind of ['scenery','benches','fences','poleLights']){
 const scene=kit.getObjectByName(kind);
 for(const mesh of scene.children){
  if(mesh.name.startsWith('bridge')||mesh.name.startsWith('ref'))continue;
  const physical=[];mesh.traverse(o=>{if(/^cuboid|^hull/.test(o.name))physical.push(o);});
  if(physical.length) for(const part of physical){
   const box=part.isMesh?new T.Box3().setFromObject(part):new T.Box3(new T.Vector3(-.5,-.5,-.5),new T.Vector3(.5,.5,.5)).applyMatrix4(part.matrixWorld);
   obstacle(box,`folio-${kind}-${part.name}`);
  } else if(kind==='poleLights'){
   const p=mesh.getWorldPosition(new T.Vector3());obstacle(new T.Box3(p.clone().add(new T.Vector3(-.17,0,-.17)),p.clone().add(new T.Vector3(.17,3,.17))),`folio-${mesh.name}`);
  } else if(mesh.isMesh) obstacle(new T.Box3().setFromObject(mesh),`folio-${mesh.name}`);
 }
}
for(const [kind,refs]of Object.entries(trees))for(let i=0;i<refs.length;i++){
 const matrix=new T.Matrix4().fromArray(refs[i]),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();matrix.decompose(p,q,s);
 obstacles.push({id:`folio-tree-${kind}-${i}`,kind:'tree',floor:0,x:+(p.x*scale).toFixed(3),z:+(p.z*scale).toFixed(3),w:+(.3*s.x*scale).toFixed(3),d:+(.3*s.z*scale).toFixed(3),h:5*scale});
}
// Pick safe, separated team starts near the original garden entrance, not in a pond.
function height(x,z){const ix=Math.max(0,Math.min(n-1,Math.round((x+bound)/cell))),iz=Math.max(0,Math.min(n-1,Math.round((z+bound)/cell)));return heights[iz*n+ix];}
function clear(x,z,r=1.8){return height(x,z)>-.15&&obstacles.every(o=>Math.hypot(Math.max(Math.abs(x-o.x)-o.w/2,0),Math.max(Math.abs(z-o.z)-o.d/2,0))>r);}
const spawns=[];for(let z=14;z<70&&spawns.length<8;z+=5)for(let x=12;x<65&&spawns.length<8;x+=5)if(clear(x,z,5)&&spawns.every(s=>Math.hypot(x-s.x,z-s.z)>4))spawns.push({x,z,floor:0});
const pickups=[];for(const [x,z]of [[40,40],[8,48],[75,10],[-30,-25]]){
 let found=false;for(let r=0;r<12&&!found;r+=2)for(let i=0;i<8;i++){
  const px=x+Math.cos(i*Math.PI/4)*r,pz=z+Math.sin(i*Math.PI/4)*r;
  if(clear(px,pz)){pickups.push({id:'folio-supply-'+pickups.length,kind:pickups.length%2?'boost':'repair',x:px,z:pz,floor:0});found=true;break;}
 }
}
const map={id:'folio-garden-pve-v1',worldLimit:144,levels:[{id:0,y:0,bound}],obstacles,ramps:[],dropExits:[],spawns,pickups,terrain:{size:n,cell,bound,heights}};
fs.writeFileSync(path.join(root,'core/folio-map.js'),'/* Derived from Bruno Simon Folio 2025 (MIT), see client/environment/bruno/LICENSE.txt. */\n(function(root){const map='+JSON.stringify(map)+';if(typeof module==="object"&&module.exports)module.exports=map;else root.TankFolioMap=map;})(typeof window==="undefined"?globalThis:window);\n');
console.log('Collision map:',obstacles.length,'obstacles;',spawns.length,'safe spawns');
