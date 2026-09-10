"""Blender authoring script: a small editable kit, no textures or render caches.
Run explicitly with Blender --background --factory-startup --threads 2 --python ...
Saves art/maintenance-base.blend and client/environment/maintenance-kit.json only.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
palette = {
    'ivory': 'E8DEC6', 'teal': '4B8F91', 'navy': '304C60',
    'yellow': 'EDB85A', 'orange': 'CD7655', 'dark': '263744',
    'steel': '7E999D', 'glass': '8FD3CB', 'concrete': 'A5AEA3',
}
materials={}
for name, hex_value in palette.items():
    m=bpy.data.materials.new(name)
    rgb=tuple(int(hex_value[i:i+2],16)/255 for i in (0,2,4))
    m.diffuse_color=(*rgb,1)
    m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*rgb,1)
    bsdf.inputs['Roughness'].default_value=.82
    materials[name]=m

assets={}
def asset(name, dimensions):
    collection=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    assets[name]={'collection':collection,'dimensions':dimensions,'objects':[]}
    return name

def register(o,name,group,color):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    assets[group]['collection'].objects.link(o)
    o.data.materials.append(materials[color])
    assets[group]['objects'].append(o)
    return o

# Author in game coordinates (X right, Y up, Z depth), converted to Blender Z-up.
def box(group,name,size,pos,color,bevel=.04):
    w,h,d=size;x,y,z=pos
    bpy.ops.mesh.primitive_cube_add(size=1,location=(x,-z,y))
    o=bpy.context.object;o.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    register(o,name,group,color)
    if bevel:
        mod=o.modifiers.new('Small manufactured edge','BEVEL');mod.width=min(bevel,min(size)*.18);mod.segments=1
    return o

def cylinder(group,name,radius,height,pos,color,axis='y',vertices=12):
    x,y,z=pos
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=height,location=(x,-z,y))
    o=bpy.context.object
    if axis=='z':o.rotation_euler.x=math.pi/2
    if axis=='x':o.rotation_euler.y=math.pi/2
    register(o,name,group,color)
    return o

def label(group,name,text,size,pos,color):
    x,y,z=pos
    bpy.ops.object.text_add(location=(x,-z,y),rotation=(math.pi/2,0,0))
    o=bpy.context.object;o.data.body=text;o.data.size=size;o.data.align_x='CENTER';o.data.extrude=.002;o.data.resolution_u=2
    bpy.ops.object.convert(target='MESH')
    return register(bpy.context.object,name,group,color)

g=asset('workshop',(13,4,8))
box(g,'Closed workshop shell',(12.84,3.86,7.84),(0,1.95,0),'ivory',.08)
box(g,'Foundation',(13,.18,8),(0,.09,0),'navy',.025)
box(g,'Flat roof cap',(13,.22,8),(0,3.89,0),'teal',.025)
box(g,'Teal upper facade',(12.72,.58,.1),(0,3.45,3.94),'teal',.01)
label(g,'Workshop sign','FIELD SERVICE / 01',.33,(0,3.31,3.998),'ivory')
for i,x in enumerate([-4,0,4]):
    box(g,f'Bay {i+1} dark frame',(3.52,2.65,.1),(x,1.55,3.93),'navy',.015)
    box(g,f'Bay {i+1} closed shutter',(3.15,2.36,.09),(x,1.49,3.99-0.045),'steel',.01)
    for j in range(7):box(g,f'Bay {i+1} shutter seam {j}',(3.1,.035,.012),(x,.52+j*.3,3.998-0.006),'dark',0)
    box(g,f'Bay {i+1} handle',(.48,.08,.014),(x,1.27,3.999-.007),'yellow',0)
    for side in [-1,1]:
        box(g,f'Bay {i+1} jamb {side}',(.15,2.61,.13),(x+side*1.69,1.51,3.93),'yellow',.015)
    box(g,f'Bay {i+1} lamp',(1.0,.08,.12),(x,2.98,3.92),'glass',.01)
# Rear utility panel and side windows stay inside the same closed cover box.
for side in [-1,1]:
    for z in [-2.2,0,2.2]:
        box(g,'Side window frame',(.1,.96,1.45),(side*6.44,2.54,z),'navy',.01)
        box(g,'Side window glass',(.03,.75,1.22),(side*6.48,2.57,z),'glass',.006)
box(g,'Rear service cabinet',(2.2,1.7,.1),(-3,1.45,-3.94),'teal',.01)
for x in [2,2.5,3,3.5]:box(g,'Rear ventilation',(.22,1.35,.1),(x,1.8,-3.94),'navy',.01)

g=asset('cargo',(10,3,6))
box(g,'Container shell',(9.86,2.9,5.86),(0,1.5,0),'orange',.05)
for side in [-1,1]:
    for i in range(11):box(g,'Corrugated side rib',(.13,2.52,.08),(-4.5+i*.9,1.5,side*2.95),'yellow',.015)
    box(g,'Long upper frame',(10,.15,.2),(0,2.925,side*2.9),'navy',.015)
    box(g,'Long lower frame',(10,.15,.2),(0,.075,side*2.9),'navy',.015)
for side in [-1,1]:
    for z in [-2.8,2.8]:box(g,'Corner casting',(.2,3,.32),(side*4.9,1.5,z),'navy',.02)
# Solid end doors on X end; no fake open passage.
for z in [-1.4,1.4]:
    box(g,'Closed container door',(.08,2.6,2.6),(4.95,1.5,z),'teal',.01)
    cylinder(g,'Door locking rod',.035,2.3,(4.996-.035,1.5,z),'ivory')
box(g,'Identification panel',(2.9,.65,.03),(1.5,1.8,2.985),'ivory',.01)
label(g,'Cargo ID','CARGO 08',.35,(1.5,1.67,3.0),'navy')

g=asset('power',(6,3,5))
box(g,'Energy module shell',(5.84,2.84,4.84),(0,1.5,0),'teal',.06)
box(g,'Lower equipment skid',(6,.2,5),(0,.1,0),'navy',.025)
box(g,'Equipment roof',(6,.18,5),(0,2.91,0),'ivory',.02)
for side in [-1,1]:
    box(g,'Corner protection',(.22,2.8,4.96),(side*2.86,1.5,0),'yellow',.02)
for x in [-1.65,0,1.65]:
    box(g,'Vent frame',(1.27,1.52,.1),(x,1.66,2.44),'navy',.012)
    for i in range(5):box(g,'Vent louver',(1.06,.1,.045),(x,1.12+i*.23,2.47),'steel',.008)
box(g,'Rear control face',(2.1,1.1,.08),(0,1.8,-2.46),'navy',.012)
box(g,'Control display',(1.25,.55,.03),(-.15,1.9,-2.485),'glass',.005)
label(g,'Energy label','POWER',.36,(0,2.55,2.50),'ivory')

# Export native Three.js ObjectLoader JSON: no extra browser loader or texture files.
geometries=[];game_materials=[];children=[];identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
for name,hex_value in palette.items():
    game_materials.append({'uuid':'mat-'+name,'type':'MeshToonMaterial','color':int(hex_value,16)})
for asset_name,info in assets.items():
    buckets={}
    depsgraph=bpy.context.evaluated_depsgraph_get()
    for o in info['objects']:
        evaluated=o.evaluated_get(depsgraph);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
        key=o.data.materials[0].name
        data=buckets.setdefault(key,{'positions':[],'normals':[],'indices':[],'vertices':{}})
        w,h,d=info['dimensions']
        normal_matrix=o.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            normal=(normal_matrix@tri.normal).normalized()
            # Non-uniform normalization must inverse-scale normals.
            n=Vector((normal.x*w,normal.z*h,-normal.y*d)).normalized()
            for vertex_id in tri.vertices:
                p=o.matrix_world@mesh.vertices[vertex_id].co
                v=tuple(round(a,5) for a in (p.x/w,p.z/h,-p.y/d,n.x,n.y,n.z))
                if v not in data['vertices']:
                    data['vertices'][v]=len(data['positions'])//3
                    data['positions'].extend(v[:3]);data['normals'].extend(v[3:])
                data['indices'].append(data['vertices'][v])
        evaluated.to_mesh_clear()
    meshes=[];triangles=0
    for color,data in buckets.items():
        uid=asset_name+'-'+color;triangles+=len(data['indices'])//3
        geometries.append({'uuid':uid,'type':'BufferGeometry','data':{
            'attributes':{'position':{'itemSize':3,'type':'Float32Array','array':data['positions']},'normal':{'itemSize':3,'type':'Float32Array','array':data['normals']}},
            'index':{'type':'Uint16Array','array':data['indices']}}})
        meshes.append({'uuid':'mesh-'+uid,'name':uid,'type':'Mesh','geometry':uid,'material':'mat-'+color,'matrix':identity,'castShadow':True,'receiveShadow':True})
    children.append({'uuid':'asset-'+asset_name,'name':asset_name,'type':'Group','matrix':identity,'userData':{'dimensions':info['dimensions'],'triangles':triangles},'children':meshes})
    print(asset_name,triangles,'triangles',len(meshes),'draw groups')
output={'metadata':{'version':4.6,'type':'Object','generator':'Blender maintenance kit'},'geometries':geometries,'materials':game_materials,'object':{'uuid':'maintenance-kit','type':'Group','name':'maintenance-kit','matrix':identity,'children':children}}
(ROOT/'client/environment/maintenance-kit.json').write_text(json.dumps(output,separators=(',',':')))

# Arrange editable originals on a small studio floor for opening in Blender.
for asset_name, offset in [('workshop',(-7,0,0)),('cargo',(7,-1,0)),('power',(7,7,0))]:
    for o in assets[asset_name]['objects']:o.location+=Vector(offset)
bpy.ops.mesh.primitive_plane_add(size=38,location=(0,0,-.02))
floor=bpy.context.object;floor.name='Preview floor (not exported)';floor.data.materials.append(materials['concrete'])
bpy.ops.object.camera_add(location=(-22,-30,23));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=34
bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA',location=(-8,-12,20));bpy.context.object.data.energy=2000;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=12
scene=bpy.context.scene;scene.render.resolution_x=1000;scene.render.resolution_y=700;scene.render.resolution_percentage=100
# Material-colored studio viewport, ready to inspect without rendering.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL'
            area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/maintenance-base.blend'),compress=True)
