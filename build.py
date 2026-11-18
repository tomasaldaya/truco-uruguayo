# Arma index.html (un solo archivo) a partir de ui.html y las partes.
s = open('ui.html', encoding='utf-8').read()
part = lambda f: open(f, encoding='utf-8').read()
for ph, f in [('/*SONIDO*/', 'sonido.part.js'), ('/*NAIPES*/', 'naipes.part.js'), ('/*CARDS*/', 'cards.part.js'), ('/*TALLY*/', 'tally.part.js'), ('/*MESA3D*/', 'mesa3d.part.js'), ('/*HOME*/', 'inicio.part.js'), ('/*RED*/', 'red.part.js'), ('/*CUENTAS*/', 'cuentas.part.js')]:
    s = s.replace(ph, part(f))
s = s.replace('<script>/*THREE*/</script>', '<script>\n' + part('three.min.js').replace('</script', '<\\/script') + '\n</script>')
s = s.replace('<script>/*ENGINE*/</script>', '<script>\n' + part('engine.js') + '\n</script>')
s = s.replace('<script>/*AI*/</script>', '<script>\n' + part('ai.js') + '\n</script>')
s = s.replace('<script>/*TRYSTERO*/</script>', '<script>\n' + part('trystero.min.js').replace('</script', '<\\/script') + '\n</script>')
s = s.replace('<script>/*VISTA*/</script>', '<script>\n' + part('vista.js') + '\n</script>')
open('index.html', 'w', encoding='utf-8').write(s)
