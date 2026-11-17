# Truco Uruguayo

Juego de truco uruguayo para el navegador, según el *Reglamento del Truco Uruguayo*
(transcripción de Tomás Aldaya, noviembre 2025, en `reglamento.txt`).

## Archivos

- `engine.js` — motor de reglas (2, 4 o 6 jugadores, reglas de la mesa, modo realista, tercetos, a ley de juego).
- `ai.js` — jugadores de la computadora (simulación Monte Carlo, niveles fácil/normal/difícil).
- `ui.html` — interfaz (mesa 3D y mesa 2D). Tiene marcadores `/*THREE*/`, `/*ENGINE*/`, `/*AI*/`, `/*CARDS*/`, `/*TALLY*/`, `/*MESA3D*/`, `/*HOME*/`.
- `inicio.part.js` — pantalla de inicio, configuración y guardado del partido.
- `vista.js` — lo que ve cada jugador: una copia del partido sin lo que ese lugar no puede saber.
- `red.part.js` — mesa compartida: crear una mesa, unirse, lugares, y los mensajes entre anfitrión e invitados.
- `mesa3d.part.js` — la mesa 3D: escena, jugadores con cara y señas, cartas animadas, cámara.
- `three.min.js` — recorte de Three.js r187 (licencia MIT) con solo lo que usa la mesa 3D.
- `three-entry.js` — lista de lo que entra en `three.min.js` y el comando para regenerarlo.
- `cards.part.js` — dibujo de las cartas (diseño propio) y carga del mazo del jugador.
- `tally.part.js` — tanteador de fósforos.
- `build.py` — arma `index.html` (un solo archivo; anda sin internet, solo las tipografías se bajan de Google Fonts) a partir de lo anterior: `python3 build.py`.
- `test.js` — pruebas de reglas y partidos simulados: `node test.js`.
- `index.html` — el juego armado, listo para abrir en el navegador.

## Jerga

Tocar = envido, gritar = truco, cantar = flor (o cantar los tantos).

## Decisiones tomadas con el usuario

- Cartas iguales de rivales: parda (Arts. 57–59). Opción: gana el más mano (Art. 12).
- La flor se canta en tu turno; si alguien la cantó, los demás en orden del mano al que dio.
- Si tu compañero toca y tenés flor: queda negada (por defecto) o decís "tengo flor" (opción).
- Si tocan y un rival tiene flor, la canta antes de contestar y anula el envido (Art. 27).
- El envido está primero: se puede tocar contra un truco mientras no hayas jugado tu primera carta.
- Si un rival te canta algo y podés contestar, contestás vos (no tu compañero de la computadora).
- Paso: salís de la mano con tus cartas (para poder mostrarlas). Mazo sin ser el pie: te vas solo
  y tu equipo sigue (por defecto); si se va el pie, pierde el equipo. Opción: Art. 90.
- A ley de juego: solo en parejas y tercetos, cuando algún equipo entró en buenas; versión
  simplificada del Cap. 7 (sin los reenvites del Art. 76 ni el Art. 79).
- Modo realista: faltas ocultas que se descubren al verse las cartas (Art. 45 o tres cartas jugadas).
- Las ilustraciones del mazo Tatú no se incluyen; el jugador puede cargar su propia imagen del mazo.

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

## Jugar con otros (mesa compartida)

Desde la pantalla de inicio: **Crear una mesa** o **Unirme a una mesa**. Por ahora funciona entre
pestañas del mismo navegador (sirve para probar cómo se ve el partido desde cada lugar); el
siguiente paso es que los mensajes viajen por internet, sin servidor, de navegador a navegador.

- **Crear una mesa:** te da un código de cuatro letras. Elegís el modo y ves los lugares por
  equipo. Los lugares sin persona los juega la computadora. "Empezar partido" arranca cuando
  quieras.
- **Unirme a una mesa:** tu nombre y el código. Te sienta de compañero del anfitrión si hay
  lugar; con "Sentarme acá" elegís otro, también en el otro equipo.
- **Cada uno ve la mesa desde su lugar:** vos abajo, tu equipo de celeste, "Nosotros" es tu
  equipo, y en "Lo que se dijo" lo tuyo aparece como "Vos".
- **Nadie recibe lo que no puede ver:** el anfitrión tiene el partido completo y le manda a cada
  invitado solo su vista (`vista.js`): sus cartas, las jugadas, las señas de sus compañeros y las
  que pescó. Las cartas ajenas llegan tapadas, también en los datos. `node test.js` lo comprueba
  en partidos simulados de 2, 4 y 6.
- **Señas entre personas:** las hacés con los botones de siempre; tu compañero ve tu muñeco
  haciendo el gesto, y los rivales te pueden pescar como con la computadora.
- **Fin de mano:** se sigue cuando todos tocan "Siguiente mano"; el botón dice a quién se
  espera ("Esperando a Juan…").
- **Si alguien se va** (cierra la pestaña o sale de la mesa), la computadora sigue por él con su
  nombre; si vuelve a entrar con el mismo nombre, recupera su lugar solo.
- **Llegar con el partido empezado:** quien entra con otro nombre ve la mesa y elige un lugar
  de la computadora con "Sentarme acá".
- **Si el anfitrión va al menú**, el partido se detiene y los invitados ven el aviso hasta que
  vuelve.
- **Modo realista:** cada uno juega con el suyo (el de su configuración al entrar a la mesa).
- El partido de una mesa compartida no se guarda; tu partido solo, si tenías uno, sigue ahí
  al salir de la mesa.

Para probar: abrí `index.html`, tocá "Crear una mesa"; abrí `index.html` en otra pestaña del
mismo navegador, tocá "Unirme a una mesa" y escribí el código. Anda en Chrome y Edge; Firefox
puede no dejar que dos pestañas abiertas desde archivos se hablen.

Por ahora, como todas las pestañas escuchan el mismo canal, una pestaña podría espiar los mensajes
de otra; por internet cada uno va a recibir solo los suyos. Falta: conexión por internet, chat
de mesa a la vista de todos, frases rápidas y tiempo límite para jugar.

## Mesa 3D

Es la vista por defecto; el botón **Mesa: 3D / 2D** (o Configuración) cambia a la mesa 2D y queda guardado.
Si el navegador no tiene WebGL, se juega en 2D y el botón queda desactivado.

- **Cámara:** arrastrar gira alrededor de la mesa, la rueda o el pellizco acerca y aleja.
  "Tu lugar" (o doble clic) vuelve a tu silla; "Desde arriba" muestra toda la mesa.
- **Tus cartas:** abajo, pegadas a la cámara. Las que podés jugar se levantan un poco; clic
  o toque para jugarlas, o las teclas 1, 2 y 3. Con Ayudas se ven las insignias pieza, mata y fío.
- **Mazo:** queda sobre la mesa a la derecha del que dio, con la muestra arriba (como en la mesa
  2D), así se ve enseguida quién dio. Al empezar cada mano se desliza hasta el nuevo repartidor.
  Cuando das vos, va donde tus cartas no lo tapan.
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
