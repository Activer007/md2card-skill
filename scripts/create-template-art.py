"""Reproducible original code-native artwork. No input image or external asset.
Pillow draws shapes on new canvases; this is not image editing or a renderer.
Run: python scripts/create-template-art.py --out /tmp/md2card-original-art
Requires Pillow and a local DejaVu Sans font. Output must be absent or empty.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse, hashlib, json
parser = argparse.ArgumentParser(description='Draw original demonstration assets into an empty directory.')
parser.add_argument('--out', required=True, type=Path)
parser.add_argument('--font', default='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
args = parser.parse_args()
OUT = args.out.resolve()
if OUT.exists() and (not OUT.is_dir() or any(OUT.iterdir())):
    parser.error('--out must be absent or empty; existing assets are never overwritten.')
OUT.mkdir(parents=True, exist_ok=True)
INK = '#353c35'
font = ImageFont.truetype(args.font, 48)
records = []
def canvas(w, h, bg):
    im = Image.new('RGB', (w, h), bg)
    return im, ImageDraw.Draw(im)
def save(im, name, desc):
    path = OUT / name
    im.save(path, format='PNG', optimize=True)
    records.append({'file': name, 'dimensions': list(im.size), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'type': 'original-code-native-raster', 'description': desc, 'source': 'scripts/create-template-art.py', 'license': 'MIT; original artwork created for md2card-skill', 'notDocumentary': True})
def paper(d, box, fill='#fff9e9', tab=None):
    d.rounded_rectangle(box, 12, fill=fill, outline=INK, width=5)
    if tab:
        x,y,x2,y2=box; d.rounded_rectangle((x+20,y-15,x+105,y+17),8,fill=tab,outline=INK,width=4)
def face(d, x, y, rad=53):
    d.ellipse((x-rad,y-rad,x+rad,y+rad), fill='#efbd87',outline=INK,width=5)
    d.ellipse((x-20,y-8,x-11,y+1),fill=INK); d.ellipse((x+11,y-8,x+20,y+1),fill=INK)
    d.arc((x-17,y+3,x+17,y+27),0,180,fill=INK,width=4)
# T40 is a complete, independently authored close-up. It is not a crop.
im,d=canvas(1200,680,'#f3eddd')
d.rounded_rectangle((80,70,1120,610),28,fill='#d6c5a3',outline='#8a7557',width=5)
for x in range(100,1120,22): d.line((x,85,x,595),fill='#c7b58e',width=2)
for y in range(90,610,22): d.line((90,y,1110,y),fill='#c2ae87',width=2)
d.rectangle((80,390,1120,610),fill='#ab9876')
for x in range(110,1100,34):
    d.line((x,350,x+16,350),fill='#514a38',width=7)
for x in range(100,1090,35):
    d.line((x,415,x+25,450),fill='#f9edcd',width=7)
    d.line((x,450,x+25,415),fill='#f9edcd',width=7)
for num, cx,cy, tx,ty in [(1,320,190,510,350),(2,940,185,810,430)]:
    d.line((cx,cy+47,tx,ty),fill=INK,width=5)
    d.ellipse((tx-9,ty-9,tx+9,ty+9),fill=INK)
    d.ellipse((cx-48,cy-48,cx+48,cy+48),fill='#fffaf0',outline=INK,width=5)
    d.text((cx,cy),str(num),font=font,fill=INK,anchor='mm')
save(im,'original-seam-detail.png','Full-frame original close-up illustration of a fictional fabric edge. Marker 1 points to parallel short stitches; marker 2 points to crossed lines. Not cropped from another image; not a manufacturing or strength claim.')
# T43: original geometry-based comic panels, no copied characters or artwork.
im,d=canvas(900,480,'#f7ddb5')
face(d,170,155); d.rounded_rectangle((105,215,235,390),25,fill='#c36e5a',outline=INK,width=5)
d.line((225,270,395,310),fill=INK,width=8)
for b in [(360,225,580,390),(510,140,730,310),(600,260,820,425)]: paper(d,b)
save(im,'original-comic-search.png','Original fictional scene: a geometric adult-like character beside three blank loose cards. No embedded dialogue; the explanation stays in Markdown.')
im,d=canvas(900,480,'#c7ded2')
d.rounded_rectangle((150,150,765,395),22,fill='#e7b965',outline=INK,width=6)
d.rounded_rectangle((150,105,385,175),15,fill='#e7b965',outline=INK,width=6)
paper(d,(345,60,655,300),tab='#c36e5a'); d.line((410,135,575,135),fill='#8a8d7a',width=8); d.line((410,180,535,180),fill='#8a8d7a',width=8)
d.polygon([(155,235),(765,235),(715,410),(195,410)],fill='#edcc8c',outline=INK)
d.line([(155,235),(765,235),(715,410),(195,410),(155,235)],fill=INK,width=6)
save(im,'original-comic-file.png','Original fictional scene: a blank card with a colored tab being placed in an unbranded folder. No factual performance claim.')
im,d=canvas(1200,360,'#d8d6e8')
face(d,165,115,48); d.rounded_rectangle((105,167,228,315),25,fill='#c36e5a',outline=INK,width=5)
d.line((225,205,362,170),fill=INK,width=8)
paper(d,(355,65,565,275),tab='#c36e5a')
d.rounded_rectangle((735,80,1065,300),20,fill='#e7b965',outline=INK,width=6)
d.rounded_rectangle((735,50,875,100),10,fill='#e7b965',outline=INK,width=5)
d.line((620,170,682,170),fill=INK,width=6); d.polygon([(682,170),(660,154),(660,186)],fill=INK)
save(im,'original-comic-return.png','Original fictional scene: the same geometric character holds a tabbed card beside an unbranded folder. Arrow only illustrates the authored return step, not a factual finding.')
# T47: two intentionally schematic cooking illustrations, not exact portions.
im,d=canvas(900,430,'#f7efd9')
d.rounded_rectangle((90,55,810,375),45,fill='#dfbc82',outline='#785d3d',width=5)
d.ellipse((680,75,748,143),outline='#aa8350',width=6)
d.rounded_rectangle((190,135,450,238),48,fill='#4c7b40',outline=INK,width=5)
for x,y in [(475,205),(555,245),(615,170)]:
    d.ellipse((x,y,x+105,y+70),fill='#d3dfa0',outline='#4c7b40',width=9)
    for dx,dy in [(40,23),(62,31),(45,43)]: d.ellipse((x+dx,y+dy,x+dx+7,y+dy+5),fill='#9aa960')
d.polygon([(300,290),(540,290),(565,330),(300,330)],fill='#e1e6dd',outline=INK)
d.rounded_rectangle((190,290,315,330),12,fill='#795942',outline=INK,width=4)
save(im,'original-cucumber-prep.png','Original schematic cucumber and cut slices on an unbranded cutting board. Illustration does not encode portion size or safe cutting instruction.')
im,d=canvas(900,430,'#eef0df')
d.pieslice((190,-30,710,390),0,180,fill='#adc9c0',outline=INK,width=6)
d.ellipse((190,90,710,280),fill='#f9f5e9',outline=INK,width=6)
for x,y in [(295,130),(410,145),(505,125),(355,190),(490,195)]:
    d.ellipse((x,y,x+95,y+55),fill='#d3dfa0',outline='#4c7b40',width=7)
d.line((610,135,785,55),fill='#795942',width=18)
d.ellipse((570,110,650,160),fill='#c9aa75',outline=INK,width=4)
save(im,'original-cucumber-mix.png','Original schematic bowl of cucumber slices and a spoon. No promise of a tested recipe, precise volume, nutrition or health effect.')
# T48: two fictional, unbranded desk objects with visible, comparable structures.
im,d=canvas(900,430,'#f1e6d3')
d.polygon([(160,130),(620,130),(760,220),(300,220)],fill='#e8c596',outline=INK)
d.polygon([(160,130),(300,220),(300,345),(160,245)],fill='#a98a62',outline=INK)
d.polygon([(300,220),(760,220),(735,345),(300,345)],fill='#c7a374',outline=INK)
d.line([(160,130),(620,130),(760,220),(735,345),(300,345),(160,245),(160,130)],fill=INK,width=6)
d.polygon([(215,150),(594,150),(695,215),(313,215)],fill='#80684d',outline=INK)
save(im,'original-open-tray.png','Original fictional unbranded open desktop tray. Drawing demonstrates an open top only; dimensions, material, durability, capacity and prices are unspecified.')
im,d=canvas(900,430,'#e2e8df')
d.polygon([(180,155),(620,155),(745,230),(305,230)],fill='#abc0b0',outline=INK)
d.polygon([(180,155),(305,230),(305,345),(180,265)],fill='#819c8a',outline=INK)
d.polygon([(305,230),(745,230),(745,345),(305,345)],fill='#94ae9c',outline=INK)
d.line([(180,155),(620,155),(745,230),(745,345),(305,345),(180,265),(180,155)],fill=INK,width=6)
d.polygon([(155,85),(620,85),(770,170),(303,170)],fill='#c3d0be',outline=INK)
d.line([(155,85),(620,85),(770,170),(303,170),(155,85)],fill=INK,width=6)
d.line((303,170,303,200),fill=INK,width=5)
d.line((770,170,770,200),fill=INK,width=5)
save(im,'original-lidded-box.png','Original fictional unbranded desktop box with its separate lid shown just above it. No dimensions, material, waterproofing, price, rating or health claim.')
(OUT/'provenance.json').write_text(json.dumps({'created':'2026-10-24','assets':records},ensure_ascii=False,indent=2)+'\n')
print(f'Wrote {len(records)} original PNG assets and provenance.json')
