# Truco Uruguayo

Juego de truco uruguayo para el navegador, según el *Reglamento del Truco Uruguayo*
(transcripción de Tomás Aldaya, noviembre 2025, en `reglamento.txt`).

## Archivos

- `engine.js` — motor de reglas (2, 4 o 6 jugadores, reglas de la mesa, modo realista, tercetos, a ley de juego).
- `ai.js` — jugadores de la computadora (simulación Monte Carlo, niveles fácil/normal/difícil).
- `ui.html` — interfaz (mesa 3D y mesa 2D). Tiene marcadores `/*THREE*/`, `/*ENGINE*/`, `/*AI*/`, `/*CARDS*/`, `/*TALLY*/`, `/*MESA3D*/`, `/*HOME*/`.
- `inicio.part.js` — pantalla de inicio, configuración y guardado del partido.
- `vista.js` — lo que ve cada jugador: una copia del partido sin lo que ese lugar no puede saber.
- `red.part.js` — mesa compartida: crear una mesa, unirse, lugares, la conexión por internet y los mensajes entre anfitrión e invitados.
- `sonido.part.js` — sonidos hechos con WebAudio (sin archivos).
- `trystero.min.js` — Trystero 0.27 (licencia MIT) en un solo archivo: hace que los navegadores se encuentren y se conecten directo (WebRTC).
- `mesa3d.part.js` — la mesa 3D: escena, jugadores con cara y señas, cartas animadas, cámara.
- `three.min.js` — recorte de Three.js r187 (licencia MIT) con solo lo que usa la mesa 3D.
- `three-entry.js` — lista de lo que entra en `three.min.js` y el comando para regenerarlo.
- `naipes.part.js` — las 40 cartas y el dorso: baraja española libre de Basquetteur (ver "Cartas").
- `naipes.py` — arma `naipes.part.js` a partir de los SVG originales.
- `cards.part.js` — cartas en pantalla (la baraja del juego o el mazo que cargue el jugador).
- `tally.part.js` — tanteador de fósforos.
- `server/mesa.mjs` — una mesa compartida en el servidor: lugares, partido, computadora, tiempo, chat.
- `server/worker.mjs` — el servidor en Cloudflare: sirve la página y una sala (Durable Object) por mesa.
- `server/prueba-mesa.mjs` — pruebas de la mesa del servidor sin Cloudflare: `node server/prueba-mesa.mjs`.
- `wrangler.jsonc`, `.github/workflows/servidor.yml` — configuración y publicación automática en Cloudflare.
- `build.py` — arma `index.html` (un solo archivo; solo, anda sin internet; las tipografías se bajan de Google Fonts) a partir de lo anterior: `python3 build.py`.
- `test.js` — pruebas de reglas y partidos simulados: `node test.js`.
- `index.html` — el juego armado, listo para abrir en el navegador.

## Jerga

Tocar = envido, gritar = truco, cantar = flor (o cantar los tantos).

## Decisiones tomadas con el usuario

- Cartas iguales de rivales: parda (Arts. 57–59). Opción: gana el más mano (Art. 12).
- La flor se canta en tu turno; si alguien la cantó, los demás en orden del mano al que dio.
- Si tu compañero toca o grita antes de que cantes tu flor: queda anulada (por defecto, sin pena)
  o decís "tengo flor" (opción). Solo lo sabés vos: a los demás no les llega.
- La computadora no toca ni grita mientras un compañero suyo todavía puede cantar flor (no habló
  ni jugó): en parejas y tercetos canta el que ya tiene a sus compañeros jugados, normalmente el
  pie. Una persona sí puede hacerlo, y se atiene a las consecuencias.
- Señas pescadas: de cada 50 señas hechas, una la pesca algún rival.
- Tiempo para decidir: 30 segundos por decisión de cada persona (opción: 60 o sin límite). Si se
  acaba, decide la computadora por esa persona; la cuenta se frena con un menú abierto. En una
  mesa compartida, si alguien no toca "Siguiente mano", a los 15 segundos se sigue igual (el
  cartel de fin de mano muestra la cuenta).
- Si tocan y un rival tiene flor, la canta antes de contestar y anula el envido (Art. 27).
- El envido está primero: se puede tocar contra un truco mientras no hayas jugado tu primera carta.
- Si un rival te canta algo y podés contestar, contestás vos (no tu compañero de la computadora).
- Paso: salís de la mano con tus cartas (para poder mostrarlas). Mazo sin ser el pie: te vas solo
  y tu equipo sigue (por defecto); si se va el pie, pierde el equipo. Opción: Art. 90.
- A ley de juego: solo en parejas y tercetos, cuando algún equipo entró en buenas; versión
  simplificada del Cap. 7 (sin los reenvites del Art. 76 ni el Art. 79). Mientras se decide nadie
  ve sus cartas ni la muestra (la computadora decide solo por el tanteador). Impuesta, los
  desafiados ven sus cartas y cada uno dice en su turno "con ley" o "a punto"; contesta el pie de
  ese equipo. Los que la impusieron ven sus cartas cuando llega la respuesta (Arts. 74, 75 y 79).
- Pico a pico (duelos de tercetos): las piezas se juegan dadas vuelta y solo las ven los dos del
  duelo; a los demás les llegan tapadas, también en los datos.
- Señas: el dos común es abrir un poco la boca y el as de copa u oro, sacar un poquito la lengua.
  Con dos cartas iguales (dos matas, dos tres, perico y perica) la seña se hace dos veces.
- Botones: quiero en verde, no quiero en rojo, truco y retruco en gris pizarra, envido en azul,
  flor en dorado.
- Modo realista: faltas ocultas que se descubren al verse las cartas (Art. 45 o tres cartas jugadas).
- Las ilustraciones del mazo Tatú no se incluyen: el juego usa la baraja española libre de
  Basquetteur (ver "Cartas"), y el jugador puede cargar su propia imagen del mazo en "Tu mazo".

## Sonido

Suaves y cortos, hechos en el momento con WebAudio: barajar al empezar la mano, repartir, cada
carta que cae en la mesa, un golpe en la mesa al gritar truco, un acorde chico con la flor, dos
notas cuando te toca, un tic en tus últimos cinco segundos, tres notas al ganar la mano y el aviso
del chat. En Configuración se apagan o se cambia el volumen (bajo por defecto).

## Cartas

Baraja española libre de **Basquetteur**, publicada en
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Spanish_playing_cards) con licencia
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.es). Los SVG vienen de
[gjenkins20/spanish-playing-cards-svg](https://github.com/gjenkins20/spanish-playing-cards-svg).
Cambios hechos para este juego: se pasaron a WebP de 320 px con fondo claro y esquinas
redondeadas, y se dejaron solo las 40 cartas del truco (sin ochos ni nueves). Esas imágenes
(`naipes.part.js`) se comparten con la misma licencia CC BY-SA 3.0. El crédito también aparece en
la pantalla de inicio.

## Pantalla de inicio

Es lo primero que aparece al abrir el juego, y se vuelve a ella con el botón **Menú**.

- **Continuar partido:** el partido se guarda en este navegador en cada jugada, así que sigue
  donde quedó aunque cierres la página o el navegador. Se borra al terminar el partido.
- **Partido nuevo:** mano a mano, parejas o tercetos. Si hay un partido sin terminar, pide
  confirmación antes de empezar otro.
- **Configuración:** todo en un lugar y se guarda al cambiarlo. Pantalla (mesa 3D o 2D, ayudas,
  velocidad), partido (dificultad, modo realista) y reglas de la mesa (rigen desde el próximo partido).
- **Tu mazo**, **Cómo se juega** y **Estadísticas**.

Mientras se ve la pantalla de inicio, el partido queda en pausa. Durante el juego, arriba quedan
Menú, Mesa 3D/2D, Velocidad, Ayudas y Jerarquía.

## Jugar con otros (por internet)

**Las mesas viven en un servidor** (Cloudflare Workers con Durable Objects: una sala por código).
Nadie tiene que dejar una pestaña abierta: si quien creó la mesa se va o recarga, el partido sigue
(la computadora juega por él hasta que vuelve con su lugar). El servidor corre el motor y la
computadora y le manda a cada uno solo su vista, así nadie tiene en su navegador cartas ajenas. Los
datos del partido van por una conexión web común (WebSocket), que pasa en cualquier red. La voz
sigue yendo directo entre navegadores (una sala de Trystero aparte, solo para eso).

Si el servidor no contesta en unos segundos, la mesa se abre como antes, de navegador a navegador
(lo que sigue más abajo sobre "dejá esta pestaña abierta" vale para ese caso).

Publicación: cada cambio en `main` corre las pruebas y publica con `wrangler deploy` (GitHub
Actions, con el secreto `CLOUDFLARE_API_TOKEN`). Una mesa sin nadie conectado se borra a las dos
horas. Para probar el servidor en la propia máquina: `npx wrangler dev` (con `public/index.html`) y
abrir http://127.0.0.1:8787.

El juego está publicado en **https://tomasaldaya.github.io/truco-uruguayo/** (GitHub Pages, desde
la rama `main` de este repositorio). Desde la pantalla de inicio: **Crear una mesa** o **Unirme a
una mesa**.

- **Crear una mesa:** te da un código de cuatro letras y un link (`…/#mesa=ABCD`) para copiar o
  compartir. Elegís el modo y ves los lugares por equipo. Los lugares sin persona los juega la
  computadora. "Empezar partido" arranca cuando quieras. **Dejá esa pestaña abierta:** el partido
  corre en el navegador de quien crea la mesa.
- **Unirme a una mesa:** con el link se abre la pantalla con el código ya escrito; ponés tu nombre
  y listo. Te sienta de compañero del anfitrión si hay lugar; con "Sentarme acá" elegís otro.
- **Cada uno ve la mesa desde su lugar:** vos abajo, tu equipo de celeste, "Nosotros" es tu
  equipo, y en "Lo que se dijo" lo tuyo aparece como "Vos".
- **Nadie recibe lo que no puede ver:** el anfitrión tiene el partido completo y le manda a cada
  invitado solo su vista (`vista.js`), por una conexión directa con él: sus cartas, las jugadas,
  las señas de sus compañeros y las que pescó. Las cartas ajenas llegan tapadas, también en los
  datos. `node test.js` lo comprueba en partidos simulados de 2, 4 y 6.
- **Señas entre personas:** las hacés con los botones de siempre; tu compañero ve tu muñeco
  haciendo el gesto, y los rivales te pueden pescar como con la computadora.
- **Fin de mano:** se sigue cuando todos tocan "Siguiente mano"; el botón dice a quién se
  espera ("Esperando a Juan…").
- **Si alguien se va o se le corta** (cierra la pestaña, se queda sin señal, el celular duerme el
  navegador), a los 12 a 16 segundos la computadora sigue por él con su nombre. Cuando vuelve a
  entrar con el mismo nombre (o se le despierta la pestaña), recupera su lugar solo.
- **Recargar la página** no te saca de la mesa: la pestaña se acuerda en qué mesa estabas. Si
  recarga el anfitrión, el partido sigue donde estaba y los invitados vuelven solos; mientras
  tanto ven "Se cortó la conexión con Ana. Esperando que vuelva…".
- **Llegar con el partido empezado:** quien entra con otro nombre ve la mesa y elige un lugar
  de la computadora con "Sentarme acá".
- **Si el anfitrión va al menú**, el partido se detiene y los invitados ven el aviso hasta que
  vuelve.
- **Modo realista:** cada uno juega con el suyo (el de su configuración al entrar a la mesa).
- **Chat de la mesa:** en el costado (y en la pantalla de la mesa antes de empezar). Cada mensaje
  pasa por el anfitrión, que lo reparte, así todos lo ven en el mismo orden. Si el chat no está a
  la vista (en el celular queda abajo), el mensaje aparece un momento arriba de todo. El que llega
  tarde recibe los últimos mensajes.
- **Voz (pulsar para hablar):** primero se toca "Prender el micrófono" (pide permiso y conecta,
  tarda unos segundos); después se habla manteniendo apretado el botón 🎙 (en el celular, el
  redondo de abajo a la derecha) o la tecla V. Solo manda sonido mientras está apretado (un minuto
  como mucho seguido). Viaja directo entre navegadores,
  con cancelación de eco. Al lado del nombre de quien habla aparece 🎙. "Escuchando voces" apaga
  las voces de los demás. Solo en mesas por internet.
- El partido de una mesa compartida no se guarda en el navegador; tu partido solo, si tenías
  uno, sigue ahí al salir de la mesa.

Cómo se conectan: con [Trystero](https://github.com/dmotz/trystero). Para encontrarse, los
navegadores usan relays públicos de Nostr (sin cuentas ni servidor propio); después hablan
directo por WebRTC y los datos del partido no pasan por ningún servidor. El código de la mesa es
también la clave del encuentro (`password` de Trystero), así que sin el código nadie entra.

- **Si a alguien no le conecta** ("Encontré la mesa pero no pude conectarme"): algunas redes, sobre
  todo los datos del celular y redes de empresas, no dejan conectarse directo. Para esas hace falta
  un relevo (TURN): se crea una cuenta gratis (por ejemplo, Metered Open Relay o Cloudflare) y se
  ponen los datos en `NET_TURN`, al principio de `red.part.js`.
- **El anfitrión tiene todo el partido** en su navegador: alguien que sepa programar podría
  espiar. Entre amigos no es problema; para jugar con desconocidos haría falta un servidor propio.

Sin internet (o con `localStorage['truco.red'] = 'local'`), la mesa compartida funciona entre
pestañas del mismo navegador con BroadcastChannel, que es como se prueba sin red. Para probar la
conexión de verdad sin salir de una máquina: un relay Nostr local y
`localStorage['truco.relays'] = 'ws://127.0.0.1:7777'`.

## Mesa 3D

Es la vista por defecto; el botón **Mesa: 3D / 2D** (o Configuración) cambia a la mesa 2D y queda guardado.
Si el navegador no tiene WebGL, se juega en 2D y el botón queda desactivado.

- **Cámara:** arrastrar gira alrededor de la mesa, la rueda o el pellizco acerca y aleja.
  "Tu lugar" (o doble clic) vuelve a tu silla; "Desde arriba" muestra toda la mesa.
- **Tus cartas:** abajo, pegadas a la cámara. Las que podés jugar se levantan un poco; clic
  o toque para jugarlas, o las teclas 1, 2 y 3. Con Ayudas se ven las insignias pieza, mata y fío.
- **Ver la muestra de cerca:** con el cursor encima de la muestra la cámara se acerca a mirarla
  (en pantallas táctiles, tocándola; con el teclado, la tecla M) y al salir vuelve. En la mesa 2D
  la muestra se agranda.
- **Mazo:** queda sobre la mesa a la derecha del que dio, con la muestra boca arriba debajo,
  asomando hacia el centro como se pone en la realidad; si la muestra es una negra (sota, caballo
  o rey) asoma la parte de arriba, con el palo. En la mesa 2D asoma la mitad de arriba. Así
  se ve enseguida quién dio. Al empezar cada mano se desliza hasta el nuevo repartidor. Cuando
  das vos, va donde tus cartas no lo tapan.
- **Cartas:** se juntan en el mazo y se reparten desde ahí, la muestra se da vuelta (boca abajo
  mientras se decide a ley de juego), cada carta jugada vuela a la fila de quien la jugó, una
  columna por baza. La baza ganada tiene borde dorado; la parda, gris. Al terminar la mano, las
  cartas que se muestran (Art. 45) quedan boca arriba y las demás boca abajo; al irse al mazo
  vuelven al mazo; al pasar quedan boca abajo frente al jugador.
- **Señas:** tu compañero te mira y hace con la cara los gestos del Art. 102 (cejas, labios,
  nariz, guiño, morderse el labio, abrir la boca, cerrar los ojos). Un recuadro muestra su cara
  de cerca con el gesto, y el significado si están las Ayudas. Las señas que le pescás a un
  rival también se ven: mira a su compañero y hace el gesto. Tocá a un jugador (o su nombre)
  para volver a mirarle las señas. Cuando le hacés señas a tu compañero, asiente.
- **Lo que se dice:** una etiqueta chica arriba del nombre de cada jugador que se va a los dos
  segundos (la tuya, en la esquina de abajo), sin tapar la mesa; el que habla mueve la boca y reacciona
  (se adelanta al gritar truco, niega con la cabeza al no querer, asiente al querer) y los
  demás lo miran. El que está pensando mira sus cartas; un brillo en la mesa marca a quién le toca.
- La mesa 2D sigue igual que antes.

## Menús

Tu mazo, Estadísticas y Cómo se juega se abren en una capa propia,
encima del cuadro de fin de mano, y mientras están abiertos el juego espera (la computadora no juega
y la mano no se cierra por detrás). Escape los cierra.
