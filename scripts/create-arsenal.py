"""Explicit Blender authoring, no rendering. Regenerates arsenal.blend and arsenal.json."""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
palette={'paint':'62CBB1','edge':'F2ECD9','rubber':'293D51','glow':'67D8E0','accent':'FFBD61','ink':'152B40'}
mats={}
for name,col in palette.items():
    m=bpy.data.materials.new(name);m.diffuse_color=(*[int(col[i:i+2],16)/255 for i in (0,2,4)],1);mats[name]=m
assets={}; nodes=[]
def node(name,parent=None,pos=(0,0,0),rx=0,animation=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    if parent:o.parent=parent['object']
    o.location=(pos[0],-pos[2],pos[1]);o.rotation_euler.x=rx
    n={'name':name,'object':o,'parts':[],'children':[],'pos':pos,'rx':rx,'animation':animation}
    if parent:parent['children'].append(n)
    nodes.append(n);return n

def box(n,name,size,pos,mat='paint',bevel=.06,tilt=0):
    x,y,z=pos;w,h,d=size
    bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name=name;o.parent=n['object'];o.location=(x,-z,y);o.dimensions=(w,d,h)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_euler.y=tilt
    o.data.materials.append(mats[mat]);n['parts'].append(o)
    if bevel:
        mod=o.modifiers.new('Armor chamfer','BEVEL');mod.width=min(bevel,min(size)*.22);mod.segments=1
    return o

def cyl(n,name,r,h,pos,mat='rubber',axis='y',verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=h)
    o=bpy.context.object;o.name=name;o.parent=n['object'];o.location=(pos[0],-pos[2],pos[1])
    if axis=='x':o.rotation_euler.y=math.pi/2
    if axis=='z':o.rotation_euler.x=math.pi/2
    o.data.materials.append(mats[mat]);n['parts'].append(o);return o

for kind in ['light','medium','heavy','human']:
    root=node(kind);assets[kind]=root
    if kind=='human':
        for i,side in enumerate([-1,1]):
            leg=node('leg-'+str(i),root,(0,1.13,side*.29),animation='limb')
            box(leg,'Flex undersuit',(.34,.87,.34),(0,-.43,0),'rubber')
            box(leg,'Thigh plate',(.43,.37,.4),(-.08,-.21,0),'paint')
            box(leg,'Angular knee',(.47,.3,.43),(-.12,-.49,0),'edge')
            box(leg,'Shin shell',(.39,.29,.39),(-.04,-.75,0),'paint')
            box(leg,'Boot toe',(.6,.25,.44),(-.13,-.98,0),'ink')
        t=node('turret',root,(0,1.65,0))
        box(t,'Torso',(.7,.8,.88),(0,-.09,0))
        box(t,'Chest breastplate',(.23,.52,.74),(-.38,-.06,0),'edge',.09)
        box(t,'Chest status bar',(.03,.1,.35),(-.505,.07,0),'glow',.005)
        box(t,'Backpack',(.36,.66,.65),(.47,-.04,0),'ink')
        for z in [-.22,.22]:cyl(t,'Backpack cell',.11,.5,(.66,-.04,z),'accent')
        box(t,'Helmet',(.78,.66,.86),(-.03,.67,0),'edge',.14)
        box(t,'Visor recess',(.16,.3,.71),(-.45,.69,0),'ink')
        box(t,'Blue visor',(.06,.17,.58),(-.54,.71,0),'glow',.025)
        box(t,'Helmet stripe',(.5,.05,.16),(-.02,1.02,0),'accent',.01)
        for side in [-1,1]:
            cyl(t,'Helmet earpiece',.2,.14,(0,.67,side*.47),'paint','z')
            box(t,'Shoulder pad',(.57,.35,.32),(-.03,.12,side*.57),'paint',.1)
            box(t,'Forearm',(.56,.24,.27),(-.4,-.12,side*.57),'rubber')
            box(t,'Gauntlet',(.23,.25,.3),(-.64,-.1,side*.57),'edge')
        continue
    light=kind=='light';heavy=kind=='heavy'
    box(root,'Lower chassis',(4.45,.64,2.35 if light else 2.8),(0,.95,0),'ink',.16)
    box(root,'Sloped glacis',(1.35,.63,2.24 if light else 2.8),(-1.65,1.35,0),'paint',.12,-.22)
    box(root,'Upper hull',(3.5,.55,2.36 if light else 2.9),(.3,1.39,0),'paint',.16)
    box(root,'Belly bumper',(.25,.35,2.42 if light else 2.95),(-2.34,.95,0),'edge')
    box(root,'Deck stripe',(2.25,.035,.28),(-.83,1.705,0),'accent',.006)
    for side in [-1,1]:
        z=side*(1.48 if light else 1.57)
        if not light:
            box(root,'Continuous track',(5.13,.91,.68),(0,.63,z),'rubber',.2)
            for j in range(13):
                for y in [.22,1.04]:box(root,'Track shoe',(.22,.095,.74),(-2.27+j*.38,y,z),'ink',.01)
        count=3 if light else 5
        for i in range(count):
            x=-1.75+i*3.5/(count-1)
            w=node('wheel-'+str(side)+'-'+str(i),root,(x,.64,z+side*.1),math.pi/2,'wheel')
            cyl(w,'Tire',.61 if light else .4,.43,(0,0,0),'rubber' if light else 'edge')
            for sign in [-1,1]:
                cyl(w,'Hub',.27 if light else .19,.045,(0,sign*.23,0),'accent')
                box(w,'Hub spoke',(.4,.048,.08),(0,sign*.255,0),'ink',.008)
        box(root,'Side rail',(3.8,.2,.45),(.15,1.37,z),'edge')
        if heavy:
            for j in range(3):
                box(root,'Layered side armor',(1.48,.72,.33),(-1.55+j*1.55,1.33,z+side*.18),'paint',.12)
                box(root,'Side armor clip',(.17,.6,.06),(-1.55+j*1.55,1.35,z+side*.36),'accent',.015)
        box(root,'Headlamp socket',(.18,.27,.4),(-2.32,1.39,side*.89),'ink')
        box(root,'Headlamp',(.065,.14,.28),(-2.43,1.42,side*.89),'glow',.01)
        box(root,'Rear light',(.09,.16,.28),(2.11,1.42,side*.89),'accent',.01)
        for i in range(4):box(root,'Engine louvers',(.1,.07,.52),(1.15+i*.22,1.7,side*.72),'ink',.01)
        if light:
            cyl(root,'Boost pod',.3,.77,(1.98,1.27,side*.68),'ink','x')
            cyl(root,'Boost exhaust',.22,.05,(2.39,1.27,side*.68),'glow','x')
    t=node('turret',root,(-.42,1.72,0));width=2.38 if heavy else 1.68 if light else 2.03
    cyl(t,'Turret bearing',.78,.17,(0,.04,0),'rubber')
    box(t,'Turret armored shell',(2.04,.74,width),(.05,.42,0),'paint',.15)
    box(t,'Turret crown',(1.45,.16,width*.8),(.16,.88,0),'edge',.05)
    for side in [-1,1]:
        box(t,'Cheek armor',(1.36,.49,.3),(-.1,.4,side*width/2),'edge',.1)
        box(t,'Cheek inset',(.62,.2,.035),(-.17,.43,side*(width/2+.16)),'ink',.01)
        box(t,'Sensor strip',(.42,.07,.04),(-.17,.46,side*(width/2+.183)),'glow',.008)
        if heavy:box(t,'Rear ammunition pod',(.62,.55,.52),(.88,.4,side*.85),'accent',.1)
    cyl(t,'Commander hatch',.35,.11,(.25,1,0),'paint')
    cyl(t,'Antenna',.025,.57,(.72,1.16,-.53),'ink',verts=8)
    box(t,'Antenna beacon',(.13,.1,.13),(.72,1.45,-.53),'glow',.01)

L=3.5
for kind in ['standard','rapid','laser','rocket']:
    g=node(kind);assets[kind]=g
    box(g,'Universal trunnion',(.28,.56,1.08),(0,0,0),'edge')
    if kind=='standard':
        box(g,'Cannon breech',(.9,.68,.78),(-.45,0,0),'paint',.11)
        cyl(g,'Barrel',.22,2.55,(-1.975,0,0),'edge','x')
        for x in [-.98,-1.23]:cyl(g,'Recoil collar',.3,.13,(x,0,0),'accent','x')
        box(g,'Muzzle brake',(.55,.46,.59),(-L+.30,0,0),'paint',.08)
        cyl(g,'Bore',.16,.015,(-L+.0075,0,0),'ink','x')
        for side in [-1,1]:box(g,'Brake vent',(.27,.16,.02),(-L+.25,0,side*.299),'ink',.008)
    elif kind=='rapid':
        cyl(g,'Rotary receiver',.45,.72,(-.44,0,0),'paint','x')
        for i in range(3):
            y=math.cos(i*math.tau/3)*.24;z=math.sin(i*math.tau/3)*.24
            cyl(g,'Autocannon tube',.13,2.73,(-2.035,y,z),'edge','x')
            cyl(g,'Barrel mouth',.09,.12,(-L+.06,y,z),'ink','x')
        for x in [-1.15,-2.83]:cyl(g,'Barrel brace',.43,.16,(x,0,0),'ink','x')
        cyl(g,'Ammo drum',.43,.4,(-.55,0,.65),'accent','z')
    elif kind=='laser':
        box(g,'Capacitor body',(1.15,.65,.9),(-.56,0,0),'paint',.13)
        for side in [-1,1]:
            box(g,'Emitter rail',(2.37,.33,.22),(-2.315,0,side*.36),'edge',.05)
            box(g,'Conductive rail',(2.06,.14,.035),(-2.26,0,side*.232),'glow',.01)
        for x in [-.3,-.56,-.82]:box(g,'Charge fin',(.1,.86,.83),(x,0,0),'accent',.02)
        cyl(g,'Focusing core',.2,.35,(-1.28,0,0),'glow','x')
        box(g,'Emitter lip',(.075,.32,.65),(-L+.0625,0,0),'ink',.015)
        box(g,'Emitter aperture',(.015,.13,.35),(-L+.0075,0,0),'glow',.003)
    else:
        cyl(g,'Launcher tube',.39,3.3,(-1.75,0,0),'paint','x')
        for x in [-.2,-1.1,-3.28]:cyl(g,'Launcher band',.46,.15,(x,0,0),'edge','x')
        cyl(g,'Muzzle rim',.49,.145,(-L+.0975,0,0),'accent','x')
        cyl(g,'Dark bore',.37,.012,(-L+.006,0,0),'ink','x')
        cyl(g,'Rocket nose',.21,.015,(-L+.022,0,0),'accent','x')
        box(g,'Carry handle',(.55,.13,.22),(-.93,.57,0),'ink',.03)
        for x in [-.72,-1.13]:box(g,'Handle riser',(.1,.21,.22),(x,.43,0),'ink',.02)
    box(g,'Sight base',(.48,.12,.2),(-.42,.43,0),'ink',.02)
    box(g,'Sight lens',(.07,.1,.16),(-.68,.44,0),'glow',.01)

# Bake modifier results by material within each rigid/animated node; keep pivots.
I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];geometries=[]
def export(n,prefix):
    key=prefix+'-'+n['name'];buckets={};bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    for o in n['parts']:
        ev=o.evaluated_get(dg);mesh=ev.to_mesh();mesh.calc_loop_triangles();local=n['object'].matrix_world.inverted()@o.matrix_world
        normalmat=local.to_3x3().inverted().transposed();role=o.data.materials[0].name
        b=buckets.setdefault(role,{'p':[],'n':[],'i':[],'v':{}})
        for tri in mesh.loop_triangles:
            normal=(normalmat@tri.normal).normalized()
            for vi in tri.vertices:
                p=local@mesh.vertices[vi].co;v=tuple(round(a,5) for a in (p.x,p.z,-p.y,normal.x,normal.z,-normal.y))
                if v not in b['v']:b['v'][v]=len(b['p'])//3;b['p'].extend(v[:3]);b['n'].extend(v[3:])
                b['i'].append(b['v'][v])
        ev.to_mesh_clear()
    if n['animation']=='wheel':
        merged={'p':[],'n':[],'i':[],'colors':[]}
        for role,b in buckets.items():
            offset=len(merged['p'])//3
            merged['p'].extend(b['p']);merged['n'].extend(b['n']);merged['i'].extend(i+offset for i in b['i'])
            rgb=[int(palette[role][i:i+2],16)/255 for i in (0,2,4)]
            linear=[round(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4,5) for v in rgb]
            merged['colors'].extend(linear*(len(b['p'])//3))
        buckets={'wheel':merged}
    children=[]
    for role,b in buckets.items():
        uid=key+'-'+role
        geometries.append({'uuid':uid,'type':'BufferGeometry','data':{'attributes':{'position':{'itemSize':3,'type':'Float32Array','array':b['p']},'normal':{'itemSize':3,'type':'Float32Array','array':b['n']}},'index':{'type':'Uint16Array','array':b['i']}}})
        if 'colors' in b:geometries[-1]['data']['attributes']['color']={'itemSize':3,'type':'Float32Array','array':b['colors']}
        children.append({'uuid':uid+'-mesh','name':role,'type':'Mesh','geometry':uid,'material':role,'matrix':I,'castShadow':True,'receiveShadow':True})
    children.extend(export(c,key) for c in n['children'])
    x,y,z=n['pos'];c=math.cos(n['rx']);s=math.sin(n['rx']);matrix=[1,0,0,0,0,c,s,0,0,-s,c,0,x,y,z,1]
    return {'uuid':key,'name':n['name'],'type':'Group','matrix':matrix,'userData':{'animation':n['animation']},'children':children}
models=[export(n,'arsenal') for n in assets.values()]
palette['wheel']='FFFFFF'
output={'metadata':{'version':4.6,'type':'Object','generator':'Blender arsenal v1'},'geometries':geometries,'materials':[{'uuid':n,'name':n,'type':'MeshToonMaterial','color':int(c,16),'vertexColors':n=='wheel'} for n,c in palette.items()],'object':{'uuid':'arsenal','name':'arsenal','type':'Group','matrix':I,'children':models}}
(ROOT/'client/models').mkdir(exist_ok=True)
(ROOT/'client/models/arsenal.json').write_text(json.dumps(output,separators=(',',':')))
# Editable display lineup: unit roots preserve their child pivots.
for i,kind in enumerate(['light','medium','heavy','human']):assets[kind]['object'].location=(i*8-12,0,0)
for i,kind in enumerate(['standard','rapid','laser','rocket']):assets[kind]['object'].location=(i*8-10,-7,1.2)
bpy.ops.object.camera_add(location=(-23,-34,25));camera=bpy.context.object;camera.rotation_euler=(Vector((0,-1,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=38;bpy.context.scene.camera=camera
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.shading.color_type='MATERIAL';area.spaces.active.overlay.show_overlays=False;area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/arsenal.blend'),compress=True)
print('Exported eight modular models',sum(len(g['data']['index']['array'])//3 for g in geometries),'triangles')
