// Offline asset conversion only; does not build or start the application.
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const input = fs.readFileSync(new URL('../../art/paimon-public/paimon.glb', import.meta.url));
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
scene.name = 'human';
scene.userData.rig = 'paimon-skinned';
scene.rotation.y = -Math.PI / 2;
scene.updateMatrixWorld(true);
const box = new T.Box3().setFromObject(scene);
scene.scale.setScalar(2.8 / (box.max.y - box.min.y));
scene.position.y = -box.min.y * scene.scale.x;
scene.traverse(o => {
  if (!o.isMesh) return;
  // Facial morphs remain in the editable source; the game uses the neutral face.
  o.geometry.morphAttributes = {};
  o.morphTargetInfluences = undefined;
  o.morphTargetDictionary = undefined;
  const old = o.material;
  o.material = new T.MeshBasicMaterial({name: 'paimon-' + old.name, map: old.map,
    side: old.side, transparent: old.transparent, alphaTest: old.transparent ? .05 : 0,
    depthWrite: !old.transparent});
  o.frustumCulled = false;
});
const output = scene.toJSON();
output.metadata.generator = 'Paimon skinned character';
fs.writeFileSync(new URL('../../client/models/paimon.json', import.meta.url), JSON.stringify(output));
console.log('Exported runtime Paimon:', fs.statSync(new URL('../../client/models/paimon.json', import.meta.url)).size, 'bytes');
