# Ícono de la app: la muestra (el 1 de oro) acostada sobre el paño verde, como queda en la mesa, y encima tres
# piezas de oro abiertas en abanico: el 2, el 4 y el 5.
# Las cartas salen de naipes.part.js (baraja de Basquetteur, CC BY-SA 3.0).
import re, base64, io, sys, math
from PIL import Image, ImageDraw, ImageFilter
src = open(sys.argv[1]).read()
def carta(k):
    m = re.search(r"'%s': 'data:image/webp;base64,([^']+)'" % re.escape(k), src)
    return Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert('RGBA')
def fondo(S, redondo):
    # paño verde con luz en el centro
    im = Image.new('RGBA', (S, S))
    px = im.load(); c = S / 2
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c * .9) / (S * .75)
            t = max(0, min(1, d))
            r = int(46 + (18 - 46) * t); g = int(122 + (62 - 122) * t); b = int(78 + (40 - 78) * t)
            px[x, y] = (r, g, b, 255)
    if redondo:
        m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=255)
        im.putalpha(m)
    return im
def abanico(S, escala):
    # las tres giran alrededor de un mismo punto abajo, como una mano de cartas abierta
    capa = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    W = int(S * .37 * escala); H = int(W * 488 / 320)
    px, py, R = S / 2, S / 2 + S * .47 * escala, S * .40 * escala
    # la muestra, acostada atrás y asomando por arriba del abanico
    m = carta('1-oro').resize((W, H), Image.LANCZOS).rotate(90, resample=Image.BICUBIC, expand=True)
    msh = Image.new('RGBA', m.size, (0, 0, 0, 0)); msh.putalpha(m.split()[3].point(lambda a: int(a * .45)))
    mx, my = S / 2, S / 2 - S * .285 * escala
    capa.alpha_composite(msh.filter(ImageFilter.GaussianBlur(S * .012)), (int(mx - m.width / 2 + S * .01), int(my - m.height / 2 + S * .018)))
    capa.alpha_composite(m, (int(mx - m.width / 2), int(my - m.height / 2)))
    for k, ang in [('2-oro', -20), ('5-oro', 20), ('4-oro', 0)]:
        c = carta(k).resize((W, H), Image.LANCZOS)
        sh = Image.new('RGBA', c.size, (0, 0, 0, 0)); sh.putalpha(c.split()[3].point(lambda a: int(a * .5)))
        a = math.radians(ang); cx = px + R * math.sin(a); cy = py - R * math.cos(a)
        for img, off in [(sh, (S * .01, S * .018)), (c, (0, 0))]:
            r = img.rotate(-ang, resample=Image.BICUBIC, expand=True)
            if img is sh: r = r.filter(ImageFilter.GaussianBlur(S * .012))
            capa.alpha_composite(r, (int(cx - r.width / 2 + off[0]), int(cy - r.height / 2 + off[1])))
    return capa
for S, redondo, esc, nombre in [(512, True, 1, 'icono-512.png'), (192, True, 1, 'icono-192.png'), (512, False, .78, 'icono-mascara-512.png'), (180, False, .86, 'icono-apple-180.png')]:
    im = fondo(S, redondo); im.alpha_composite(abanico(S, esc)); im.save(nombre)
print('ok')
