# La imagen que muestran WhatsApp, Instagram, Facebook y compañía cuando se comparte el link del juego
# (compartir.jpg, 1200 x 630). El abanico del logo (el 2, el 4 y el 5 de oro) sobre el paño, y el nombre.
# Uso: python3 tools/compartir/compartir.py naipes.part.js
import sys, math, importlib.util
from PIL import Image, ImageDraw, ImageFont, ImageFilter
# las cartas y el abanico, iguales que en el ícono (tools/icono/icono.py), sin escribir los íconos
src = open(sys.argv[1]).read()
ic = open('tools/icono/icono.py').read().split('\nfor S, redondo')[0].replace("src = open(sys.argv[1]).read()", "")
ns = {'src': src}; exec(ic, ns)
W, H = 1200, 630
im = Image.new('RGBA', (W, H)); px = im.load()
for y in range(H):
    for x in range(W):
        d = min(1, math.hypot(x - W * .33, y - H * .55) / (W * .75))
        px[x, y] = (int(46 + (18 - 46) * d), int(122 + (52 - 122) * d), int(78 + (34 - 78) * d), 255)
S = 620
im.alpha_composite(ns['abanico'](S, 1.0), (int(W * .33 - S / 2), int(H / 2 - S / 2 + 10)))
dib = ImageDraw.Draw(im)
serif = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
sans = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
x0 = 640
dib.text((x0, 120), 'Falta envido', font=ImageFont.truetype(serif, 78), fill=(243, 210, 122))
dib.text((x0, 212), 'y truco', font=ImageFont.truetype(serif, 78), fill=(243, 210, 122))
f = ImageFont.truetype(sans, 33)
for i, l in enumerate(['Truco uruguayo online:', 'con amigos, mano a mano,', 'en parejas o en tercetos.', 'Con flor. Gratis, en el', 'navegador.']):
    dib.text((x0 + 4, 340 + i * 46), l, font=f, fill=(244, 236, 220))
im.convert('RGB').save('compartir.jpg', quality=86, optimize=True, progressive=True)   # menos de 300 KB: WhatsApp no muestra más grandes
print('ok')
