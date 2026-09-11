# Quaternius Stylized Nature MegaKit — Standard

Source: https://quaternius.itch.io/stylized-nature-megakit
Author page: https://quaternius.com/packs/stylizednaturemegakit.html
Downloaded: 2026-09-11. License: CC0 1.0 (see LICENSE.txt).
The free Standard archive contains 68 models; this project uses eight. No paid tier or engine shader was used.

Archive SHA-256: `298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9`

Selected models: CommonTree_3, CommonTree_5, Pine_5, Bush_Common_Flowers,
Grass_Common_Short, Flower_3_Group, Rock_Medium_1, Rock_Medium_2.

Runtime: client/environment/nature-kit.json (8 models, 7 shared embedded PNG textures).
Converted using scripts/assets/convert-nature.mjs with the existing Three.js GLTFLoader.
Textures downsampled to at most 512×512 with Pillow BICUBIC, normal maps omitted;
materials use rough diffuse lighting with mild foliage fill. Rocks normalized to
unit collision bounds; plants normalized to unit height with proportions retained.
The runtime model is editable with Three.js and the original glTF can be imported into Blender.

To reproduce, download Standard from the source, extract its glTF directory to a temporary
folder, thumbnail PNGs to 512px, then run `node scripts/assets/convert-nature.mjs /path/to/glTF`.
This is an offline asset conversion and does not start or build the application.
The complete 99MB archive, unused FBX/OBJ variants and normal maps are not stored here.

preview.png is an actual browser render of the integrated ground level.
