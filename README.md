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
- `sonido.part.js` — sonidos hechos con WebAudio (sin archivos), también los del panel de la mesa.
- `extras.part.js` — el panel "En la mesa" (dichos, gestos y sonidos), la racha 🔥, el reglamento completo y los logros.
- `trystero.min.js` — Trystero 0.27 (licencia MIT) en un solo archivo: hace que los navegadores se encuentren y se conecten directo (WebRTC).
- `mesa3d.part.js` — la mesa 3D: escena, jugadores con cara y señas, cartas animadas, cámara.
- `three.min.js` — recorte de Three.js r187 (licencia MIT) con solo lo que usa la mesa 3D (y el bar: luces puntuales, botellas torneadas y piezas juntadas).
- `three-entry.js` — lista de lo que entra en `three.min.js` y el comando para regenerarlo.
- `naipes.part.js` — las 40 cartas y el dorso: baraja española libre de Basquetteur (ver "Cartas").
- `naipes.py` — arma `naipes.part.js` a partir de los SVG originales.
- `cards.part.js` — cartas en pantalla (la baraja del juego o el mazo que cargue el jugador).
- `tally.part.js` — tanteador de fósforos.
- `server/mesa.mjs` — una mesa compartida en el servidor: lugares, partido, computadora, tiempo, chat.
- `server/worker.mjs` — el servidor en Cloudflare: sirve la página, una sala (Durable Object) por mesa y el objeto de las cuentas.
- `server/cuentas.mjs` — cuentas, ranking (general y del mes), estadísticas, historial, amigos y gremios, en SQLite.
- `server/google.mjs` — verifica el token del botón "Acceder con Google" (firma, app y vencimiento).
- `server/prueba-cuentas.mjs` — pruebas de las cuentas con SQLite de Node: `node server/prueba-cuentas.mjs`.
- `cuentas.part.js` — las pantallas de la cuenta: entrar, perfil, ranking, amigos e invitaciones.
- `privacidad.html` — la política de privacidad (la pide Google para el acceso con Google).
- `server/prueba-mesa.mjs` — pruebas de la mesa del servidor sin Cloudflare: `node server/prueba-mesa.mjs`.
- `server/prueba-vivo.mjs` — prueba del servidor ya publicado (dos jugadores por WebSocket).
- `server/actividad.mjs` — cuánto se usó el juego (mesas, gente, aparatos, errores), solo totales. En GitHub: Actions → "Actividad del juego" → Run workflow.
- `wrangler.jsonc`, `.github/workflows/servidor.yml` — configuración y publicación automática en Cloudflare.
- `build.py` — arma `index.html` a partir de lo anterior: `python3 build.py`. Three.js (`three.min.js`) va al lado y se baja al entrar a la mesa 3D; con los dos archivos anda sin internet (las tipografías se bajan de Google Fonts).
- `server/protocolo.mjs` — los tipos de los mensajes del jugador (JSDoc, revisados por `npx tsc`) y su validación.
- `package.json`, `playwright.config.js`, `e2e/` — pruebas de navegador (Playwright contra `wrangler dev`) y herramientas: `npm install`, `npm run navegador`, `npm run local`.
- `tsconfig.json` — TypeScript de a poco: qué archivos revisa `npx tsc`.
- `.github/workflows/volver-atras.yml` — volver atrás una publicación del servidor.
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
  velocidad), sonido y partido (dificultad, modo realista). Las reglas de la mesa ya no se cambian ahí (ver abajo).
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

El servidor está en **https://truco-uruguayo.tomasaldaya.workers.dev** (sirve también el juego) y
la página de GitHub Pages lo usa (constante `SERVIDOR` al principio de `red.part.js`).

Publicación: cada cambio en `main` corre las pruebas, publica con `wrangler deploy` (GitHub
Actions, con los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`) y después prueba el
servidor publicado con dos jugadores de mentira (`node server/prueba-vivo.mjs <dirección>`). Si la
cuenta de Cloudflare todavía no tiene subdominio en workers.dev, la publicación registra uno. Una
mesa sin nadie conectado se borra a las dos horas. Para probar el servidor en la propia máquina: `npx wrangler dev` (con `public/index.html`) y
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
  espiar. Por eso lo normal es el servidor de mesas; esto vale solo cuando el servidor no contesta.

Sin internet (o con `localStorage['truco.red'] = 'local'`), la mesa compartida funciona entre
pestañas del mismo navegador con BroadcastChannel, que es como se prueba sin red. Para probar la
conexión de verdad sin salir de una máquina: un relay Nostr local y
`localStorage['truco.relays'] = 'ws://127.0.0.1:7777'`.

## Pantalla de inicio (con el servidor)

Lo primero es **Jugar con gente**: los tres modos de las mesas públicas, con quiénes esperan, el botón de Google
para quien no entró y las tres primeras mesas que esperan gente. Arriba, con cuenta, la ficha (apodo, puntos,
perfil, ranking, amigos). Después **Con amigos** (mesa privada con código) y abajo, más chico, **Contra la
computadora**. Sin el servidor (sin internet) el inicio es el de antes, con la computadora primero.

Que la pantalla no salte (medido con la API de Layout Instability del navegador, en el inicio y en partidos
2D y 3D, en compu y celular): el inicio va arriba (no centrado en la altura) y en la compu el cartel de las
cartas queda fijo al bajar; la configuración del servidor queda guardada, así la primera pantalla ya sale bien
armada; los avisos de fondo (quién espera, quién se conectó) cambian solo esos números, sin rehacer la
pantalla ni recargar el botón de Google, que tiene su lugar reservado; en el partido, el reloj de la jugada
ocupa siempre su renglón (se apaga, no se saca); en la mesa 3D las burbujas de lo que dice cada uno van por
fuera de la etiqueta y el nombre queda pegado a la cabeza; la cuenta atrás de las mesas públicas cambia solo
el número, y lo que estás escribiendo en el chat o la búsqueda no se borra si la pantalla se actualiza. La
mesa 3D dibuja a 30 cuadros por segundo cuando no se mueve nada (las caras siguen vivas) y en celulares usa
una resolución de 1,5 por punto en vez de 2.

## Cuentas y ranking

Se puede jugar sin cuenta. Con cuenta (**Acceder con Google**, en "Tu cuenta" del inicio) cada uno
tiene un apodo, que es su nombre en las mesas, y además:

- **Ranking** general y **del mes** (arranca de cero el primer día de cada mes, hora de Uruguay). Todos
  empiezan con 1000 puntos y cada partido suma o resta según el sistema ELO (K = 32; en parejas y
  tercetos, contra el promedio del otro equipo): ganarle a alguien con más puntos da más.
- **Qué partidos cuentan**: los que terminan en mesas del servidor con al menos una persona con cuenta
  en cada equipo; la computadora puede completar lugares. Contra la computadora sola no cuenta. Quien se
  va en medio del partido y no vuelve antes de que termine se anota un abandono y lo pierde, aunque su
  equipo gane. Las mesas de navegador a navegador (si el servidor no contesta) no cuentan.
- **Perfil**: puntos y puesto, partidos ganados, racha y mejor racha, manos ganadas, envidos ganados (manos
  en las que su equipo se llevó puntos de envido), flores cantadas, trucos ganados (manos ganadas con
  truco cantado), abandonos, lo del mes y los últimos 20 partidos. El perfil de cualquiera se abre
  desde el ranking, el historial o los amigos.
- **Editar perfil** (desde "Mi perfil"): foto (se recorta cuadrada y se achica a 256×256 en el navegador antes
  de subirla; el servidor acepta JPG, PNG o WebP de hasta 90 KB y revisa que sea una imagen de verdad), apodo,
  nombre, "sobre vos" (hasta 200 letras), de dónde sos (los 19 departamentos o fuera de Uruguay), tu cuadro y,
  sin foto, el color del círculo con la inicial. Las fotos se sirven en `/api/foto/<n.º>?v=<versión>` y el
  navegador las guarda; salen en el perfil, el ranking, los amigos y la lista de cuentas. Quien administra
  puede quitar la foto y los textos de una cuenta desde "Cuentas creadas".
- **Amigos**: se buscan por apodo; la solicitud se acepta o se rechaza. Se ve quién está en línea y, desde
  una mesa del servidor, se lo invita: le aparece el aviso y entra con un toque.
- **Mesas públicas** (en "Jugar con otros"): cualquiera con cuenta elige el modo y se sienta en la mesa
  pública de ese modo que tenga más gente esperando; si no hay, se arma una nueva y aparece en la lista
  para los demás. También se puede elegir de la lista "Mesas esperando gente". No tienen dueño: empiezan
  solas cuando se llenan (cuenta atrás de 3 segundos), o antes si ya son dos o más y todos tocan "Empezar
  ya" (la computadora completa los lugares libres). Al terminar, si todos quieren, juegan otro. Se juegan
  a 30 puntos y un solo chico (`REGLAS_PUBLICAS` en `server/mesa.mjs`); el que llega se sienta en el equipo
  con menos gente, así el partido cuenta para el ranking. Cada mesa pública le avisa al objeto de las
  cuentas cómo está (quiénes esperan) y este la lista en `/api/publicas` y avisa a los conectados cuando
  cambia; una mesa que no avisa en tres minutos se saca de la lista. Una misma cuenta tiene un solo lugar
  por mesa. Las mesas privadas (con código) siguen igual.
- **Cuentas creadas** (solo para quien administra el juego): cuántas cuentas hay, cuántas se crearon hoy
  y en la semana, y la lista con apodo, cuándo se creó, la última vez que entró y sus partidos. Se habilita
  poniendo el número de cuenta (se ve en "Mi perfil") en `ADMINS`, en `vars` de `wrangler.jsonc`.
- En el ranking general, además de la lista, se dice cuántas personas tienen cuenta y todavía no jugaron
  (aparecen después de su primer partido que cuenta).
- **Borrar mi cuenta**, en el perfil, borra todo lo suyo. No se guarda el correo ni la foto
  ([privacidad.html](privacidad.html)).

Cómo funciona: un Durable Object `CuentasDO` (uno solo, con SQLite) guarda usuarios, sesiones, partidos,
jugadas y amigos. El botón de Google devuelve un token firmado que el servidor verifica con las claves
públicas de Google (no hace falta secreto; el ID de cliente está en `wrangler.jsonc`, en `vars`). La
sesión es un código al azar que el navegador guarda y manda en cada pedido (encabezado `Authorization`,
sin cookies, así funciona desde GitHub Pages) y en el `hello` de la mesa; el servidor guarda solo su
hash. La mesa pregunta a las cuentas quién es cada uno y, al terminar el partido, les manda el resumen
(los dos por RPC entre Durable Objects): ningún navegador puede anotar resultados. Quien tiene el juego
abierto con su cuenta queda conectado por un WebSocket "hibernable" (el objeto duerme mientras nadie
habla y el `ping` lo contesta Cloudflare solo), que sirve para saber quién está en línea y recibir
invitaciones.

El ID de cliente de Google es del proyecto "Truco Uruguayo" en Google Cloud (Google Auth Platform), con
los orígenes `https://tomasaldaya.github.io` y `https://truco-uruguayo.tomasaldaya.workers.dev`. Para
probar en la máquina: un archivo `.dev.vars` con `DEV_LOGIN=1` (no se sube) habilita "Entrar de prueba"
en `wrangler dev`, sin Google.

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

## Atajos al compañero, abandono y cambios de reglas (18/11)

- **Atajos** (parejas y tercetos): ¡Vení!, ¡Jugá algo!, ¡Gritá! y Tengo algo para el tanto (`T.PEDIDOS`,
  `T.pedir`). Se dicen en voz alta (quedan en "Lo que se dijo" y en la burbuja) y la computadora compañera hace
  caso (`cumplirPedido` en `ai.js`): vení, en esa baza, gana con la más baja que alcance (o juega la mejor);
  jugá algo, si no puede ganar, juega la del medio y no la peor; gritá, canta truco mientras nadie gritó; el
  tanto, toca envido o lo quiere. Online van por el servidor (mensaje `pedido`).
- **Irse al mazo en la primera** sin que nadie haya tocado ni gritado, si al otro equipo todavía le quedaba
  tocar: dos puntos (uno de la mano y uno del envido que se le quita).
- **A ley de juego**, si hay flor y no se quiere el envite: se cobra la flor y el envite no querido no es
  para nadie.
- **Abandonar online**: quien se va de una mesa del servidor con el partido en juego deja su lugar a la
  computadora; si su equipo queda sin personas y en el otro queda alguien, el partido termina ahí y gana el
  que se queda (en el ranking, el que se fue lo pierde y suma un abandono). A quien se le corta la conexión le
  quedan 60 segundos para volver (`GRACIA_MS`). Antes de salir, el botón pide confirmar.
- **Partido online terminado**: "Volver al inicio" o el menú sacan de la mesa; no queda nada abierto.
- **Al responder**, "Quiero" y "No quiero" van en una fila arriba y lo demás (retruco, reenvidar, flor, mazo)
  en otra abajo.
- **En el celular, mesa 2D**: encabezado en una línea, la muestra más chica y tus cartas antes que los
  botones, para que la mesa y tu mano entren sin bajar (antes la mano quedaba debajo del borde de la
  pantalla y parecía que no estaba). Al empezar un partido la pantalla vuelve arriba.

## Mazo, carteles y pantalla del celular (18/11, segunda tanda)

- **Mazo en la 2D como en la 3D**: va sobre la mesa a la derecha del que dio (el rincón entre él y el que
  sigue: `RINCON` en `ui.html`), con la muestra asomando hacia el medio; cada mano se desliza al rincón del
  nuevo repartidor (`moverMazo`, que retoma la animación aunque la mesa se redibuje). De a seis, los de
  arriba comparten rincón.
- **Carteles en la 2D como en la 3D**: lo que dice cada uno es una etiqueta chica pegada al nombre que aparece
  y se va sola en 2,5 s (`bubble` / `.dicho`; guarda cuándo apareció para seguir la animación en cada
  redibujo). La tuya va al costado de tus cartas (arriba de ellas en el celular).
- **3D en pantallas anchas**: tus señas en una columna a la izquierda de la mesa y las frases al compañero a
  la derecha (`#senas3d`, `#frases3d`); la barra de abajo queda con el estado y los botones, y la mesa entera
  entra en la pantalla. Si el escenario mide menos de 760 px, siguen abajo como antes.
- **Celular**: todo lo de la mano entra en una pantalla, sin deslizar. Arriba, el tanteo resumido
  (`#scoreMini`, se toca para ver el tanteador completo, el chat y lo que se dijo); en el medio la mesa; abajo
  tus cartas y los botones con lugar fijo (no se mueve nada cuando aparecen dos filas de respuestas); y en
  parejas y tercetos una barra con Frases, Señas y Tanteador que abre hojas por encima (`pintarHoja`). La hoja
  de señas va arriba para que veas tus cartas mientras elegís. Los tamaños de las cartas se ajustan al alto de
  la pantalla (`--mh`, `--xc`, `--dk`).

## Vení, mostrar las cartas, el paso y los personajes (18/11, tercera tanda)

- **¡Vení!** quiere decir "jugá tu carta más baja, que la baza la hago yo": la computadora compañera tira la
  más baja (`cumplirPedido` en `ai.js`).
- **Mostrar las cartas (Art. 45)**: al terminar la mano, el que ganó el envido o cantó flor da vuelta sus
  cartas sobre la mesa. En la 3D quedan boca arriba en su lugar; en la 2D aparecen en su asiento, una atrás de
  otra (`mostradasEl`). El cartel del fin de mano espera un poco más para que se vean.
- **Paso para el que tiene que mostrar**: quien ganó el envido o cantó flor puede decir paso (aun mano a mano):
  sale de la mano sin tirar sus cartas y las muestra al final. En el modo realista, si en cambio se va al
  mazo, tira las cartas sin mostrar y su equipo pierde esos puntos, que no cobra nadie (`sinMostrar` en
  `engine.js`; en el cartel aparece con un menos). Sin el modo realista, al irse se muestran solas.
- **Personajes 3D**: cada uno elige cómo lo ven los demás en la mesa 3D ("Tu personaje", en el inicio y en el
  perfil). Vienen once hechos (`PERSONAJES` en `mesa3d.part.js`: clásico, morocho, moreno, blanquito, rubio,
  de boina, callejero, el abuelo, morocha, rubia y colorada), armados con piezas (piel, pelo, barba, bigote,
  lentes, gorra, capucha); las fotos del selector se sacan del mismo modelo (`V3.retrato`). Se guarda en el
  navegador y en la cuenta (columna `pj`), se manda al sentarse (`pj` en `hello`) y llega a todos en
  `G.pjs`. Los de la computadora tienen cada uno su cara. Para sumar personajes hechos con otro programa, la
  idea es que un personaje pueda traer su propio modelo `.glb` en vez de armarse con piezas.

## Instalar el juego en la compu (o el celular)

El juego se puede instalar como app desde el navegador, sin tienda: queda con su ícono y su ventana, y abre
sin internet para jugar contra la computadora. Lo hacen tres archivos al lado de `index.html`:

- `manifest.webmanifest`: el nombre, los colores y los íconos (`icono-*.png`, armados por
  `tools/icono/icono.py` con tres cartas de la baraja: el ancho de espada, el de basto y el siete de espada).
- `sw.js`: guarda la página para abrirla sin internet. La pide siempre primero a la red, así cada vez que hay
  conexión llega la última versión; lo del servidor (`/api/`) nunca se guarda.
- En el inicio, "Instalar el juego" (en Más opciones) aparece cuando el navegador lo permite (Chrome y Edge);
  en el iPhone, el iPad y el Safari de la Mac explica cómo agregarlo. Ya instalado, no aparece.

Se instala desde la dirección publicada (GitHub Pages o el servidor de Cloudflare), no abriendo el archivo
suelto. Para jugar online hace falta internet, como siempre.

## Modo realista: flor negada, mazo sin mostrar y reloj (19/11)

- **Flor negada** (ya no es falta grave ni se pierde el partido): cuando se descubre, el rival cobra los 3 de
  la flor y el truco que se esté jugando (1 si no se gritó), y se termina la mano. El envido que haya cobrado
  en esa mano el equipo del que la negó no vale (la flor anula el envido); lo que cobró el rival, sí
  (`florNegada` en `engine.js`). Se descubre al ganar un envite (se muestran las cartas) o en cuanto las
  cartas jugadas prueban la flor: con dos piezas alcanza; si no, hacen falta las tres (`florProbada`).
- **Mazo sin mostrar**: si ganaste el envido o cantaste flor y te vas al mazo, esos puntos van para el rival
  (`sinMostrar`). Con paso no se pierden.
- **Reloj**: si a un jugador realista se le acaba el tiempo para cantar sus puntos, ese canto es para el rival
  y la mano sigue (acción `vencido`, `cantoVencido`). En cualquier otra decisión, la computadora decide como
  sin el modo realista: canta su flor y dice la verdad en la ley (`AI.porTiempo`).
- **Abandono**: si un jugador realista se va y la computadora sigue en su lugar, ese lugar deja de ser
  realista (servidor y mesas entre navegadores).
- `tools/realista/casos.js` arma a mano los casos borde del modo realista y muestra qué decide el juego.
- **Pico a pico**: lo que se muestra al terminar un duelo (las cartas del envite o de la flor) lo ve solo el
  rival de ese duelo, no toda la mesa (`vista.js`); el repaso de "Ver las cartas de todos" en esas rondas
  muestra solo lo que te tocó ver. Así tampoco se ven, entre un duelo y otro, las cartas de los que todavía
  no jugaron el suyo.

## La computadora respeta las flores y los puntos que se cantaron (19/11)

Para decidir, la computadora se imagina muchas veces las cartas posibles de los demás (`sampleWorlds` en
`ai.js`). Antes las sacaba todas juntas al azar y descartaba las que no cumplían lo que se sabía; con dos o
tres flores cantadas (o varios puntos cantados) casi ninguna servía y completaba con manos inventadas, sin
flor. Así, en tercetos con los tres rivales con flor, un compañero con solo el 2 de la muestra creía tener
chances: gritaba, quería el retruco y tiraba el 2 en la primera. Ahora cada mano se arma por separado hasta
que cumple con lo que se sabe de ese jugador (flor cantada o no, puntos cantados, señas), y no queda ninguna
mano imaginada imposible. Contra la versión anterior juega parejo en general (49 % mano a mano en 400
partidos, 50 % en parejas en 200, 51 % en tercetos en 800) y deja de suicidarse en esas manos.
Herramientas: `tools/ia/lalo.js` (esa mano, con lo que decide la computadora) y `tools/ia/relleno.js`
(cuántas manos imaginadas contradicen lo cantado).

## Reglas de cada mesa online, achique y modo realista para todos (19/11)

- **Crear una mesa** (privada o pública) abre primero una pantalla para elegir el modo y las reglas de toda
  la mesa: a cuántos puntos es el chico (10, 20, 30 o 40), uno o tres chicos, achique sí o no (con un **?**
  que explica qué es cobrar el achique) y si hay chat de texto y chat de voz. Se recuerdan las últimas que
  elegiste (`truco.mesacfg`). En la mesa privada el dueño las puede cambiar hasta que empieza el partido; los
  demás las ven como fichas. En las públicas quedan fijas y se ven en la lista ("Ver las mesas"), que tiene
  además "Armar una mesa nueva". Si tocás un modo y no hay nadie esperando, también pasás por esa pantalla.
- Viajan como `cfg` (`{ target, chicos, achique, chat, voz }`) al crear la mesa y en cada `lobby`; el dueño
  las cambia con el mensaje `cfg`. Las valida `limpiarCfg` (servidor, `server/mesa.mjs`) y `limpiarCfgMesa`
  (navegador, `red.part.js`). Al empezar, mandan sobre las reglas que mande el dueño; lo demás (flor, señas,
  tiempo...) sale de la configuración del dueño, y en las públicas, lo de siempre.
- **Sin chat de texto** o **sin voz**: el servidor (o el anfitrión, entre navegadores) no reparte esos
  mensajes, y la pantalla no muestra el chat o el micrófono. Con el servidor, la sala de voz se abre solo si la
  mesa tiene voz (`vozSync`).
- **Achique** (`rules.achique`, también en Reglas de la mesa para jugar solo): cuando los dos cantaron flor y
  uno envida (con flor envido o contra flor) y el otro no quiere, el que envidó cobra su flor y un punto más
  (4 en vez de 3). En un reenvite no querido no se suma, como en el envido (`florNoQuerida` en `engine.js`).
- **Modo realista obligatorio online**: en todas las mesas online, todas las personas juegan en modo
  realista (cantan sus puntos y su flor), así nadie tiene la ventaja de que el juego se los cante. El lugar
  que queda a cargo de la computadora juega sin el modo realista, y vuelve a serlo cuando vuelve la persona.
- El tanteador dibuja bien los chicos a 10 y a 30 (malas arriba de la raya, buenas abajo).
- Pruebas: `server/prueba-mesa.mjs` (reglas, chat y voz, públicas), `server/prueba-cuentas.mjs` (la lista
  guarda las reglas) y `test.js` (achique).

## Mirar partidos y echar a quien molesta; cámara 3D desde la silla (19/11)

- **Mirar**: quien no tiene lugar en una mesa del servidor puede mirar el partido. Se entra con el código o el
  link ("Mirar el partido" en la mesa de espera) o desde "Ver las mesas", donde las públicas que se están
  jugando aparecen en "Partidos en juego" con el tanteador y cuántos miran. Quien mira ve lo que vería alguien
  parado al lado de la mesa: las cartas cuando se juegan, lo que se muestra al final (menos en el pico a pico),
  el tanteador y el chat. Nunca las cartas sin jugar ni las señas: el servidor le manda la vista del lugar -1
  (`viewFor(G, -1)` en `vista.js`), una sola para todos los que miran. Ve la mesa desde el lugar 0, sin
  botones; en 3D se dibuja también al jugador de abajo y la cámara puede dar la vuelta a la mesa. Puede usar
  el chat (sale marcado "mirando") y la voz, si la mesa los tiene. En las públicas hace falta cuenta.
- **Echar**: en el panel del chat, quien juega ve la lista de los que miran (con 🎙 si están hablando) y
  puede votar "Echar" (o sacar su voto). Con la mayoría de las personas sentadas, el que mira se va y queda
  vetado en esa mesa por su identificador y, si tiene, por su cuenta: no vuelve a entrar ni a mirar ni a
  jugar (`vetados`, se guarda con la mesa). Los votos de quien se va de la mesa dejan de contar.
- **Voz solo entre los de la mesa**: la sala de voz está abierta a cualquiera que sepa el código, así que cada
  navegador avisa su identificador en la sala (`vozid`), el servidor reparte la lista de los que están en la
  mesa (`lobby.voces`) y cada uno solo escucha y le manda su voz a esos. A alguien echado, o que entra a la
  sala con el código sin estar en la mesa, no se lo oye y no oye a nadie.
- Mensajes nuevos: `mirar`, `echar`, `vozid` (al servidor); `mirando`, `expulsado`, `vetado`, `echado` (al
  jugador). Las mesas entre navegadores (sin servidor) no tienen espectadores.
- **Cámara 3D del que juega**: son los ojos de su personaje, sentado en su lugar y a la altura de la cabeza
  de los demás (`ojosCam` en `mesa3d.part.js`, con un campo de visión un poco más abierto). Arrastrando gira
  la cabeza hasta 30° para cada lado y mira un poco más arriba o abajo; la rueda o el pellizco lo inclinan
  hacia la mesa o hacia atrás, con el mismo margen que antes tenía para acercarse o alejarse. Tu fila de
  cartas jugadas va un poco más hacia el centro (`ojoFila`) para que tu mano no la tape. "Tu lugar" (o doble
  clic) vuelve a sentarte derecho; "Desde arriba" (que gira hasta 30°) y mirar la muestra de cerca siguen.
- **Los demás ven tu mirada**: tu pantalla avisa hacia dónde mira tu personaje (giro, inclinación y si
  estás mirando la muestra de cerca), como mucho cinco veces por segundo y solo si cambió (`avisarMirada`,
  mensaje `mirada`; el servidor o el anfitrión recortan los valores y lo reparten). En la mesa 3D de los
  demás, tu personaje gira la cabeza, se inclina o se agacha hacia la muestra (`miradaDe` en
  `updateChars`); las señas siguen teniendo prioridad.
- Pruebas: `test.js` (la vista -1 nunca tiene una carta sin jugar ni una seña, en partidos al azar de 2, 4 y
  6), `server/prueba-mesa.mjs` (mirar, chat y voz de quien mira, echar por mayoría, vetado por identificador
  y por cuenta, votos de quien se va, lista de voces) y `server/prueba-cuentas.mjs` (partidos en juego en la
  lista). Algunas pruebas del servidor que esperaban partidos largos ahora fijan el chico a 40.

## La mesa 3D más ordenada (19/11)

- La cámara de los ojos mira un poco más hacia abajo (`OJOS.pitch` .38), así se ve más mesa.
- Las cartas jugadas van más cerca de cada jugador (`rr`, `rrS` más grandes) y ya no se amontonan en el
  medio; las tuyas un poco más adelante, para que tu mano no las tape (`ojoFila`). Las que quedan boca abajo
  se abren a lo largo de la fila de cada uno.
- El mazo va cruzado sobre la muestra (girado 90°): la muestra queda igual y asoma por el lado largo del mazo.
  Con las filas más afuera, el mazo va al rincón entre el que dio y el de su derecha; los lugares (`dk`,
  `dk0`) están calculados para que ni el mazo ni la muestra pisen ninguna fila ni las cartas boca abajo, dé
  quien dé (con el temblor de las cartas incluido).
- El borde dorado ahora marca las cartas de la baza que se está jugando (o la que se acaba de cerrar, hasta
  que alguien tira la próxima), en la 3D y en la 2D de mano a mano (`bazaEnJuego`); quién ganó cada baza se
  sigue viendo arriba (1ª, 2ª, 3ª).

## En la mesa: dichos, gestos y sonidos; racha, reglamento y logros (19/11)

- **Panel "En la mesa"** (en el costado, debajo del chat; en el celular, en la hoja del tanteador), con tres
  pestañas que quedan abiertas mientras se juega y se habla por la voz:
  - **Dichos** (el frasero): versitos y dichos para tocar, gritar, cantar flor y contestar. Tocar uno lo muestra
    arriba de tu personaje para toda la mesa, más tiempo si es largo, y en la 3D el personaje lo "dice". La lista
    está en `DICHOS`, en `extras.part.js`: por ahora tiene unos pocos para ir completando con los del usuario
    (`['codigo-unico', 'El dicho.']` en el grupo que va).
  - **Gestos**: dedito para arriba, que no con el dedo, aplausos, risa, qué sé yo, un matecito… (`GESTOS`). Salen
    arriba de tu personaje y en la 3D se mueve (asiente, niega, se adelanta o se hunde).
  - **Sonidos**: golpe en la mesa, aplausos, campana, silbido, redoble, ta-dá, bocina, grillos y uyyy, hechos con
    WebAudio (`MESA` en `sonido.part.js`, `SND.mesa`). Los oye toda la mesa con su volumen; cada uno puede apagar
    los de los demás ("Escuchar los sonidos de los demás", `truco.sonmesa`). Los sonidos propios (archivos que
    elija el usuario) quedan para más adelante.
  - Viaja solo el código (`g:…`, `s:…`, `d:…`) en el mensaje `gesto`, nunca texto libre. El servidor (o el
    anfitrión, entre navegadores) acepta solo códigos con esa forma, de quien está sentado, con el partido empezado
    y de a uno cada 1,5 s (`GESTO_RE`, `GESTO_MS` en `server/mesa.mjs`), y lo reparte a todos (también a los que
    miran). Contra la computadora se ve en tu propio personaje.
- **Racha 🔥**: quien tiene cuenta y lleva dos partidos o más ganados seguidos muestra 🔥 con el número al lado de
  su nombre, en la 2D y en la 3D, en las mesas del servidor (`fuego`). Las cuentas le pasan la racha a la mesa
  (`quien`), que la pone en `G.rachas`; al terminar el partido se actualiza para el siguiente (`registrar`
  devuelve la racha nueva). Si alguien deja su lugar, la computadora que lo reemplaza no la muestra.
- **Reglamento completo**: botón "Reglamento" en el inicio y "Ver el reglamento completo" en Cómo se juega.
  `build.py` mete `reglamento.txt` en el juego (`REGLAMENTO`). Tiene índice por capítulo y buscador (con "art 45"
  encuentra el artículo 45).
- **Logros** (en el perfil): 15, calculados con lo que ya guarda la cuenta (partidos ganados, mejor racha, flores,
  trucos, envidos, puesto en el ranking) y dos números nuevos por cuenta: faltas envido ganadas (`faltas`) y faltas
  envido ganadas por uno mismo con 37 (`falta37`). Las cuenta la mesa del servidor en cada mano (el motor marca
  `R.envido.result.falta`). Los que faltan se ven apagados, con una barrita de lo que llevás.
- Pruebas: `server/prueba-mesa.mjs` (gestos: solo códigos válidos, de quien juega, de a uno; la racha llega en la
  vista y se actualiza al final; las faltas en las estadísticas) y `server/prueba-cuentas.mjs` (faltas, falta37 y
  racha en el resultado).
- **Pendiente**: los sonidos propios del usuario (los va a pasar él).

## Gremios y aviso de logros (19/11, segunda tanda)

- **Gremios**: botón "Gremios" en la ficha de la cuenta (dice "Gremio LP" si ya estás en uno). Cualquiera con
  cuenta arma uno (nombre de 3 a 24, sigla de 2 a 4 en mayúsculas, lema opcional) o entra a uno de la lista, sin
  invitación. Hasta 30 integrantes (`MAX_GREMIO`); cada cuenta en un gremio como mucho. Quien lo armó queda a cargo:
  puede sacar a alguien (con confirmación) y cambiar el lema. Si se va, queda a cargo el integrante más antiguo, y
  si no queda nadie el gremio se borra. Al borrar la cuenta, se sale del gremio. El perfil muestra el gremio.
- **Ranking de gremios**, general y del mes: cada partido para el ranking que gana un integrante le suma uno a su
  gremio (si hay dos del mismo gremio en el equipo, suman los dos); manda el que más ganó y, si empatan, el que jugó
  menos. Solo cuenta lo que se juega mientras se está en el gremio: los contadores están en la tabla `gremios`
  (`partidos`, `ganados` y los del mes) y los suma `registrar`.
- Rutas nuevas (el Worker las pasa a las cuentas): `GET gremios[?tipo=mes]`, `GET gremio?id=`, `POST gremio/crear`,
  `gremio/unirme`, `gremio/salir`, `gremio/echar`, `gremio/editar`. Columnas nuevas en `usuarios`: `gremio`,
  `gremio_desde`.
- **Aviso de logro nuevo**: al terminar un partido que cuenta, `registrar` manda lo que usan los logros antes y
  después (`antes`, `despues`), y el aviso del ranking dice "¡Logro nuevo: …!" con un ta-dá y un botón al perfil.
- Pruebas: `server/prueba-cuentas.mjs` (crear, nombres repetidos, unirse, ranking con lo jugado, el del mes, echar,
  dueño que se va, gremio que se borra, borrar la cuenta; logros antes y después). Las pantallas se probaron con
  `wrangler dev` y dos cuentas de prueba.

## Dichos para leer, gestos con la mano, menos sonidos y logo nuevo (19/11, tercera tanda)

- **Dichos**: ahora son solo para leer y decirlos por la voz; no tocan el partido ni aparece nada en la mesa.
  Tienen tres pestañitas, Truco, Envido y Flor, y adentro solo dichos (no "quiero", "retruco" y eso). `DICHOS` en
  `extras.part.js` es una lista de textos por grupo; por ahora solo los dos de la flor, el resto los pasa el usuario.
  El mensaje `gesto` ya no acepta `d:` (servidor y anfitrión).
- **Gestos con la mano** (mesa 3D): los brazos tienen codo (brazo y antebrazo de 1,25 que se acomodan solos con
  `ikArm`: el hombro fijo, la mano adonde va y el codo hacia abajo y afuera) y la mano cambia de forma (puño,
  pulgar, índice, abierta o con el mate: `forma`). Cada gesto (`GA` en `mesa3d.part.js`, mismo código que `GESTOS`)
  mueve la mano derecha mientras la izquierda sigue con las cartas, y pone la cara y la cabeza: dedito para arriba,
  que no con el dedo (lo mueve y niega un poco), aplaude contra la mano de las cartas, se agarra la panza de risa,
  levanta el puño, se señala los ojos y te señala, se encoge con la palma para arriba, la mano en el mentón, el
  dedo en los labios, golpea la mesa con el puño, saluda con la mano y toma mate. Arriba del personaje sale solo el
  dibujito; en la 2D, el dibujito con el nombre. El gesto arranca con la hora del momento (`clock()`), no con la del
  último cuadro dibujado.
- **Sonidos**: quedan aplausos (unas pocas palmas secas, sin murmullo detrás), silbido y grillos.
- **Interfaz en la compu**: el costado ya no estira la mesa 3D (con el panel nuevo pasaba de 729 a 861 px): en
  pantallas de más de 980 px mide lo mismo que la mesa y, si no entra, se desplaza adentro.
- **Logo nuevo**: el 2, el 4 y el 5 de oro en abanico con la muestra, el 1 de oro, acostada atrás, en el inicio
  (`paintFan`, `.fan .mu`) y en los íconos de la app (`tools/icono/icono.py`, regenerados).

## Gestos más claros (19/11, cuarta tanda)

- **Dedito para arriba**: el puño de costado con los dedos doblados al frente (nudillos) y el pulgar arriba, del
  lado de adentro; antes el pulgar solo, en el medio del puño, parecía el dedo del medio.
- **Te estoy mirando**: la mano al costado de la cabeza, con el índice de lado apuntando a la parte de abajo del ojo (de frente, el dedo sobre
  la cara no se distinguía), y después te señala.
- **Qué sé yo**: la mano a su derecha, palma para arriba, con los dedos y el pulgar apuntando para afuera (forma
  `palma`; la mano se orienta con `apuntar`: hacia dónde van los dedos y hacia dónde mira la palma).
- **Shhh** y **mate**: se calcula dónde está la boca en cada cuadro (`bocaDe`) y se lleva ahí el índice (parado sobre
  los labios) o la punta de la bombilla.
- **Qué bronca**: los golpes, más a su derecha, lejos de las cartas.
- **Aplausos**: deja las cartas boca abajo en la mesa, delante suyo (`dejadaPose`, mientras `aplaudiendo`), aplaude
  con las dos manos y las vuelve a agarrar. La pantalla vuelve a acomodar las cartas al empezar y al terminar.
- Para mirar un instante de un gesto en las pruebas: `__v3.debug().Lay.chars[p].ag.fijo = segundos`.
- **Te estoy mirando** (ajuste): la mano sube desde abajo y la punta del índice toca el párpado de abajo del ojo
  derecho. Se calcula dónde está el ojo en cada cuadro (`ojoDe`), así anda igual con todos los personajes.

## El reglamento volvió (19/11)

- Al rehacer la lista de dichos se borró sin querer `const REGLAMENTO` de `extras.part.js`, y el botón "Reglamento"
  (y "Ver el reglamento completo") dejó de abrir. Volvió, y `build.py` ahora se niega a armar `index.html` si falta el
  reglamento o si quedó alguna parte sin reemplazar.

## Reglas de la mesa fijas (19/11)

- Se sacó "Reglas de la mesa" de Configuración. Las reglas son fijas (`tableRules` en `ui.html`): a 30 puntos, al
  mejor de tres, 30 segundos por decisión, con flor, flor anulada si tu compañero toca o grita antes de que la cantes,
  sin achique, cartas iguales de rivales parda (Art. 57), con señas y, si te vas al mazo sin ser el pie, te vas solo y
  tu equipo sigue. Lo que alguien tenía guardado de antes (`truco.rules`) ya no se usa.
- Contra la computadora en tercetos se juega a 40 (`reglasSolo`).
- En las mesas online, quien la crea sigue eligiendo a cuántos puntos, cuántos chicos, el achique, el chat y la voz;
  lo demás son estas reglas fijas.

## El bar: dónde está la mesa (20/11)

- **Lugar de la mesa 3D**: "Bar" (nuevo, el de siempre por defecto) o "Clásico" (la mesa de paño en la sala oscura).
  En una mesa online lo elige quien la crea ("Lugar", en la pantalla de las reglas; viaja en `cfg.escenario`, lo valida
  `limpiarCfg` y lo guarda el salón de mesas públicas) y lo ven todos. Contra la computadora, en Configuración →
  Pantalla → Lugar (`truco.lugar`). `escenarioActual()` (en `extras.part.js`) dice cuál va, y la mesa 3D lo pone con
  `ponerEscenario` y se rearma si cambia (también con el partido empezado).
- **El bar** (`armarBar` en `mesa3d.part.js`), un bar de los de antes, de ir a tomar algo y jugar a las cartas, con
  luz cálida: paredes de ladrillo con restos de cal, piso de baldosas, techo con vigas, la pared del fondo de madera con
  la puerta de dos hojas de vidrio, ventanas con cortinas, el cartel "Bar La Muestra · fund. 1931" (nombre inventado),
  "SALIDA", la pizarra con los precios, la barra con banquetas y apoyapié de bronce, la estantería con botellas, la
  tele del rincón con un partido, cuadros en las paredes (retratos viejos, el equipo campeón, el afiche del torneo de
  truco, un paisaje con ombú, naipes y el diario), un estante alto con frascos, otras cuatro mesas de madera con sus
  sillas y servilleteros, y lámparas colgando. Todo con piezas simples y dibujos en canvas: sin archivos ni marcas.
- **Nuestra mesa en el bar**: redonda y de madera de tablas (`buildTableBar`), del mismo tamaño que la de paño, así
  las cartas, el mazo y la muestra van a los mismos lugares. Las sillas de los jugadores ahora tienen respaldo de
  listones (en los dos lugares).
- **Liviano**: las piezas quietas se juntan en un solo dibujo por material (`Lote`), nada del bar tira ni recibe
  sombras, las luces son tres puntuales sin sombra y los dibujos salen siempre iguales (`azar` con semilla). Medido:
  unas 23 llamadas de dibujo y 19 mil triángulos más que la sala oscura. Las lámparas se esconden en la vista desde
  arriba (taparían la mesa).
- `three.min.js` se regeneró con `PointLight`, `LatheGeometry`, `BufferGeometry`, `Float32BufferAttribute` y
  `Object3D` (ver `three-entry.js`): 2 KB más.
- Pruebas: `server/prueba-mesa.mjs` (lugar por defecto, solo valores conocidos, solo el dueño lo cambia) y las reglas
  de las mesas con el campo nuevo. Se miró en el navegador: desde la silla (mano a mano, parejas y tercetos), desde
  arriba, desde los costados, en el celular, y cambiando de lugar con el partido empezado.
- Para sumar otro lugar (el campo con sillas playeras y mesa plegable, la rambla, un quincho…): agregarlo a
  `ESCENARIOS` (mesa 3D, servidor, cuentas y `ESCENARIOS_UI`), con su `armar…` y, si cambia, su mesa.

## Mirar para cualquier lado, piernas y tu cuerpo (20/11)

- **Cámara desde la silla libre**: arrastrando, la cabeza gira para cualquier lado (sin tope; antes eran 30° por lado)
  y mira bastante más arriba o abajo (`LIM.arriba` .75, `LIM.abajo` .95). Lo único que sigue limitado es acercarse o
  alejarse (`LIM.cerca`, `LIM.lejos`, igual que antes). Los ojos van adelante del centro de la cabeza hacia donde
  mirás (`ojosCam`), así que mirando para adelante la vista es la de siempre. "Tu lugar" (o doble clic) vuelve a
  sentarte derecho.
- **Tu cuerpo**: estando sentado se dibuja tu personaje sin cabeza ni cuello (`Lay.yo`): mirando para abajo te ves
  los brazos sobre la mesa, y tus gestos también los hace tu cuerpo.
- **Piernas**: todos los personajes tienen muslos, rodillas debajo del borde de la mesa, canillas y zapatos (en el
  grupo del personaje, así no giran cuando tuerce el torso).
- **Darse vuelta**: pasados los 0,9 radianes el torso tuerce en la silla y la cabeza hace el resto (`torsion`); mirando
  más para atrás que 1,9 (unos 110°, `ATRAS`), el personaje deja sus cartas boca abajo en la mesa delante suyo
  (`cartasEnMesa`, `dejadaPose`) y las vuelve a agarrar al darse vuelta otra vez. Vale para vos y para los demás:
  la mirada que se reparte (`mirada`) ahora va de -π a π (servidor y anfitrión), y la pantalla reacomoda las cartas
  cuando alguien se da vuelta.

## Rendimiento de la mesa 3D (20/11)

Medido (tiempo de dibujar un cuadro, con el navegador dibujando por software para comparar): las sombras eran lo más
caro (un 37 % de cada cuadro), después la resolución, y en el bar las tres luces de las lámparas (un 8 %).

- **Sombras**: solo proyectan sombra el torso, la cabeza, el pelo y los brazos de cada personaje (ni la cara, ni las
  piernas debajo de la mesa, ni la silla) y una sola cara de cada carta: de 338 piezas a unas 100, y de 377 a 274
  llamadas de dibujo. Y la sombra se recalcula cuando se mueve una carta o, si no, diez veces por segundo (antes, en
  cada cuadro): los personajes se mueven tan poco que no se nota.
- **Bar sin luces puntuales**: la luz cálida la da la luz ambiente, más cálida y más fuerte cuando la mesa está en el
  bar (`luzAmb`).
- **Resolución que se adapta**: si mientras algo se mueve la compu no llega a 42 cuadros por segundo, baja la
  resolución de a poco (de 2 hasta 1 por punto; `DPR`). En el celular ya se usaba 1,5.

## La página no se queda cargando (20/11)

- A veces, justo después de publicar una versión nueva, la página se quedaba cargando. `sw.js` pedía siempre la página
  a la red y esperaba sin límite. Ahora, si en 6 segundos no contestó o contestó con un error, abre la copia guardada
  y guarda la nueva cuando llega (para la próxima vez). Probado con un servidor local que tarda 30 segundos o contesta
  503: la página abre a los 6 segundos. Vale para quien ya abrió el juego alguna vez en ese navegador.

## Rama "mejoras": base más seria para publicar (20/11)

Cuatro etapas, en la rama `mejoras` (no toca `main` ni el juego publicado hasta que se pase). Cada push a la rama corre
todo y publica en el **entorno de pruebas**: https://truco-uruguayo-pruebas.tomasaldaya.workers.dev (otro Worker, con
sus propias mesas y cuentas; el acceso con Google no anda ahí).

**1. Publicación reproducible y pruebas de navegador**
- GitHub Actions (`servidor.yml`): arma `index.html` con `build.py`, falla si el del repo no está al día (GitHub
  Pages sirve ese), corre `tsc`, las pruebas de reglas, mesa y cuentas y las de navegador, guarda la página armada y
  publica **exactamente esa** (en `main`, en producción; en `mejoras`, en pruebas). Si fallan las de navegador, queda
  el informe de Playwright (videos y pasos) como archivo de la corrida.
- Pruebas de navegador (`e2e/mesa.spec.js`, contra `wrangler dev`): dos jugadores en una mesa (cada uno ve solo sus
  cartas y se juega), recargar y volver al mismo lugar con el reloj donde estaba, quien mira sin ninguna carta sin
  jugar, abrir sin internet, y la mesa 3D bajada al usarla y andando sin internet. En la compu: `npm install`,
  `npx playwright install chromium` (o `CHROME=/ruta/al/chrome`) y `npm run navegador`.
- **Volver atrás una publicación**: Actions → "Volver atrás una publicación" → elegir producción o pruebas y, si se
  quiere, la versión (sin versión, la anterior; la lista sale en el registro). Vuelve la página y el servidor juntos
  (`wrangler rollback`); los datos no se tocan. GitHub Pages se vuelve atrás revirtiendo el commit en `main`.
- Las pruebas encontraron y se corrigieron dos errores: **recargar la página en un mano a mano terminaba el partido
  por abandono** (la página avisaba "me voy"; ahora avisa "pausa" y tiene el rato de gracia), y **al cortarse, la
  computadora jugaba por él en el acto** (si era su turno, perdía la jugada y el reloj volvía a empezar). Ahora el
  lugar queda reservado 10 s (`RESERVA_MS`): si vuelve antes, sigue como si nada.

**2. Los resultados de los partidos no se pierden**
- Antes, la mesa daba el partido por anotado antes de que las cuentas confirmaran, y si esa llamada fallaba (un
  reinicio justo en ese momento) quedaba fuera del ranking. Ahora queda **pendiente**, guardado con la mesa, y se
  reintenta (5 s, 10 s, 20 s… hasta cada 5 min; también al despertar la mesa y con su alarma) hasta que las cuentas
  contestan. La mesa no se borra mientras tenga un resultado pendiente.
- Las cuentas aplican cada partido **entero o nada** (una transacción: partido, jugadas, ELO, estadísticas, gremios)
  y **una sola vez por id**, así que reintentar nunca lo anota dos veces.
- Registros en Cloudflare (Workers → truco-uruguayo → Logs; solo estados y totales, nunca nombres): `resultado`
  (anotado, reintento), `vuelve` (alguien recuperó su lugar), `despierta` (la mesa volvió de dormir), `voz`.
- **Ensayo de restauración**: en el entorno de pruebas (y solo ahí: `PERMITIR_RESTAURAR=1`), quien administra puede
  volver las cuentas a como estaban hace N minutos: `POST /api/admin/restaurar { "minutos": N }` con su sesión
  (recuperación a un momento dado de SQLite en Cloudflare, hasta 30 días). En producción la misma recuperación existe
  pero no está habilitada desde el juego.

**3. TypeScript de a poco y la mesa 3D bajo demanda**
- `server/protocolo.mjs`: el tipo de cada mensaje del jugador (en JSDoc, revisado por `npx tsc`, sin compilar nada) y
  `validarDelJugador()`, que la mesa usa antes de procesar cualquier mensaje: tipos desconocidos afuera, y cada campo
  con su clase (texto, número, sí/no, objeto) o se descarta. Para sumar archivos a la revisión: `tsconfig.json`.
- Three.js y todo lo 3D (personajes, bar) ya no van dentro de `index.html` (de 1,9 a 1,4 MB): se bajan al entrar a la
  mesa 3D, o en un momento libre después de abrir el juego si la vista es 3D (`V3.cargar`). El service worker guarda
  `three.min.js` para jugar en 3D sin internet. La pantalla de inicio y la 2D abren antes.

**4. Mesas que duermen y la voz medida**
- Las mesas usan **WebSockets hibernables** (como las cuentas): sin nada que hacer, el Durable Object duerme y no se
  cobra. El navegador manda "ping" cada 4 s y lo contesta Cloudflare sin despertarla; la mesa revisa quién se fue
  (más de 15 s sin ping ni mensajes) solo con el partido en juego, y la alarma hace lo demás (reintentar un resultado,
  avisar al salón que la pública sigue esperando gente, borrar la mesa vacía a las dos horas). Al despertar, vuelve de
  lo guardado y de lo que se recordó en cada conexión. Los navegadores con la página vieja siguen andando (la mesa les
  manda "ping" como antes).
- **Voz**: a los 20 s de entrar a la voz, cada navegador avisa con cuántos de los que estaban en la voz se pudo conectar
  (solo los números) y queda en los registros (`ev: voz`). Si falla seguido, se enchufa **TURN**: crear una clave en
  Cloudflare → Realtime → TURN y cargar `TURN_KEY_ID` y `TURN_KEY_TOKEN` como secretos del Worker
  (`npx wrangler secret put TURN_KEY_ID`, nunca en el chat ni en el repo). `/api/turn` da credenciales por un día y la
  voz las usa sola.

**Pendiente** (para cuando se decida): pasar `mejoras` a `main`; mover el cliente a módulos con Vite (hoy sigue
armado con `build.py`, que anda bien); más archivos en la revisión de tipos; TURN si la medición lo pide.

## Listo para publicitar, primera parte (20/11, rama mejoras)
Lo que se podía hacer sin el dominio propio:
- **Vista previa al compartir**: título, descripción y `compartir.jpg` (1200×630, se arma con `tools/compartir/compartir.py`) en las etiquetas `og:` y `twitter:`, más datos para buscadores (JSON-LD). `build.py` cambia `/*SITIO*/` por la dirección de `SITIO` y genera `robots.txt` y `sitemap.xml`. **Cuando esté el dominio, se cambia solo `SITIO` en `build.py`.**
- **Términos de uso** (`terminos.html`) y aviso de derechos al pie del inicio. La privacidad se actualizó con reportes, suspensiones y el conteo de visitas.
- **Ayudas** solo contra la computadora: en las mesas online no aparecen (ni el botón).
- **Mesas públicas que no quedan vacías**: una persona sola puede empezar con la computadora; quien llega después se sienta en un lugar de la computadora (sin cuentas en los dos equipos no cuenta para el ranking).
- **Moderación**: en la mesa, cada persona tiene 🔇 Silenciar (solo para vos: su voz y su chat) y ⚑ Reportar (con cuenta; manda el motivo, lo que escribas y las últimas 12 líneas del chat, hasta 10 por día). En **Administrar → Reportes** se marcan vistos y se suspende 1, 7 o 30 días (o se quita). Una cuenta suspendida no entra a mesas públicas (le aparece hasta cuándo y por qué). Abandonar 3 partidos en 24 h suspende media hora sola.
- **Uso y errores** (Administrar → Uso): por día y sin datos de nadie, cuántas veces se abre, si está instalada, partidos contra la compu y online, de qué sitio vienen (`utm_source` o el sitio del enlace) y los errores de los navegadores (hasta 3 por visita, con la versión: `/*VERSION*/` es un resumen del contenido). Con tope por dirección, que no se guarda.
- Tablas nuevas en cuentas: `reportes`, `visitas`, `errores`; columnas `suspendido_hasta` y `suspension_motivo`. Rutas: `reporte`, `visita`, `error`, `admin/reportes`, `admin/reporte`, `admin/suspender`, `admin/uso`.

Lo que queda por tu lado: confirmar que se puede usar el texto del reglamento, probar en celulares reales, y poner la pantalla de permisos de Google en "Producción".

## Arreglos de la voz (20/11, directo en main)
Lo que contaron: a veces al prender el micrófono no se oía a nadie hasta silenciar y volver a activar, o hablar y tocar el sonido; y en el celular, después de jugar, WhatsApp no podía grabar audios.
- **No se oía**: los navegadores del celular no dejan sonar un audio que llega sin que la persona toque algo, y en iPhone tomar el micrófono pausa lo que sonaba. Ahora cada voz que llega se reintenta con cualquier toque o tecla, al volver a la página y justo después de tomar el micrófono; los audios llevan `playsinline`. Si igual sigue trabada, aparece "Tocá la pantalla para escuchar a los demás". Los sonidos del juego también se reaniman si iPhone los deja 'interrupted'.
- **El micrófono quedaba tomado**: se tenía desde que se prendía hasta irse de la mesa, aunque la página estuviera atrás. Ahora se suelta (se apagan las pistas y se deja de mandar a cada uno) al salir de la página (otra app, pantalla apagada, `pagehide`) y a los 2 minutos sin hablar. Al volver a apretar el botón se toma de nuevo y, si se sigue apretando, ya habla (el permiso se recuerda en `truco.mic`).
