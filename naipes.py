# Uso: git clone https://github.com/gjenkins20/spanish-playing-cards-svg && python3 naipes.py spanish-playing-cards-svg
# (necesita rsvg-convert y Pillow). Después: python3 build.py
# Arma naipes.part.js: las 40 cartas del truco y el dorso del mazo libre de Basquetteur
# (Wikimedia Commons, CC BY-SA 3.0; SVG de github.com/gjenkins20/spanish-playing-cards-svg),
# pasadas a WebP con fondo claro y esquinas redondeadas.
import subprocess, base64, io, sys
from PIL import Image, ImageDraw
SRC = sys.argv[1] if len(sys.argv) > 1 else 'spanish-playing-cards-svg'; OUT = 'naipes.part.js'
W, Q = 320, 80   # ancho en píxeles y calidad WebP
SUITS = {'oro': 'coins', 'copa': 'cups', 'espada': 'swords', 'basto': 'clubs'}
NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]
def raster(name):
    png = subprocess.run(['rsvg-convert', '-w', str(W * 2), f'{SRC}/{name}.svg'], capture_output=True, check=True).stdout
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    H = round(im.height * W / im.width)
    base = Image.new('RGBA', im.size, (242, 242, 242, 255))
    base.alpha_composite(im)
    base = base.resize((W, H), Image.LANCZOS)
    mask = Image.new('L', (W * 4, H * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W * 4 - 1, H * 4 - 1), radius=int(W * 4 * .055), fill=255)
    base.putalpha(mask.resize((W, H), Image.LANCZOS))
    buf = io.BytesIO(); base.save(buf, 'WEBP', quality=Q, method=6)
    return buf.getvalue(), (W, H)
out = {}; total = 0
for s, en in SUITS.items():
    for n in NUMS:
        b, size = raster(f'card_{en}_{n:02d}'); total += len(b)
        out[f'{n}-{s}'] = 'data:image/webp;base64,' + base64.b64encode(b).decode()
b, size = raster('card_back'); total += len(b)
out['back'] = 'data:image/webp;base64,' + base64.b64encode(b).decode()
with open(OUT, 'w') as f:
    f.write('// ---------- Naipes ----------\n')
    f.write('// Baraja española libre de Basquetteur (Wikimedia Commons, https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards),\n')
    f.write('// licencia CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). Tomada de los SVG de\n')
    f.write('// https://github.com/gjenkins20/spanish-playing-cards-svg y pasada a WebP con fondo claro y esquinas\n')
    f.write('// redondeadas (cambios hechos para este juego, bajo la misma licencia). Lo arma tools/naipes.py.\n')
    f.write(f'// {W}×{size[1]} px; las 40 cartas del truco (sin ochos ni nueves) y el dorso.\n')
    f.write('const NAIPES = {\n')
    for k, v in out.items(): f.write(f"  '{k}': '{v}',\n")
    f.write('};\n')
print('cartas', len(out), 'bytes', total, 'archivo', sum(len(v) for v in out.values()))
