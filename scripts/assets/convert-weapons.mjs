// Convert the five selected public GLBs to the game's native Three.js asset format.
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const kit = new T.Group();
for (const id of ['pistol','standard','rapid','rocket','laser']) {
const input = fs.readFileSync(new URL(`../../art/public-weapons/source/${id}.glb`, import.meta.url));
const jsonLength = input.readUInt32LE(12);
const gltf = JSON.parse(input.subarray(20, 20 + jsonLength));
const bin = input.subarray(28 + jsonLength);
const loader = new GLTFLoader(), imageSources = new Map();
loader.register(parser => ({ name: 'LOCAL_EMBEDDED_TEXTURES', loadTexture(index) {
  const definition = gltf.textures[index], image = gltf.images[definition.source];
  const view = gltf.bufferViews[image.bufferView];
  const uri = `data:${image.mimeType};base64,${bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength).toString('base64')}`;
  const texture = new T.Texture();
  texture.flipY = false;
  texture.source.toJSON = function(meta) {
    const result = {uuid: this.uuid, url: uri};
    if (meta?.images) meta.images[this.uuid] = result;
    return result;
  };
  if (imageSources.has(definition.source)) texture.source = imageSources.get(definition.source);
  else imageSources.set(definition.source, texture.source);
  return Promise.resolve(texture);
}}));
const {scene} = await loader.parseAsync(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength), '');

scene.name = id;
scene.rotation.y += {pistol: 0, standard: -Math.PI/2, rapid: Math.PI, rocket: 0, laser: Math.PI/2}[id];
scene.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(scene);
const gripX = id === 'rocket' ? .3 : 0;
const scale = 3.5 / (gripX - box.min.x);
const height = box.max.y - box.min.y, width = box.max.z - box.min.z;
const sy = Math.min(scale, (id === 'pistol' ? 2 : 1.1) / height);
const sz = Math.min(scale, .65 / width);
// Bake scene transforms before applying independent profile scales in game axes.
scene.traverse(o => { if(o.isMesh) {
  o.geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
  o.geometry.translate(-gripX, -(box.max.y - height * .18), 0);
  o.geometry.scale(scale, sy, sz);
}});
const flat = new T.Group();
const meshes = []; scene.traverse(o => {if(o.isMesh) meshes.push(o);});
for(const mesh of meshes) {mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);flat.add(mesh);}
scene.clear();scene.position.set(0,0,0);scene.quaternion.identity();scene.scale.set(1,1,1);scene.add(flat);
scene.traverse(o => {if (o.isMesh) o.material.name = 'public-weapon-' + o.material.uuid;});
const weapon = new T.Group(); weapon.name = id; weapon.userData.source = 'Quaternius'; weapon.add(scene); kit.add(weapon);
}
kit.updateMatrixWorld(true);
const output = kit.toJSON();
output.metadata.generator = 'Quaternius public weapons';
fs.writeFileSync(new URL('../../client/models/public-weapons.json', import.meta.url), JSON.stringify(output));
