// Offline asset conversion, not an application build. Pass the extracted glTF folder.
// Textures may be downsampled to 512px first; keep their original names.
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const input = process.argv[2];
if (!input) throw Error('Expected extracted Stylized Nature MegaKit glTF directory');
globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, {type}, data); } };
const names = ['CommonTree_3', 'CommonTree_5', 'Pine_5', 'Bush_Common_Flowers',
  'Grass_Common_Short', 'Flower_3_Group', 'Rock_Medium_1', 'Rock_Medium_2'];
const kit = new T.Group(), textures = new Map(), materials = new Map();
for (const name of names) {
  const gltf = JSON.parse(fs.readFileSync(path.join(input, name + '.gltf')));
  for (const buffer of gltf.buffers)
    buffer.uri = 'data:application/octet-stream;base64,' + fs.readFileSync(path.join(input, buffer.uri)).toString('base64');
  for (const m of gltf.materials) delete m.normalTexture;
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'LOCAL_NATURE_TEXTURES', loadTexture(index) {
    const uri = gltf.images[gltf.textures[index].source].uri;
    if (!textures.has(uri)) {
      const texture = new T.Texture(); texture.flipY = false;
      const url = 'data:image/png;base64,' + fs.readFileSync(path.join(input, uri)).toString('base64');
      texture.source.toJSON = function(meta) {
        const result = {uuid: this.uuid, url};
        if (meta?.images) meta.images[this.uuid] = result;
        return result;
      };
      textures.set(uri, texture);
    }
    return Promise.resolve(textures.get(uri));
  }}));
  const {scene} = await loader.parseAsync(JSON.stringify(gltf), '');
  scene.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(scene), size = box.getSize(new T.Vector3());
  const group = new T.Group(); group.name = name;
  const rock = name.startsWith('Rock_');
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.translate(-(box.min.x + box.max.x)/2, -box.min.y, -(box.min.z + box.max.z)/2);
    // Rocks fit the shared AABB; plants retain their natural proportions at unit height.
    geometry.scale(1/(rock ? size.x : size.y), 1/size.y, 1/(rock ? size.z : size.y));
    const old = mesh.material;
    if (!materials.has(old.name)) materials.set(old.name, new T.MeshStandardMaterial({
      name: old.name, color: old.color, map: old.map, roughness: 1,
      side: T.DoubleSide, alphaTest: old.alphaTest, metalness: 0,
      emissive: /Leaves|Grass/.test(old.name) ? 0x526f2a : 0x000000,
      emissiveIntensity: .4,
    }));
    const m = new T.Mesh(geometry, materials.get(old.name));
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  });
  kit.add(group);
}
kit.updateMatrixWorld(true);
const output = kit.toJSON(); output.metadata.generator = 'Quaternius Stylized Nature MegaKit';
fs.writeFileSync(new URL('../../client/environment/nature-kit.json', import.meta.url), JSON.stringify(output));
console.log(`${names.length} models, ${textures.size} shared textures`);
