# Arma index.html (un solo archivo) a partir de ui.html y las partes.
s = open('ui.html', encoding='utf-8').read()
part = lambda f: open(f, encoding='utf-8').read()
for ph, f in [('/*SONIDO*/', 'sonido.part.js'), ('/*EXTRAS*/', 'extras.part.js'), ('/*NAIPES*/', 'naipes.part.js'), ('/*CARDS*/', 'cards.part.js'), ('/*TALLY*/', 'tally.part.js'), ('/*MESA3D*/', 'mesa3d.part.js'), ('/*HOME*/', 'inicio.part.js'), ('/*RED*/', 'red.part.js'), ('/*CUENTAS*/', 'cuentas.part.js')]:
    s = s.replace(ph, part(f))
# Three.js ya no va adentro: three.min.js se sirve al lado de index.html y se baja al entrar a la mesa 3D (V3.cargar)
s = s.replace('<script>/*THREE*/</script>\n', '')
s = s.replace('<script>/*ENGINE*/</script>', '<script>\n' + part('engine.js') + '\n</script>')
s = s.replace('<script>/*AI*/</script>', '<script>\n' + part('ai.js') + '\n</script>')
s = s.replace('<script>/*TRYSTERO*/</script>', '<script>\n' + part('trystero.min.js').replace('</script', '<\\/script') + '\n</script>')
s = s.replace('<script>/*VISTA*/</script>', '<script>\n' + part('vista.js') + '\n</script>')
import json
# la dirección del juego (para los links al compartir, el canonical y el sitemap): cambiar acá cuando haya dominio
SITIO = 'https://truco-uruguayo.tomasaldaya.workers.dev'
s = s.replace('/*SITIO*/', SITIO)
import hashlib
s = s.replace('/*VERSION*/', hashlib.md5(s.encode()).hexdigest()[:8])   # para saber de qué versión es cada error
open('robots.txt', 'w').write('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ' + SITIO + '/sitemap.xml\n')
open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + ''.join('  <url><loc>%s/%s</loc></url>\n' % (SITIO, p) for p in ['', 'terminos.html', 'privacidad.html']) + '</urlset>\n')
s = s.replace("/*REGLAMENTO*/''", json.dumps(part('reglamento.txt'), ensure_ascii=False).replace('</', '<\\/'))
# controles: que no falte ninguna parte ni el reglamento (si falla, no se escribe index.html)
assert 'const REGLAMENTO = "EL TRUCO' in s, 'falta el reglamento (const REGLAMENTO en extras.part.js)'
assert not any(ph in s for ph in ['/*SONIDO*/', '/*EXTRAS*/', '/*NAIPES*/', '/*CARDS*/', '/*TALLY*/', '/*MESA3D*/', '/*HOME*/', '/*RED*/', '/*CUENTAS*/', '/*REGLAMENTO*/']), 'quedó una parte sin reemplazar'
open('index.html', 'w', encoding='utf-8').write(s)
