"""Import four Kenney Blaster Kit 2.1 OBJ meshes. Offline art tool; requires Pillow.
Usage: python3 scripts/import-blasters.py /path/to/kenney_blaster-kit_2.1.zip
No build, service or network access. Writes only the checked-in art data/license.
"""
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile
from PIL import Image

archive = Path(sys.argv[1])
expected = '91e3093e95427d59625e7e2ce2d0399b861600160fd0b4ada7714796b67cea8c'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit('Unexpected source archive; review the asset version before importing')
result = {}
with zipfile.ZipFile(archive) as z:
    texture = Image.open(io.BytesIO(z.read('Models/OBJ format/Textures/colormap.png'))).convert('RGB')
    for key in ('b', 'j', 'r', 'h'):
        vertices, uvs, normals, faces = [], [], [], []
        for line in z.read(f'Models/OBJ format/blaster-{key}.obj').decode().splitlines():
            fields = line.split()
            if not fields: continue
            if fields[0] == 'v': vertices.append(list(map(float, fields[1:4])))
            elif fields[0] == 'vt': uvs.append(list(map(float, fields[1:3])))
            elif fields[0] == 'vn': normals.append(list(map(float, fields[1:4])))
            elif fields[0] == 'f':
                face = [tuple(int(n)-1 for n in part.split('/')) for part in fields[1:]]
                faces.extend((face[0], face[i], face[i+1]) for i in range(1, len(face)-1))
        lo = min(v[2] for v in vertices); hi = max(v[2] for v in vertices)
        # Kenney's -Z muzzle becomes the game's -X. Normalize length to one.
        # Authored bore centers; beveled front lips are not necessarily symmetric.
        muzzle_y = {'b': 0.01318, 'j': 0.09376489, 'r': 0.075, 'h': 0.028752885}[key]
        positions, directions, colors, indices, unique = [], [], [], [], {}
        for face in faces:
            for vi, ti, ni in face:
                token = (vi, ti, ni)
                if token not in unique:
                    unique[token] = len(positions)//3
                    x,y,zv = vertices[vi]; nx,ny,nz = normals[ni]; u,v = uvs[ti]
                    positions.extend(round(n, 5) for n in ((zv-hi)/(hi-lo), (y-muzzle_y)/(hi-lo), -x/(hi-lo)))
                    directions.extend(round(n, 5) for n in (nz,ny,-nx))
                    rgb = texture.getpixel((min(texture.width-1,max(0,int(u*texture.width))), min(texture.height-1,max(0,int((1-v)*texture.height)))))
                    colors.extend(rgb)
                indices.append(unique[token])
        result[key] = {'positions':positions, 'normals':directions, 'colors':colors, 'indices':indices}
        print(f'blaster-{key}: {len(indices)//3} triangles, {len(positions)//3} vertices')
    output = Path(__file__).resolve().parents[1]/'client/art'
    output.mkdir(exist_ok=True)
    (output/'KENNEY-LICENSE.txt').write_bytes(z.read('License.txt'))
    (output/'blasters.js').write_text('/* Kenney Blaster Kit 2.1, CC0. https://kenney.nl/assets/blaster-kit\n * Converted from OBJ, normalized and vertex-colored by scripts/import-blasters.py. */\nwindow.TankBlasterMeshes = '+json.dumps(result,separators=(',',':'))+';\n')
