# Bruno Simon Folio 2025 map adaptation

Source: https://github.com/brunosimon/folio-2025
Pinned revision: 41046b57eeed8d156d9c3fd7fa259900baef7816
Copyright (c) 2025 Bruno Simon. MIT license in LICENSE.txt, shipped with the game.

Original files reused:
- static/terrain/terrain.glb and terrain.png (terrain geometry and painted road/grass/water masks)
- static/scenery/scenery.glb (bridges and rocks)
- static/{oak,birch,cherry}Trees/*Visual.glb and *References.glb (models and all 70 placements)
- static/benches, fences, lanterns, poleLights (visible models and transforms)
- static/bushes/bushesReferences.glb
- static/foliage/foliageSDF.png, static/floor/slabs.png, static/palette.png

`map.json` is a native Three.js ObjectLoader conversion. Original coordinates are
uniformly scaled by 4/3 at runtime. `core/folio-map.js` derives terrain samples,
trunk/prop collision bounds and safe team spawns from the same data. Colliders use
conservative axis-aligned bounds; ponds are not walkable, while bridges are.

The material implementations adapt Folio's foliage and ground techniques for
Three.js r158 / WebGL and this game's free camera. The portfolio's vehicle,
branding, interactive exhibition areas, physics engine and server are not copied.

The adjacent `bruno-folio-reference` shallow checkout contains the original source
and selected static resources. Re-import with `node scripts/assets/import-folio.mjs`
(or pass another checkout path). This only converts assets, not the application.

坦克大战和僵尸模式现在共用此花园地形。坦克大战出生点在 `core/map.js` 中分散布置；旧多层地图数据及其场景加载已移除。

## Visual pass 2

The WebGL port now uses Folio's terrain gradient (#ffa94e, #5bc2b9, #13375f),
grass and slab palette, 80 leaf cards per crown with camera-facing projection,
tinted core/drop shadows, animated shoreline rings, and a 25-degree camera.
Grass is split into spatial patches for frustum culling. Collision and authoritative
terrain data are unchanged. The leaf depth material uses the same cutout texture.

Adapted from sources/Game/{Terrain,View}.js, World/{Floor,Foliage,WaterSurface}.js
and Materials/MeshDefaultMaterial.js in the pinned reference checkout.
This remains a WebGL adaptation: procedural noise replaces the upstream Perlin
texture. No numeric fidelity percentage has been measured.

## Desktop atmosphere

`client/atmosphere.js` adapts Folio's Weather/Rendering approach to Three r158:
- automatic sunny/cloud/rain transitions, plus manual sunny, cloudy, rain and sunset;
- shared palette lighting, fog, wind-driven foliage and local rain lines;
- an opaque color/depth capture for screen-space water refraction, with depth rejection
  to stop foreground objects from bleeding into water and depth-based absorption;
- a depth-of-field pass with a broad clear band around the gameplay focus;
- desktop Auto enables these passes; mobile Auto and Low skip the offscreen passes.
  Render targets are capped at 2560x1440 and disposed when resized or disabled.
  Reduced-motion preference suppresses rain animation and depth blur.

This does not reproduce the original seasonal temperature/snow simulation. Weather
is visual and local: it never alters authoritative movement, collisions or damage.
