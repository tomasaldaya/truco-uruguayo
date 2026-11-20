// ---------- Mesa 3D (Three.js) ----------
// La cámara gira alrededor de la mesa (arrastrar, rueda o pellizco). Los jugadores de la
// computadora tienen cara y hacen con ella las señas del Art. 102; las cartas se reparten,
// se juegan y se juntan con movimiento. Tus cartas van abajo, pegadas a la cámara.
// La vista sigue al estado del juego: cada vez que se llama a render() se calcula dónde
// tiene que estar cada carta y las que cambiaron de lugar viajan hasta ahí.
// Si el navegador no tiene WebGL, se juega con la mesa 2D.

// Personajes que se pueden elegir (así te ven los demás en la mesa 3D). Cada uno es una combinación de piel,
// pelo, color de pelo y accesorios que arma makeChar. Para sumar uno, se agrega acá con un código nuevo
// (minúsculas, sin espacios: es lo que se guarda en la cuenta). Más adelante un personaje podría traer su
// propio modelo (un archivo .glb) en vez de armarse con piezas.
const PERSONAJES = [
  { id: 'clasico',   nombre: 'Clásico',     look: { skin: 0xdcae86, hair: 'corto', hc: 0x2b1c12 } },
  { id: 'morocho',   nombre: 'Morocho',     look: { skin: 0x8a5636, hair: 'rapado', hc: 0x140e0a, barba: true } },
  { id: 'moreno',    nombre: 'Moreno',      look: { skin: 0x5c3822, hair: 'rulos', hc: 0x0f0a07 } },
  { id: 'blanquito', nombre: 'Blanquito',   look: { skin: 0xf7dcc6, hair: 'corto', hc: 0x7a5232, brow: 0x5e3e24 } },
  { id: 'rubio',     nombre: 'Rubio',       look: { skin: 0xf3d2b5, hair: 'jopo', hc: 0xd9b55e, brow: 0x9a7a3c } },
  { id: 'boina',     nombre: 'De boina',    look: { skin: 0xd6a078, hair: 'boina', hc: 0x23283a, brow: 0x2a1e18, must: true, mc: 0x2a1e18 } },
  { id: 'callejero', nombre: 'Callejero',   look: { skin: 0xc28a5e, hair: 'gorra', hc: 0x1a120d, gc: 0x1d1d22, gc2: 0xc8312d, barba: true, capucha: true } },
  { id: 'abuelo',    nombre: 'El abuelo',   look: { skin: 0xe8bd98, hair: 'pelado', hc: 0xd9d4cc, must: true, lentes: true } },
  { id: 'morocha',   nombre: 'Morocha',     look: { skin: 0x9b6542, hair: 'largo', hc: 0x16100c } },
  { id: 'rubia',     nombre: 'Rubia',       look: { skin: 0xf5d6bd, hair: 'colita', hc: 0xe0bf6a, brow: 0x9a7a3c } },
  { id: 'colorada',  nombre: 'Colorada',    look: { skin: 0xf7d9c5, hair: 'rodete', hc: 0xa8461e, brow: 0x7a3a1c, lentes: true } },
];
const pjValido = k => typeof k === 'string' && PERSONAJES.some(x => x.id === k) ? k : null;

// la mesa 3D de verdad: se arma recién cuando Three.js está cargado (ver V3, al final)
function crearV3(){
  const OFF = { available: () => false, update(){}, pause(){} };
  if (typeof THREE === 'undefined') return OFF;
  const PI = Math.PI, CW = 1, CH = 1.52;
  const UP = new THREE.Vector3(0, 1, 0), XAX = new THREE.Vector3(1, 0, 0), ZAX = new THREE.Vector3(0, 0, 1);
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const qA = (ax, a) => new THREE.Quaternion().setFromAxisAngle(ax, a);
  const Q_UP = qA(XAX, -PI/2), Q_DOWN = qA(XAX, PI/2);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = k => k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3)/2;
  const AS = () => clamp(delayScale(), .45, 1.5);
  const clock = () => performance.now() / 1000;
  const tmpV = v3(0,0,0), tmpW = v3(0,0,0), tmpQ = new THREE.Quaternion();

  let ok = null, renderer, scene, camera, pipCam, handGroup, ray;
  let stage, canvas, lbls, pipEl, bazEl, myBub, hintEl, muLbl;
  let Lay = null, running = false, rafId = 0, last = 0, now = 0, lastAct = null, myLegal = [];
  const CARDS = {};
  const S = { mid:null, roundNo:null, rk:null, dealEnd:0, senasRk:null, seenN:0, jobs:[], job:null, said:{}, deckSig:undefined,
    hover:null, hoverP:null, playable:new Set(), myTurn:false, myOut:false, humanSenas:null, pescados:'',
    cnt: { partido: 0, reparto: 0, ubicar: 0, senas: 0, dichos: 0, desdeMano: 0, desdeMazo: 0 } };
  const CAM = { phi:0, beta:.6, rho:16, tx:0, ty:0, tz:0, g:null, k:3 };

  // ---------- utilidades ----------
  const std = (c, r, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: r == null ? .8 : r }, extra || {}));
  function mesh(g, m, x, y, z, sx, sy, sz){
    const o = new THREE.Mesh(g, m);
    if (x !== undefined) o.position.set(x, y, z);
    if (sx !== undefined) o.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    o.castShadow = true; o.receiveShadow = true;
    return o;
  }
  function canvasTex(cv){
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  function rrect(x, X, y, w, h, r){
    x.beginPath(); x.moveTo(X+r, y); x.arcTo(X+w, y, X+w, y+h, r); x.arcTo(X+w, y+h, X, y+h, r);
    x.arcTo(X, y+h, X, y, r); x.arcTo(X, y, X+w, y, r); x.closePath();
  }
  function roundedRectGeo(w, h, r){
    const s = new THREE.Shape(), x = -w/2, y = -h/2;
    s.moveTo(x+r, y); s.lineTo(x+w-r, y); s.quadraticCurveTo(x+w, y, x+w, y+r);
    s.lineTo(x+w, y+h-r); s.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    s.lineTo(x+r, y+h); s.quadraticCurveTo(x, y+h, x, y+h-r);
    s.lineTo(x, y+r); s.quadraticCurveTo(x, y, x+r, y);
    const g = new THREE.ShapeGeometry(s, 5), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x)/w, (p.getY(i) - y)/h);
    return g;
  }
  function hashJ(id, k){ let h = 7; const s = id + k; for (let i = 0; i < s.length; i++) h = (h*31 + s.charCodeAt(i)) >>> 0; return (h % 1000)/1000 - .5; }

  // ---------- texturas de las cartas ----------
  const TW = 280, TH = 426, TEX = { face:{}, back:null, badge:{} };
  function faceTex(id){
    const own = ownDeck(id), src = own || NAIPES[id] || '';
    const prev = TEX.face[id];
    if (prev && prev.src === src) return prev.tex;
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const x = cv.getContext('2d'), tex = canvasTex(cv);
    const paint = img => {
      x.clearRect(0, 0, TW, TH);
      x.save(); rrect(x, 2, 2, TW-4, TH-4, 18); x.fillStyle = '#f2f2f2'; x.fill(); x.clip();
      if (img) {
        // el mazo del jugador se recorta para llenar la carta; el del juego ya tiene la medida justa
        if (own) { const k = Math.max(TW/img.width, TH/img.height), w = img.width*k, h = img.height*k; x.drawImage(img, (TW-w)/2, (TH-h)/2, w, h); }
        else x.drawImage(img, 2, 2, TW-4, TH-4);
      } else if (img === false) plainFace(x, id);
      x.restore();
      x.lineWidth = 2; x.strokeStyle = '#cfc6b4'; rrect(x, 2, 2, TW-4, TH-4, 18); x.stroke();
      tex.needsUpdate = true;
    };
    paint(null);
    const img = new Image();
    img.onload = () => paint(img);
    img.onerror = () => paint(false);
    if (src) img.src = src; else paint(false);
    if (prev) prev.tex.dispose();
    TEX.face[id] = { src, tex };
    return tex;
  }
  // carta de repuesto (número y palo) si no se pudo cargar la imagen
  function plainFace(x, id){
    const [n, s] = id.split('-'), col = SUIT_COLOR[s];
    x.strokeStyle = col; x.lineWidth = 5; rrect(x, 22, 22, TW-44, TH-44, 12); x.stroke();
    x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '800 150px Georgia, serif'; x.fillText(n, TW/2, TH*.42);
    x.font = '700 40px Georgia, serif'; x.fillText(s.toUpperCase(), TW/2, TH*.7);
    x.font = '800 44px Georgia, serif'; x.fillText(n, 48, 56);
  }
  function backTex(){
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const x = cv.getContext('2d'), tex = canvasTex(cv);
    const paint = img => {
      x.clearRect(0, 0, TW, TH);
      x.save(); rrect(x, 2, 2, TW-4, TH-4, 18); x.fillStyle = '#f2f2f2'; x.fill(); x.clip();
      if (img) x.drawImage(img, 2, 2, TW-4, TH-4);
      else { rrect(x, 18, 18, TW-36, TH-36, 12); x.fillStyle = '#2b3570'; x.fill(); }
      x.restore();
      x.lineWidth = 2; x.strokeStyle = '#cfc6b4'; rrect(x, 2, 2, TW-4, TH-4, 18); x.stroke();
      tex.needsUpdate = true;
    };
    paint(null);
    const img = new Image(); img.onload = () => paint(img); img.src = NAIPES.back;
    return tex;
  }
  function badgeTex(cat){
    const cv = document.createElement('canvas'); cv.width = 192; cv.height = 60;
    const x = cv.getContext('2d');
    const col = { pieza:['#e8b13a','#2b1d10'], mata:['#c7412f','#fff'], fio:['#2f62a8','#fff'] }[cat];
    rrect(x, 4, 4, 184, 52, 26); x.fillStyle = col[0]; x.fill();
    x.fillStyle = col[1]; x.font = '700 30px "Alegreya Sans", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(CAT_LBL[cat].toUpperCase(), 96, 32);
    return canvasTex(cv);
  }
  function glowTex(){
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d'), g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,214,120,.0)'); g.addColorStop(.55, 'rgba(255,214,120,.55)'); g.addColorStop(.72, 'rgba(255,200,90,.35)'); g.addColorStop(1, 'rgba(255,200,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return canvasTex(cv);
  }
  function feltTex(){
    const s = 1024, cv = document.createElement('canvas'); cv.width = cv.height = s;
    const x = cv.getContext('2d'), g = x.createRadialGradient(s/2, s/2, s*.04, s/2, s/2, s*.5);
    g.addColorStop(0, '#2f7c53'); g.addColorStop(.75, '#22613f'); g.addColorStop(1, '#174832');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const d = x.getImageData(0, 0, s, s), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const nz = (Math.random() - .5) * 14; a[i] += nz; a[i+1] += nz; a[i+2] += nz; }
    x.putImageData(d, 0, 0);
    x.strokeStyle = 'rgba(243,210,122,.25)'; x.lineWidth = 4; x.beginPath(); x.arc(s/2, s/2, s*.46, 0, PI*2); x.stroke();
    x.strokeStyle = 'rgba(243,210,122,.12)'; x.lineWidth = 2; x.beginPath(); x.arc(s/2, s/2, s*.445, 0, PI*2); x.stroke();
    return canvasTex(cv);
  }
  function woodTex(rep){
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const x = cv.getContext('2d'); x.fillStyle = '#5d3a22'; x.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 70; i++) {
      const y = Math.random()*128, a = Math.random()*.18;
      x.strokeStyle = Math.random() < .5 ? `rgba(30,15,6,${a})` : `rgba(160,110,70,${a*.7})`;
      x.lineWidth = 1 + Math.random()*3; x.beginPath();
      for (let X = 0; X <= 512; X += 16) x.lineTo(X, y + Math.sin(X/60 + i)*3);
      x.stroke();
    }
    const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1);
    return t;
  }
  function floorTex(){
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const x = cv.getContext('2d');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 2; c++) {
      const off = (r % 2) * 128, l = 18 + Math.random()*8;
      x.fillStyle = `hsl(25 ${30 + Math.random()*10}% ${l}%)`; x.fillRect(c*256 + off - 256*(off && c ? 0 : 0), r*64, 256, 64);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, r*64, 512, 2); x.fillRect((c*256 + off) % 512, r*64, 2, 64);
    }
    const t = canvasTex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9);
    return t;
  }

  // ---------- arranque ----------
  function init(){
    if (ok !== null) return ok;
    stage = $('stage');
    if (!stage) return ok = false;
    try {
      canvas = document.createElement('canvas'); canvas.className = 'c3d';
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return ok = false; }
    stage.prepend(canvas);
    lbls = $('lbls3d'); pipEl = $('pip3d'); bazEl = $('baz3d'); myBub = $('mybub3d'); hintEl = $('hint3d'); muLbl = $('mue3d');
    // en celulares y tablets, 1,5 alcanza para que se vea nítida y le pide mucho menos a la placa
    const tactil = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(DPR.ahora = Math.min(tactil ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x140e0a);
    scene.fog = new THREE.Fog(0x140e0a, 34, 75);
    camera = new THREE.PerspectiveCamera(50, 1, .1, 200); camera.layers.enable(1); scene.add(camera);
    handGroup = new THREE.Group(); camera.add(handGroup);
    pipCam = new THREE.PerspectiveCamera(26, 1, .1, 80);
    ray = new THREE.Raycaster(); ray.layers.enableAll();

    luzAmb = new THREE.HemisphereLight(0xffe8c8, 0x2b1a10, 1.15); scene.add(luzAmb);
    const spot = new THREE.SpotLight(0xffdcae, 3.4, 0, .66, .6, 0);
    spot.position.set(0, 17, 1.5); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.camera.near = 6; spot.shadow.camera.far = 32; spot.shadow.bias = -.0004; spot.shadow.normalBias = .02;
    const front = new THREE.DirectionalLight(0xfff1dc, .7); front.position.set(2, 9, 18); scene.add(front);
    const rim = new THREE.DirectionalLight(0x9fb9ff, .35); rim.position.set(-6, 8, -18); scene.add(rim);

    const floor = mesh(new THREE.PlaneGeometry(160, 160), std(0x6b4a33, .92, { map: floorTex() }));
    floor.rotation.x = -PI/2; floor.position.y = -7.5; floor.castShadow = false; scene.add(floor); pisoClasico = floor;

    TEX.back = backTex();
    ['pieza','mata','fio'].forEach(k => TEX.badge[k] = badgeTex(k));
    GEO.card = roundedRectGeo(CW, CH, .075);
    GEO.outline = roundedRectGeo(CW + .12, CH + .12, .12);
    GEO.badge = new THREE.PlaneGeometry(.62, .195);
    GEO.sph = new THREE.SphereGeometry(1, 32, 24);
    GEO.sphLo = new THREE.SphereGeometry(1, 14, 10);
    GEO.box = new THREE.BoxGeometry(1, 1, 1);
    GEO.lip = new THREE.CapsuleGeometry(.062, .3, 4, 12);
    GEO.must = new THREE.CapsuleGeometry(.06, .36, 4, 10);
    GEO.ring = new THREE.TorusGeometry(.085, .058, 12, 24);
    GEO.lente = new THREE.TorusGeometry(.2, .028, 8, 28);
    GEO.arm = new THREE.CapsuleGeometry(.36, 1.7, 6, 14);
    GEO.brazo = new THREE.CapsuleGeometry(.33, 1.0, 6, 14);    // brazo y antebrazo, unidos en el codo (ver ikArm)
    GEO.bombilla = new THREE.CylinderGeometry(.03, .03, .7, 8);
    // para el bar (escenarios)
    GEO.plane = new THREE.PlaneGeometry(1, 1); GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 16); GEO.torus = new THREE.TorusGeometry(1, .08, 8, 24);
    GEO.pantalla = new THREE.CylinderGeometry(.35, 2, 1.4, 20, 1, true);
    GEO.botella = new THREE.LatheGeometry([[0, 0], [.42, 0], [.45, .1], [.45, 2.1], [.36, 2.5], [.16, 2.85], [.14, 3.3], [.17, 3.35], [.15, 3.45], [0, 3.45]].map(([a, b]) => new THREE.Vector2(a, b)), 12);
    GEO.torso = new THREE.CapsuleGeometry(1.15, 2.7, 8, 22);
    GEO.neck = new THREE.CylinderGeometry(.38, .44, .8, 18);
    GEO.glow = new THREE.CircleGeometry(1.25, 40);
    for (const s of T.SUITS) for (const n of T.NUMS) { const id = n + '-' + s; CARDS[id] = makeCard(id); }

    events();
    new ResizeObserver(resize).observe(stage);
    resize();
    return ok = true;
  }
  const GEO = {};

  function resize(){
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fovBase = camera.aspect < 1 ? Math.min(74, 2 * Math.atan(Math.tan(25 * PI/180) / Math.pow(camera.aspect, .8)) * 180/PI) : 50;
    camera.fov = fovCam();
    camera.updateProjectionMatrix();
    if (Lay) { const d = defaultCam(); if (!CAM.user) CAM.g = d; }
  }

  // ---------- cartas ----------
  function makeCard(id){
    const g = new THREE.Group();
    const front = new THREE.Mesh(GEO.card, new THREE.MeshStandardMaterial({ map: TEX.back, roughness: .55 }));
    front.position.z = .003;
    const back = new THREE.Mesh(GEO.card, new THREE.MeshStandardMaterial({ map: TEX.back, roughness: .55 }));
    back.rotation.y = PI; back.position.z = -.003;
    const outline = new THREE.Mesh(GEO.outline, new THREE.MeshBasicMaterial({ color: 0xe8b13a, transparent: true, opacity: .95 }));
    outline.visible = false;
    const badge = new THREE.Mesh(GEO.badge, new THREE.MeshBasicMaterial({ transparent: true, map: TEX.badge.pieza }));
    badge.position.set(0, -CH/2 + .02, .007); badge.visible = false;
    back.castShadow = true; front.castShadow = false;   // la sombra de una carta la hace una sola de sus caras
    g.add(outline, front, back, badge);
    g.visible = false; scene.add(g);
    front.userData.cardId = id;
    return { id, g, front, back, outline, badge, key: 'd', slot: null, tws: [], where: 'deck', face: false, onTop: false };
  }
  function setFace(o, show){ o.face = show; o.front.material.map = show && !o.hidden ? faceTex(o.id) : TEX.back; }
  function setOnTop(o, on, order){
    if (o.onTop !== on) {
      o.onTop = on;
      [o.front, o.back, o.outline, o.badge].forEach(m => { m.material.depthTest = !on; m.material.depthWrite = !on; m.layers.set(on ? 1 : 0); m.castShadow = !on && m === o.back; });
    }
    const r = on ? (order || 0) : 0;
    o.outline.renderOrder = r; o.front.renderOrder = r + 1; o.back.renderOrder = r + 1; o.badge.renderOrder = r + 2;
  }

  // ---------- disposición de la mesa ----------
  // rr: radio de la fila de cartas jugadas del que está enfrente o de vos; rrS: de los de los costados.
  // En mano a mano las bazas quedan en columnas (la compu arriba, vos abajo).
  // dk: dónde va el mazo, a la derecha del que dio: [distancia al centro, corrimiento hacia su derecha].
  // Están calculados para que el mazo y la muestra no pisen ninguna fila ni las cartas boca abajo, dé quien dé
  // (con las filas cerca de cada jugador, el mazo va al rincón entre el que dio y el de su derecha).
  // dk0: lo mismo cuando das vos, elegido además para que tu mano no tape la muestra.
  // ojoFila: cuánto más hacia el centro va tu fila, para que sentado (con los ojos de tu personaje) tu mano no la tape.
  const PARAMS = {
    2: { TR: 4.8, ojoFila: .48, rr: 1.4, rrS: 1.4, hs: .22, opp: .22, sp: 1.3, inact: 2.0, dk: [0.68, 3.84], dk0: [0.68, 3.84],
         cam: { beta: .8, rho: 14.2, tx: .35, ty: 2.0, tz: -1.9 } },
    4: { TR: 5.8, ojoFila: 1.05, rr: 2.8, rrS: 3.5, hs: .25, opp: 0, sp: 1.18, inact: 1.35, dk: [3.52, 3.4], dk0: [3.64, 3.28],
         cam: { beta: .84, rho: 18.6, tx: 0, ty: 1.7, tz: -1.7 } },
    6: { TR: 6.4, ojoFila: .85, rr: 3.3, rrS: 3.7, hs: .25, opp: 0, sp: .8, inact: 1.3, dk: [4.76, 2.75], dk0: [4.66, 2.91],
         cam: { beta: .86, rho: 20.5, tx: 0, ty: 1.8, tz: -1.9 } },
  };
  const ang = p => -PI/2 + ((p - ME + Lay.n) % Lay.n) * 2*PI / Lay.n; // vos abajo, y sigue hacia la derecha
  const onCircle = (a, r, y) => v3(Math.cos(a)*r, y || 0, -Math.sin(a)*r);
  function rowDir(p){ const a = ang(p); return (Lay.n === 4 && Math.abs(Math.cos(a)) > .5) ? v3(0, 0, 1) : v3(1, 0, 0); }
  function humanSeat(){ return v3(0, 4.3, Lay.TR + 2.2); }

  // quien mira el partido no tiene lugar: se dibujan todos los jugadores, también el de abajo
  const yoSentado = p => p === ME && !mirando();
  const claveMesa = () => G.names.join('|') + '#' + ME + (mirando() ? 'm' : '') + '#' + (G.pjs || []).join(',') + '#' + escena;
  function build(){
    if (Lay) { scene.remove(Lay.root); lbls.innerHTML = ''; }
    const n = G.n, P = PARAMS[n], root = new THREE.Group();
    scene.add(root);
    Lay = Object.assign({ n, root, names: claveMesa(), chars: [] }, P);
    (escena === 'bar' ? buildTableBar : buildTable)(root, P.TR);
    // tu cuerpo (sin cabeza, que es donde está la cámara): mirando para abajo te ves; mirando para atrás, te das vuelta
    Lay.yo = null;
    if (!mirando()) {
      const yo = makeChar(ME, G.names[ME]); yo.head.visible = false;
      yo.body.children.forEach(m => { if (m.geometry === GEO.neck || (m.geometry === GEO.sph && m.position.y > 2.8)) m.visible = false; });   // ni cuello ni capucha
      yo.g.position.copy(onCircle(ang(ME), P.TR + 1.8)); yo.g.lookAt(0, 0, 0); root.add(yo.g); Lay.yo = yo;
    }
    for (let p = 0; p < n; p++) {
      if (yoSentado(p)) { Lay.chars.push(null); continue; }
      const c = makeChar(p, G.names[p]);
      const pos = onCircle(ang(p), P.TR + 1.8);
      c.g.position.copy(pos); c.g.lookAt(0, 0, 0);
      root.add(c.g); Lay.chars.push(c);
      // etiqueta sobre la cabeza: arriba lo que acaba de decir (chiquito y por un rato), abajo nombre, marcas y señas
      const lb = document.createElement('div'); lb.className = 'l3d'; lb.dataset.p = p;
      lb.innerHTML = '<div class="say"></div><div class="in"></div>';
      lb.onclick = () => replaySenas(p);
      lbls.appendChild(lb);
      c.lbl = lb; c.bub = lb.firstChild; c.lblIn = lb.lastChild; c.lblHTML = '';
    }
    // mazo y muestra en el medio
    Lay.deckPos = deckSpot(G.dealer); Lay.dealer = G.dealer;
    const edge = std(0xece2c8, .7);
    // el mazo va cruzado sobre la muestra: la muestra (que apunta al centro) asoma por el lado largo del mazo.
    // Lay.deck gira con la muestra (su rotation.y es hacia dónde apunta ella); la caja va girada 90° adentro.
    const caja = mesh(new THREE.BoxGeometry(CW*.98, .48, CH*.98), [edge, edge, new THREE.MeshStandardMaterial({ map: TEX.back, roughness: .55 }), edge, edge, edge]);
    caja.rotation.y = PI/2;
    Lay.deck = new THREE.Group(); Lay.deck.add(caja);
    Lay.deck.position.copy(Lay.deckPos); Lay.deck.rotation.y = deckYaw(Lay.deckPos); root.add(Lay.deck);
    Lay.glow = new THREE.Mesh(GEO.glow, new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, opacity: 0 }));
    Lay.glow.rotation.x = -PI/2; Lay.glow.position.y = .012; Lay.glow.scale.set(1.9, 1.3, 1); root.add(Lay.glow);
    root.updateMatrixWorld(true);
  }

  function buildTable(root, TR){
    const felt = std(0xffffff, .95, { map: feltTex() });
    const wood = std(0xffffff, .55, { map: woodTex(10) });
    const dark = std(0x3a2414, .6);
    const top = mesh(new THREE.CylinderGeometry(TR, TR, .3, 96), [dark, felt, dark], 0, -.15, 0);
    top.castShadow = false; root.add(top);
    const rim = mesh(new THREE.TorusGeometry(TR + .12, .34, 20, 140), wood, 0, .02, 0);
    rim.rotation.x = PI/2; root.add(rim);
    root.add(mesh(new THREE.CylinderGeometry(TR + .2, TR - .4, 1, 64, 1, true), dark, 0, -.7, 0));
    root.add(mesh(new THREE.CylinderGeometry(.7, 1, 5.8, 24), dark, 0, -4.2, 0));
    root.add(mesh(new THREE.CylinderGeometry(2.6, 2.9, .35, 36), dark, 0, -7.32, 0));
  }

  // ---------- Escenarios: dónde está la mesa ----------
  // 'clasico': la mesa de paño en la sala oscura de siempre. 'bar': un bar de los de antes, de ir a tomar algo y
  // jugar a las cartas: paredes de ladrillo con cuadros, la barra con botellas y banquetas, lámparas colgando con luz
  // cálida, otras mesas de madera, la puerta con vidrios a la calle, la pizarra con los precios y el cartel con el
  // nombre (inventado: "La Muestra"). Todo con piezas simples y dibujos en canvas, sin archivos. Para que pese poco en
  // el celular, las piezas quietas se juntan en un solo dibujo por material (Lote) y nada del bar tira ni recibe
  // sombras. Se elige al crear la mesa online (cfg.escenario) o en Configuración para jugar solo (escenarioActual).
  // Unidades: 1 = 10 cm; la tapa de la mesa está en y = 0 y el piso en y = -7.5.
  const ESCENARIOS = ['bar', 'clasico'];
  let escena = null, escG = null, pisoClasico = null, lamparaMesa = null, luzAmb = null;
  const PISO = -7.5, TECHO = 22, BX = 30, BZ0 = -26, BZ1 = 28;

  // números al azar que siempre salen iguales (el bar se ve igual cada vez y para todos)
  function azar(semilla){ let s = semilla; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function lienzo(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function ruido(x, w, h, R, f){ const d = x.getImageData(0, 0, w, h), a = d.data; for (let i = 0; i < a.length; i += 4) { const n = (R() - .5) * f; a[i] += n; a[i+1] += n; a[i+2] += n; } x.putImageData(d, 0, 0); }
  const repetir = (t, rx, ry) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; };

  // junta muchas piezas quietas en un solo Mesh por material: muchas menos llamadas de dibujo
  function Lote(){
    const grupos = new Map(), tmp = new THREE.Object3D();
    return {
      add(geo, mat, x, y, z, sx, sy, sz, ry, rx, rz){
        tmp.position.set(x, y, z); tmp.rotation.set(rx || 0, ry || 0, rz || 0);
        const a = sx == null ? 1 : sx; tmp.scale.set(a, sy == null ? a : sy, sz == null ? a : sz); tmp.updateMatrix();
        const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(tmp.matrix);
        if (!grupos.has(mat)) grupos.set(mat, []);
        grupos.get(mat).push(g);
      },
      armar(parent){
        for (const [mat, list] of grupos) {
          let n = 0; list.forEach(g => { n += g.attributes.position.count; });
          const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2); let o = 0;
          list.forEach(g => {
            pos.set(g.attributes.position.array, o*3); nor.set(g.attributes.normal.array, o*3);
            if (g.attributes.uv) uv.set(g.attributes.uv.array, o*2);
            o += g.attributes.position.count; g.dispose();
          });
          const bg = new THREE.BufferGeometry();
          bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
          bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          bg.computeBoundingSphere();
          const m = new THREE.Mesh(bg, mat); m.castShadow = m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); parent.add(m);
        }
      },
    };
  }

  // ---- dibujos del bar ----
  function ladrilloTex(rx, ry){
    const W = 512, H = 384, [c, x] = lienzo(W, H), R = azar(11), bw = 64, bh = 24;
    x.fillStyle = '#6a5747'; x.fillRect(0, 0, W, H);   // la junta
    for (let r = 0; r < H / bh; r++) for (let k = -1; k <= W / bw; k++) {
      const X = k*bw + (r % 2)*bw/2, Y = r*bh;
      x.fillStyle = `hsl(${14 + R()*14} ${36 + R()*22}% ${28 + R()*15}%)`; x.fillRect(X + 2, Y + 2, bw - 4, bh - 4);
      x.fillStyle = `rgba(0,0,0,${R()*.2})`; x.fillRect(X + 2, Y + bh - 7, bw - 4, 5);
      if (R() < .14) { x.fillStyle = `rgba(232,218,192,${.12 + R()*.22})`; x.fillRect(X + 2 + R()*20, Y + 2, 16 + R()*30, bh - 4); }   // restos de cal
    }
    ruido(x, W, H, R, 20);
    return repetir(canvasTex(c), rx, ry);
  }
  function baldosaTex(rx, ry){
    const S = 256, [c, x] = lienzo(S, S), R = azar(5), t = S / 4;
    x.fillStyle = '#3d3630'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const claro = (i + j) % 2 === 0, l = claro ? 62 + R()*6 : 34 + R()*5;
      x.fillStyle = `hsl(32 ${claro ? 18 : 10}% ${l}%)`; x.fillRect(i*t + 1.5, j*t + 1.5, t - 3, t - 3);
    }
    ruido(x, S, S, R, 16);
    return repetir(canvasTex(c), rx, ry);
  }
  function tablasTex(){   // la tapa de la mesa: tablas de madera con veta
    const S = 512, [c, x] = lienzo(S, S), R = azar(3), n = 6, w = S / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = `hsl(${24 + R()*6} ${40 + R()*10}% ${24 + R()*7}%)`; x.fillRect(i*w, 0, w, S);
      for (let k = 0; k < 26; k++) {
        const X = i*w + R()*w, a = R()*.2; x.strokeStyle = R() < .5 ? `rgba(25,12,5,${a})` : `rgba(170,120,80,${a*.7})`;
        x.lineWidth = .8 + R()*2; x.beginPath(); for (let Y = 0; Y <= S; Y += 16) x.lineTo(X + Math.sin(Y/70 + k)*3, Y); x.stroke();
      }
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(i*w, 0, 2, S);
    }
    const g = x.createRadialGradient(S/2, S/2, S*.2, S/2, S/2, S*.52); g.addColorStop(0, 'rgba(255,220,170,.08)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return canvasTex(c);
  }
  function carteltex(){
    const [c, x] = lienzo(1024, 330);
    x.fillStyle = '#17110d'; x.fillRect(0, 0, 1024, 330);
    x.strokeStyle = '#d9c9a3'; x.lineWidth = 6; x.strokeRect(18, 18, 988, 294); x.lineWidth = 2; x.strokeRect(32, 32, 960, 266);
    x.fillStyle = '#eadcb8'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 66px Georgia, "Times New Roman", serif'; x.fillText('BAR', 512, 88);
    x.font = 'bold 128px Georgia, "Times New Roman", serif'; x.fillText('LA MUESTRA', 512, 192);
    x.font = 'italic 40px Georgia, serif'; x.fillText('fund. 1931', 790, 276);
    x.font = '30px Georgia, serif'; x.fillText('TRUCO · CAÑA · VERMÚ', 300, 276);
    return canvasTex(c);
  }
  function pizarraTex(){
    const [c, x] = lienzo(384, 512), R = azar(9);
    x.fillStyle = '#1f2a24'; x.fillRect(0, 0, 384, 512); ruido(x, 384, 512, R, 14);
    x.fillStyle = 'rgba(240,240,230,.88)'; x.textBaseline = 'middle';
    x.font = 'bold 44px "Comic Sans MS", "Chalkboard", cursive'; x.textAlign = 'center'; x.fillText('HOY', 192, 50);
    x.font = '30px "Comic Sans MS", "Chalkboard", cursive'; x.textAlign = 'left';
    [['Caña', 80], ['Vermú', 120], ['Grappamiel', 90], ['Medio y medio', 150], ['Café', 70], ['Chivito', 390], ['Picada', 450]].forEach(([n, p], i) => {
      x.fillText(n, 26, 118 + i*52); x.textAlign = 'right'; x.fillText('$' + p, 358, 118 + i*52); x.textAlign = 'left';
    });
    return canvasTex(c);
  }
  // los cuadros de las paredes: retratos viejos, el cuadro del equipo, un afiche del torneo, un paisaje, naipes y el diario
  function cuadroTex(tipo, sem){
    const W = 256, H = 320, [c, x] = lienzo(W, H), R = azar(sem);
    const sepia = () => { const g = x.createRadialGradient(W/2, H/2, 30, W/2, H/2, 210); g.addColorStop(0, '#d9c29a'); g.addColorStop(1, '#6b5338'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    if (tipo === 'retrato') {
      sepia(); x.fillStyle = '#3a2a1c';
      x.beginPath(); x.ellipse(W/2, 140, 46, 58, 0, 0, PI*2); x.fill();
      x.beginPath(); x.ellipse(W/2, 300, 100, 92, 0, PI, 0); x.fill();
      x.fillStyle = '#2a1d12'; x.fillRect(W/2 - 26, 158, 52, 8);   // bigote
    } else if (tipo === 'equipo') {
      sepia(); x.fillStyle = '#33251a';
      for (let f = 0; f < 2; f++) for (let i = 0; i < 6; i++) {
        const X = 34 + i*38 + f*6, Y = f ? 210 : 150, s = f ? 1.05 : .95;
        x.beginPath(); x.arc(X, Y, 11*s, 0, PI*2); x.fill(); x.fillRect(X - 13*s, Y + 12*s, 26*s, 44*s);
      }
      x.fillStyle = '#efe6d2'; x.beginPath(); x.arc(W/2, 286, 13, 0, PI*2); x.fill();
      x.fillStyle = '#3a2a1c'; x.font = 'bold 18px Georgia, serif'; x.textAlign = 'center'; x.fillText('CAMPEONES 1950', W/2, 40);
    } else if (tipo === 'afiche') {
      x.fillStyle = '#e9dcbc'; x.fillRect(0, 0, W, H); ruido(x, W, H, R, 22);
      x.textAlign = 'center'; x.fillStyle = '#8c1d18'; x.font = 'bold 34px Georgia, serif'; x.fillText('GRAN', W/2, 62); x.fillText('TORNEO', W/2, 100);
      x.fillStyle = '#1c1612'; x.font = 'bold 46px Georgia, serif'; x.fillText('DE TRUCO', W/2, 156);
      x.font = '22px Georgia, serif'; x.fillText('Parejas y tercetos', W/2, 204); x.fillText('Sábado 21 hs.', W/2, 238);
      x.fillStyle = '#8c1d18'; x.font = 'italic 20px Georgia, serif'; x.fillText('Premio: un lechón', W/2, 282);
    } else if (tipo === 'paisaje') {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#e8a65c'); g.addColorStop(.55, '#f2d29a'); g.addColorStop(.56, '#6d8a3e'); g.addColorStop(1, '#3f5a26');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff2c4'; x.beginPath(); x.arc(70, 120, 22, 0, PI*2); x.fill();
      x.fillStyle = '#3b2a1a'; x.fillRect(158, 150, 16, 60);                 // un ombú
      x.fillStyle = '#2f4a22'; x.beginPath(); x.ellipse(166, 140, 62, 40, 0, 0, PI*2); x.fill();
    } else if (tipo === 'naipes') {
      x.fillStyle = '#1f5a3c'; x.fillRect(0, 0, W, H);
      [[-22, 70, '#c9a227'], [0, 128, '#a8322b'], [22, 186, '#2c4f86']].forEach(([a, X, col]) => {
        x.save(); x.translate(X, 168); x.rotate(a * PI/180);
        x.fillStyle = '#f7f1e3'; x.fillRect(-40, -62, 80, 124); x.fillStyle = col; x.beginPath(); x.arc(0, 0, 20, 0, PI*2); x.fill(); x.restore();
      });
    } else {   // el diario
      x.fillStyle = '#ddd5c2'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#1b1b1b'; x.font = 'bold 30px Georgia, serif'; x.textAlign = 'center'; x.fillText('¡CAMPEONES!', W/2, 52);
      x.fillStyle = '#6f6a60'; x.fillRect(20, 76, W - 40, 90);
      for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(30,30,30,.55)'; x.fillRect(20 + (i % 2)*112, 184 + Math.floor(i/2)*20, 100, 6); }
    }
    return canvasTex(c);
  }
  function teleTex(){
    const [c, x] = lienzo(320, 200);
    x.fillStyle = '#2f7d3a'; x.fillRect(0, 0, 320, 200);
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; x.fillRect(i*40, 0, 40, 200); }
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2; x.strokeRect(10, 10, 300, 180); x.beginPath(); x.moveTo(160, 10); x.lineTo(160, 190); x.stroke();
    x.beginPath(); x.arc(160, 100, 26, 0, PI*2); x.stroke();
    const R = azar(4);
    for (let i = 0; i < 14; i++) { x.fillStyle = i < 7 ? '#86b9e6' : '#f2f2f2'; x.beginPath(); x.arc(30 + R()*260, 20 + R()*160, 4, 0, PI*2); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(10, 168, 110, 22); x.fillStyle = '#fff'; x.font = 'bold 14px sans-serif'; x.fillText('URU 1 - 0 ARG', 16, 184);
    return canvasTex(c);
  }

  // una silla de madera con respaldo de listones (la de los jugadores y la de las otras mesas)
  function sillaEn(L, mat, cx, cz, ry){
    const rot = (x, z) => [cx + x*Math.cos(ry) + z*Math.sin(ry), cz - x*Math.sin(ry) + z*Math.cos(ry)];
    const p = (x, y, z, w, h, d) => { const [X, Z] = rot(x, z); L.add(GEO.box, mat, X, y, Z, w, h, d, ry); };
    p(0, -3.6, -.4, 2.8, .3, 2.6);                                            // asiento
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.5, .7]) p(sx, -5.6, sz, .24, 3.8, .24);   // patas
    for (const sx of [-1.25, 1.25]) p(sx, -1.4, -1.85, .26, 4.2, .26);        // parantes del respaldo
    for (const y of [-2.4, -1.1, .2]) p(0, y, -1.85, 2.5, .38, .16);          // listones
  }

  function armarBar(){
    const g = new THREE.Group(), L = Lote(), R = azar(21);
    const M = {
      ladrilloL: std(0xffffff, .95, { map: ladrilloTex(54 / 19.2, 29.5 / 14.4) }), ladrilloF: std(0xffffff, .95, { map: ladrilloTex(60 / 19.2, 29.5 / 14.4) }),
      piso: std(0xffffff, .8, { map: baldosaTex(6, 5.4) }), techo: std(0x2e2620, .95),
      madera: std(0x4a2c18, .7), maderaOsc: std(0x2a1a10, .65), maderaClara: std(0x6b4426, .6),
      tablas: std(0xffffff, .6, { map: tablasTex() }), bronce: std(0xb08a45, .35, { metalness: .7 }), hierro: std(0x1b1715, .5, { metalness: .4 }),
      marco: std(0x3a2414, .6), dorado: std(0xa8873e, .4, { metalness: .6 }), blanco: std(0xf2efe6, .6),
      vidrio: new THREE.MeshStandardMaterial({ color: 0x5f7480, emissive: 0x8aa4b4, emissiveIntensity: .55, roughness: .3 }),
      cartel: new THREE.MeshStandardMaterial({ map: carteltex(), roughness: .8 }), pizarra: new THREE.MeshStandardMaterial({ map: pizarraTex(), roughness: .9 }),
      tele: new THREE.MeshBasicMaterial({ map: teleTex() }), salida: new THREE.MeshBasicMaterial({ color: 0x2f9e57 }),
      pantalla: std(0x101010, .4), foco: new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), pantallaLamp: std(0x1f3a2c, .55, { side: 2 }),   // 2 = las dos caras (DoubleSide)
      vidrios: [std(0x2f5d32, .22), std(0x7a4515, .22), std(0x9fb3a8, .18), std(0x5a1a1e, .25), std(0xc9a85a, .3)],
    };
    const cuadros = ['retrato', 'equipo', 'afiche', 'paisaje', 'naipes', 'diario', 'retrato'].map((t, i) => new THREE.MeshStandardMaterial({ map: cuadroTex(t, 30 + i), roughness: .85 }));
    const H = TECHO - PISO, YM = (TECHO + PISO) / 2;

    // piso, techo con vigas y las cuatro paredes de ladrillo
    L.add(GEO.plane, M.piso, 0, PISO, (BZ0 + BZ1)/2, BX*2, BZ1 - BZ0, 1, 0, -PI/2);
    L.add(GEO.plane, M.techo, 0, TECHO, (BZ0 + BZ1)/2, BX*2, BZ1 - BZ0, 1, 0, PI/2);
    for (const z of [-18, -6, 6, 18]) L.add(GEO.box, M.maderaOsc, 0, TECHO - .7, z, BX*2, 1.4, 1.6);
    L.add(GEO.plane, M.ladrilloF, 0, YM, BZ0, BX*2, H, 1, 0);
    L.add(GEO.plane, M.ladrilloF, 0, YM, BZ1, BX*2, H, 1, PI);
    L.add(GEO.plane, M.ladrilloL, -BX, YM, (BZ0 + BZ1)/2, BZ1 - BZ0, H, 1, PI/2);
    L.add(GEO.plane, M.ladrilloL, BX, YM, (BZ0 + BZ1)/2, BZ1 - BZ0, H, 1, -PI/2);
    // zócalo de madera
    L.add(GEO.box, M.maderaOsc, 0, PISO + .6, BZ0 + .15, BX*2, 1.2, .3); L.add(GEO.box, M.maderaOsc, 0, PISO + .6, BZ1 - .15, BX*2, 1.2, .3);
    L.add(GEO.box, M.maderaOsc, -BX + .15, PISO + .6, 1, .3, 1.2, BZ1 - BZ0); L.add(GEO.box, M.maderaOsc, BX - .15, PISO + .6, 1, .3, 1.2, BZ1 - BZ0);

    // fondo: la pared de madera con la puerta de vidrio, las ventanas, el cartel y "SALIDA"
    const zf = BZ0 + .25;
    L.add(GEO.box, M.madera, 0, 1.75, zf, 28, 18.5, .5);
    L.add(GEO.plane, M.vidrio, -2.45, 1.2, zf + .3, 4.3, 14.6, 1, 0); L.add(GEO.plane, M.vidrio, 2.45, 1.2, zf + .3, 4.3, 14.6, 1, 0);   // la puerta, dos hojas
    for (const x of [-5, 0, 5]) L.add(GEO.box, M.maderaOsc, x, 1.2, zf + .45, .5, 15.4, .4);
    L.add(GEO.box, M.maderaOsc, 0, 8.9, zf + .45, 10.5, .5, .4); L.add(GEO.box, M.maderaOsc, 0, -6.5, zf + .45, 10.5, .5, .4);
    L.add(GEO.box, M.bronce, -.8, 1, zf + .75, .2, 2.2, .2); L.add(GEO.box, M.bronce, .8, 1, zf + .75, .2, 2.2, .2);   // manijas
    for (const sx of [-1, 1]) {   // ventanas a los costados, con cortinas por la mitad
      L.add(GEO.plane, M.vidrio, sx*9.5, 3.5, zf + .3, 6.2, 8.4, 1, 0);
      L.add(GEO.box, M.maderaOsc, sx*9.5, 3.5, zf + .45, 6.8, .4, .35); L.add(GEO.box, M.maderaOsc, sx*9.5, -.8, zf + .45, 6.8, .5, .4);
      L.add(GEO.box, M.maderaOsc, sx*9.5, 7.8, zf + .45, 6.8, .5, .4); L.add(GEO.box, M.maderaOsc, sx*6.4, 3.5, zf + .45, .4, 8.8, .4); L.add(GEO.box, M.maderaOsc, sx*12.6, 3.5, zf + .45, .4, 8.8, .4);
      L.add(GEO.plane, M.blanco, sx*9.5, 2.2, zf + .5, 6, 3.4, 1, 0);
    }
    L.add(GEO.box, M.maderaOsc, 0, 11.2, zf + .2, 28.6, .6, .9);           // cornisa
    L.add(GEO.box, M.marco, 0, 15.6, zf + .2, 23, 7.6, .4); L.add(GEO.plane, M.cartel, 0, 15.6, zf + .45, 22, 7.1, 1, 0);
    L.add(GEO.plane, M.salida, 0, 10, zf + .5, 2.4, .7, 1, 0);
    L.add(GEO.box, M.marco, -20.5, 5.5, zf + .1, 6.4, 8.4, .3); L.add(GEO.plane, M.pizarra, -20.5, 5.5, zf + .3, 5.8, 7.8, 1, 0);   // la pizarra

    // la barra a la derecha, con banquetas, la estantería con botellas y la tele en el rincón
    const xb = 24.5, z0 = -17, z1 = 13, zc = (z0 + z1)/2, lb = z1 - z0;
    L.add(GEO.box, M.madera, xb, -2.2, zc, 4.6, 10.6, lb);
    L.add(GEO.box, M.maderaClara, xb - .2, 3.35, zc, 5.4, .5, lb + .6);
    for (let i = 0; i < 6; i++) L.add(GEO.box, M.maderaOsc, xb - 2.32, -2.4, z0 + 2.5 + i*5, .1, 8.4, 3.8);   // paneles del frente
    L.add(GEO.cyl, M.bronce, xb - 3, -5.6, zc, .12, lb, .12, 0, PI/2);   // el apoyapié
    for (const z of [-13, -6.5, 0, 6.5]) {
      L.add(GEO.cyl, M.maderaClara, xb - 5.3, -.2, z, 1.25, .5, 1.25);
      L.add(GEO.cyl, M.hierro, xb - 5.3, -3.9, z, .2, 7.2, .2);
      L.add(GEO.cyl, M.hierro, xb - 5.3, -7.35, z, 1.1, .3, 1.1);
      L.add(GEO.torus, M.hierro, xb - 5.3, -4.8, z, .9, .9, .9, 0, PI/2);
    }
    for (const y of [6.5, 10.5, 14.5]) {
      L.add(GEO.box, M.maderaOsc, BX - .9, y, zc, 1.8, .35, lb);
      for (let i = 0; i < 9; i++) {
        const z = z0 + 1.6 + i*(lb - 3.2)/8 + (R() - .5)*.8, s = .7 + R()*.25;
        L.add(GEO.botella, M.vidrios[Math.floor(R()*M.vidrios.length)], BX - .9, y + .18, z, s, s*(.85 + R()*.3), s);
      }
    }
    L.add(GEO.box, M.hierro, 27.6, 15.5, -22.6, 6.6, 4.2, .6, -.85); L.add(GEO.plane, M.tele, 27.33, 15.5, -22.37, 6, 3.7, 1, -.85);

    // pared izquierda: cuadros de todos los tamaños y un estante alto con frascos y botellas
    const cuadrosEn = (lado, zs) => zs.forEach((z, i) => {
      const w = 3 + R()*1.6, h = 3.8 + R()*1.8, y = 4.5 + R()*8, mat = cuadros[Math.floor(R()*cuadros.length)];
      const x = lado*(BX - .2), marco = R() < .3 ? M.dorado : M.marco;
      L.add(GEO.box, marco, x, y, z, .3, h + .6, w + .6);
      L.add(GEO.plane, mat, x - lado*.17, y, z, w, h, 1, -lado*PI/2);
    });
    cuadrosEn(-1, [-22, -17.5, -12.5, -8, -3, 2, 7, 12, 17, 22]);
    L.add(GEO.box, M.maderaOsc, -BX + .9, 16.8, -9, 1.8, .35, 26);
    for (let i = 0; i < 10; i++) { const z = -21 + i*2.6, s = .75 + R()*.3; L.add(i % 3 ? GEO.botella : GEO.cyl, i % 3 ? M.vidrios[Math.floor(R()*5)] : M.blanco, -BX + .9, 17 + (i % 3 ? 0 : .9), z, i % 3 ? s : .5, i % 3 ? s : 1.8, i % 3 ? s : .5); }
    // la pared de atrás tuya (la ve quien mira el partido): más cuadros
    [-20, -12, 12, 20].forEach(xc => { const w = 3.4 + R(), h = 4.4 + R(), y = 6 + R()*5, mat = cuadros[Math.floor(R()*cuadros.length)];
      L.add(GEO.box, M.marco, xc, y, BZ1 - .2, w + .6, h + .6, .3); L.add(GEO.plane, mat, xc, y, BZ1 - .37, w, h, 1, PI); });

    // otras mesas de madera con sus sillas y servilleteros (vacías: es temprano)
    const mesaCuadrada = (x, z, ry) => {
      L.add(GEO.box, M.tablas, x, -.22, z, 7, .45, 7, ry);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const a = sx*3, b = sz*3; L.add(GEO.box, M.maderaOsc, x + a*Math.cos(ry) + b*Math.sin(ry), -3.9, z - a*Math.sin(ry) + b*Math.cos(ry), .5, 7.2, .5, ry); }
      L.add(GEO.box, M.blanco, x, .55, z, 1.2, 1.1, .5, ry + .3);
      sillaEn(L, M.madera, x + 5.2*Math.sin(ry), z + 5.2*Math.cos(ry), ry + PI);   // las sillas miran a la mesa
      sillaEn(L, M.madera, x - 5.2*Math.sin(ry), z - 5.2*Math.cos(ry), ry);
    };
    const mesaRedonda = (x, z) => {
      L.add(GEO.cyl, M.tablas, x, -.22, z, 3.4, .45, 3.4);
      L.add(GEO.cyl, M.hierro, x, -3.9, z, .35, 7.2, .35); L.add(GEO.cyl, M.hierro, x, -7.35, z, 2, .3, 2);
      L.add(GEO.box, M.blanco, x + .4, .55, z, 1.2, 1.1, .5, .5);
      sillaEn(L, M.madera, x - 5, z, PI/2); sillaEn(L, M.madera, x + 5, z, -PI/2);
    };
    mesaCuadrada(-21, -14, 0); mesaCuadrada(-21, 11, PI/2); mesaRedonda(-8.5, -19.5); mesaCuadrada(10, -19.5, PI/2);

    // lámparas colgando, con la luz cálida
    // (todas en un grupo aparte, que se esconde en la vista desde arriba: desde ahí taparían la mesa)
    const LL = Lote();
    const lampara = (x, y, z) => {
      LL.add(GEO.cyl, M.hierro, x, (y + TECHO)/2 + .5, z, .05, TECHO - y - 1, .05);
      LL.add(GEO.pantalla, M.pantallaLamp, x, y + .4, z);
      LL.add(GEO.sph, M.foco, x, y - .25, z, .42);
    };
    lamparaMesa = new THREE.Group(); g.add(lamparaMesa);
    lampara(0, 16.2, 0);
    lampara(-21, 15, -14); lampara(-21, 15, 11); lampara(-8.5, 15, -19.5); lampara(10, 15, -19.5); lampara(xb - 1, 15.5, -9); lampara(xb - 1, 15.5, 5);
    LL.armar(lamparaMesa);

    L.armar(g);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return g;
  }
  function soltar(gr){
    const comunes = new Set(Object.values(GEO));
    gr.traverse(o => {
      if (!o.isMesh) return;
      if (!comunes.has(o.geometry)) o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  function ponerEscenario(k){
    if (!ESCENARIOS.includes(k)) k = 'clasico';
    if (k === escena) return;
    escena = k;
    if (escG) { scene.remove(escG); soltar(escG); escG = null; lamparaMesa = null; }
    if (k === 'bar') { escG = armarBar(); scene.add(escG); }
    if (pisoClasico) pisoClasico.visible = k === 'clasico';
    if (luzAmb) { luzAmb.color.setHex(k === 'bar' ? 0xffcf96 : 0xffe8c8); luzAmb.groundColor.setHex(k === 'bar' ? 0x4a2e1a : 0x2b1a10); luzAmb.intensity = k === 'bar' ? 2.1 : 1.15; }
    const fondo = k === 'bar' ? 0x1c130d : 0x140e0a;
    scene.background.setHex(fondo); scene.fog.color.setHex(fondo);
    scene.fog.near = k === 'bar' ? 60 : 34; scene.fog.far = k === 'bar' ? 150 : 75;
  }
  // la mesa del bar: redonda, del mismo tamaño que la de paño (así las cartas van a los mismos lugares), de madera
  function buildTableBar(root, TR){
    const tablas = std(0xffffff, .55, { map: tablasTex() }), canto = std(0x3a2414, .6), oscura = std(0x24160d, .6);
    const top = mesh(new THREE.CylinderGeometry(TR, TR, .45, 96), [canto, tablas, canto], 0, -.225, 0); top.castShadow = false; root.add(top);
    const rim = mesh(new THREE.TorusGeometry(TR + .02, .2, 12, 120), canto, 0, -.05, 0); rim.rotation.x = PI/2; root.add(rim);
    root.add(mesh(new THREE.CylinderGeometry(TR - .6, TR - .6, .8, 48, 1, true), oscura, 0, -.85, 0));
    root.add(mesh(new THREE.CylinderGeometry(.75, .95, 6.4, 20), oscura, 0, -4.1, 0));
    for (const a of [0, PI/2]) { const pie = mesh(GEO.box, oscura, 0, -7.2, 0, 7.5, .5, .9); pie.rotation.y = a + PI/4; root.add(pie); }
  }

  // ---------- personajes ----------
  const LOOKS = {
    Computadora: { skin: 0xe4b38b, hair: 'gorro', hc: 0x7d2335, brow: 0x3a2618 },
    Tito:  { skin: 0xebc29b, hair: 'corto', hc: 0x5b3a22 },
    Pocho: { skin: 0xd6a078, hair: 'boina', hc: 0x262426, brow: 0x2a1e18, must: true },
    Nacho: { skin: 0xf0c8a4, hair: 'rulos', hc: 0x1e1511 },
    Lalo:  { skin: 0xe0ae88, hair: 'pelado', hc: 0xc4bdb3, must: true },
    Beto:  { skin: 0xf2cfae, hair: 'jopo', hc: 0xd3a94e, brow: 0x8a6a30 },
  };
  const SHIRTS = [[0x86b9e6, 0x6aa3d8, 0x9cc7ee], [0x8b2335, 0x6f1d2b, 0x9c3441]];
  // una persona en la mesa toma la cara de ese lugar (la del que se sentaría ahí si fuera la computadora)
  const SEAT_LOOKS = [{ skin: 0xdcae86, hair: 'corto', hc: 0x2b1c12 }, LOOKS.Tito, LOOKS.Pocho, LOOKS.Nacho, LOOKS.Lalo, LOOKS.Beto];
  const NEUTRAL = { browUp:0, browIn:0, eyeA:1, eyeB:1, nose:0, pucker:0, twist:0, open:0, bite:0, tongue:0 };
  const GEST = {
    '2': { browUp: 1, eyeA: 1.15, eyeB: 1.15 },
    '4': { pucker: 1 },
    '5': { nose: 1, browIn: .9, browUp: -.3 },
    'perico': { eyeA: .03, twist: .3, browUp: .1 },
    'mata': { twist: 1 },
    '3': { bite: 1 },
    'dos': { open: .9 },
    'as': { open: .3, tongue: 1 },
    'nada': { eyeA: .03, eyeB: .03 },
  };

  const lookDe = id => { const x = PERSONAJES.find(q => q.id === id); return x ? x.look : null; };
  function makeChar(p, name, forzar){
    const lk = forzar || lookDe(G && G.pjs && G.pjs[p]) || LOOKS[name] || SEAT_LOOKS[p] || LOOKS.Tito;
    const shirt = SHIRTS[team(p) === team(ME) ? 0 : 1][Math.floor(p/2) % 3]; // tu equipo de celeste
    const M = {
      skin: std(lk.skin, .72), skin2: std(new THREE.Color(lk.skin).multiplyScalar(.9), .7), shirt: std(shirt, .9),
      hair: std(lk.hc, .95), brow: std(lk.brow || lk.hc, .9), pants: std(0x2d2b36, .9), wood: std(0x4a2b17, .65),
      gorra: std(lk.gc || 0x222222, .8), gorra2: std(lk.gc2 || lk.gc || 0x222222, .8), mus: std(lk.mc || lk.hc, .95), lente: std(0x1c1612, .35),
      lip: std(0xa4433e, .55), zapato: std(0x1b1410, .5), tongue: std(0xd8606a, .45), white: std(0xfbfaf4, .35), dark: std(0x17110e, .4), inner: std(0x3a1313, .9), tooth: std(0xfffdf5, .3),
    };
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    // silla
    g.add(mesh(GEO.box, M.wood, 0, -3.6, -.4, 2.8, .3, 2.6));
    for (const sx of [-1.25, 1.25]) g.add(mesh(GEO.box, M.wood, sx, -1.4, -1.85, .26, 4.2, .26));   // respaldo: dos parantes y tres listones
    for (const y of [-2.4, -1.1, .2]) g.add(mesh(GEO.box, M.wood, 0, y, -1.85, 2.5, .38, .16));
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.5, .7]) g.add(mesh(GEO.box, M.wood, sx, -5.6, sz, .24, 3.8, .24));
    // cuerpo
    // piernas: muslos sobre el asiento, rodillas debajo del borde de la mesa, canillas hasta el piso y zapatos
    for (const sx of [-1, 1]) {
      g.add(mesh(GEO.box, M.pants, sx*.56, -3.0, .7, 1.0, .95, 2.8));
      g.add(mesh(GEO.sph, M.pants, sx*.56, -3.05, 2.05, .5, .5, .5));
      const can = mesh(GEO.brazo, M.pants, sx*.6, -5.2, 2.2, 1.1, 1.75, 1.1); can.rotation.x = -.06; g.add(can);
      g.add(mesh(GEO.box, M.zapato, sx*.62, -7.22, 2.45, .78, .55, 1.45));
    }
    const torso = mesh(GEO.torso, M.shirt, 0, .25, -.2, 1.2, 1, .8); body.add(torso);
    body.add(mesh(GEO.neck, M.skin, 0, 3.05, -.12));
    if (lk.capucha) body.add(mesh(GEO.sph, M.shirt, 0, 2.95, -.78, 1.05, .5, .55));   // la capucha del buzo, atrás del cuello
    // brazos con codo: el hombro queda fijo y la mano va adonde la mande el gesto (ikArm); en reposo, sobre la mesa
    // con las cartas. La mano es un puño; para los gestos asoman el pulgar, el índice, la mano abierta o el mate.
    const hands = [], arms = [];
    for (const sx of [1, -1]) {
      const S = v3(sx*1.35, 2.15, -.2), H0 = v3(sx*.58, 1.38, 1.28);
      const up = mesh(GEO.brazo, M.shirt), lo = mesh(GEO.brazo, M.shirt); body.add(up); body.add(lo);
      const hg = new THREE.Group(); hg.position.copy(H0); body.add(hg);
      const palm = mesh(GEO.sph, M.skin, 0, 0, 0, .34, .3, .36); hg.add(palm); hands.push(palm);
      // pulgar arriba: el puño de costado con los dedos doblados (nudillos al frente) y el pulgar arriba, del lado de adentro
      const thumb = new THREE.Group(); thumb.visible = false; hg.add(thumb);
      const pg1 = mesh(GEO.sph, M.skin, -sx*.11, .34, .04, .11, .2, .11); pg1.rotation.z = -sx*.18; thumb.add(pg1);
      for (let i = 0; i < 4; i++) thumb.add(mesh(GEO.sph, M.skin, sx*.03, .17 - i*.115, .27, .16, .062, .085));
      const index = mesh(GEO.sph, M.skin, 0, .4, .06, .075, .27, .075); index.visible = false; hg.add(index);
      const open = new THREE.Group(); open.visible = false; hg.add(open);
      for (let i = 0; i < 4; i++) open.add(mesh(GEO.sph, M.skin, -.2 + i*.135, .5 - Math.abs(i - 1.5)*.05, 0, .06, .19, .065));
      const pul = mesh(GEO.sph, M.skin, sx*-.38, .12, 0, .07, .17, .07); pul.rotation.z = sx*.7; open.add(pul);   // en 'palma' va casi junto a los dedos
      const mate = new THREE.Group(); mate.visible = false; hg.add(mate);
      mate.add(mesh(GEO.sph, std(0x6e4e2a, .7), 0, .36, .1, .27, .3, .27));
      mate.add(mesh(GEO.sph, std(0x55702e, .95), 0, .62, .1, .18, .04, .18));
      const bo = mesh(GEO.bombilla, std(0xcfd3d6, .25, { metalness: .8 }), 0, .82, .02); bo.rotation.x = -.45; mate.add(bo);
      arms.push({ sx, S, H0, up, lo, hg, palm, thumb, index, open, pul, mate, shape: 'puño', quieto: false });
    }
    // cabeza
    const pivot = new THREE.Group(); pivot.position.set(0, 3.25, -.08); pivot.rotation.order = 'YXZ'; body.add(pivot);
    const head = new THREE.Group(); head.position.y = .98; pivot.add(head);
    const skull = mesh(GEO.sph, M.skin, 0, 0, 0, .95, 1.07, .97); head.add(skull);
    skull.userData.charP = p;
    for (const sx of [1, -1]) head.add(mesh(GEO.sphLo, M.skin, sx*.92, -.1, -.03, .13, .22, .19));
    const eyes = [1, -1].map(sx => {
      const e = new THREE.Group(); e.position.set(sx*.34, .14, .82); head.add(e);
      const w = mesh(GEO.sphLo, M.white, 0, 0, 0, .2, .22, .11); w.castShadow = false;
      const pu = mesh(GEO.sphLo, M.dark, 0, -.01, .1, .095, .1, .05); pu.castShadow = false;
      e.add(w, pu);
      const shut = mesh(GEO.box, M.dark, sx*.34, .12, .9, .38, .05, .06); shut.visible = false; shut.castShadow = false; head.add(shut);
      return { g: e, w, pu, shut };
    });
    const brows = [1, -1].map(sx => { const b = mesh(GEO.box, M.brow, sx*.35, .45, .86, .42, .1, .13); b.castShadow = false; head.add(b); return b; });
    const nose = mesh(GEO.sph, M.skin2, 0, -.1, .97, .16, .19, .15); head.add(nose);
    const mouth = new THREE.Group(); mouth.position.set(0, -.48, .84); mouth.rotation.x = .5; head.add(mouth);
    const lipU = mesh(GEO.lip, M.lip, 0, .045, 0); lipU.rotation.z = PI/2;
    const lipL = mesh(GEO.lip, M.lip, 0, -.045, 0, 1.08, 1, 1.08); lipL.rotation.z = PI/2;
    const inner = mesh(GEO.sphLo, M.inner, 0, 0, -.02, .2, .02, .06);
    const teeth = mesh(GEO.box, M.tooth, 0, -.005, .045, .24, .075, .04); teeth.visible = false;
    const ring = mesh(GEO.ring, M.lip, 0, 0, .03); ring.visible = false;
    const tongue = mesh(GEO.sphLo, M.tongue, 0, -.06, .06, .11, .045, .1); tongue.visible = false;
    [lipU, lipL, inner, teeth, ring, tongue].forEach(m => { m.castShadow = false; mouth.add(m); });
    if (lk.must) {
      const mu = new THREE.Group(); mu.position.set(0, -.31, .92); mu.rotation.x = .3; head.add(mu);
      for (const sx of [1, -1]) { const m = mesh(GEO.must, M.mus, sx*.13, 0, 0); m.rotation.z = PI/2 + sx*.35; m.castShadow = false; mu.add(m); }
    }
    if (lk.barba) {
      // la barba va por debajo de la boca (no la tapa cuando habla ni cuando hace señas con los labios)
      head.add(mesh(GEO.sph, M.hair, 0, -.78, .3, .8, .5, .55));
      for (const sx of [1, -1]) head.add(mesh(GEO.sph, M.hair, sx*.8, -.25, .12, .16, .42, .34));
    }
    if (lk.lentes) {
      for (const sx of [1, -1]) {
        const l = mesh(GEO.lente, M.lente, sx*.34, .14, .92); l.castShadow = false; head.add(l);
        const pat = mesh(GEO.box, M.lente, sx*.78, .17, .45, .04, .04, .8); pat.rotation.y = sx*.28; pat.castShadow = false; head.add(pat);
      }
      const pu = mesh(GEO.box, M.lente, 0, .17, .96, .16, .035, .035); pu.castShadow = false; head.add(pu);
    }
    hair(head, lk, M);
    const c = { p, g, body, pivot, head, skull, eyes, brows, nose, mouth, lipU, lipL, inner, teeth, ring, tongue, hands, arms, ag: null,
      F: Object.assign({}, NEUTRAL), yaw: 0, pitch: 0, blinkAt: clock() + 1 + Math.random()*3, blinkTo: 0,
      talkTo: 0, react: null, lookTo: null, lookUntil: 0, gest: null, phase: Math.random()*6 };
    // sombras: solo lo que se nota (el torso, la cabeza, el pelo y los brazos); los detalles de la cara, las piernas
    // y la silla no cambian nada y cada uno costaba otro dibujo en cada cuadro
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    [torso, skull, ...arms.flatMap(a => [a.up, a.lo, a.palm])].forEach(m => { m.castShadow = true; });
    head.children.forEach(m => { if (m.isMesh && m.material === M.hair) m.castShadow = true; });
    return c;
  }
  function hair(head, lk, M){
    const H = M.hair;
    const cap = (r, th, tilt, col) => {
      const m = mesh(new THREE.SphereGeometry(r, 32, 16, 0, 2*PI, 0, th), col || H);
      m.rotation.x = -tilt; m.scale.set(.95, 1.07, .97); head.add(m); return m;
    };
    if (lk.hair === 'corto') cap(1.045, 1.3, .5);
    else if (lk.hair === 'jopo') { cap(1.045, 1.25, .55); head.add(mesh(GEO.sph, H, .2, .86, .45, .5, .26, .42)); }
    else if (lk.hair === 'gorro') { cap(1.07, 1.2, .38); head.add(mesh(GEO.sph, H, 0, 1.2, -.12, .26)); }
    else if (lk.hair === 'boina') {
      cap(1.03, 1.0, .5);
      const b = mesh(GEO.sph, H, .12, 1.0, -.12, 1.1, .27, 1.1); b.rotation.z = .16; b.rotation.x = -.12; head.add(b);
      head.add(mesh(GEO.sphLo, H, .14, 1.25, -.12, .08));
    } else if (lk.hair === 'rulos') {
      cap(1.03, 1.25, .5);
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4, t = .25 + (i % 4) * .22, r = 1.0;
        const x = Math.sin(t*PI*.5) * Math.cos(a) * r, z = Math.sin(t*PI*.5) * Math.sin(a) * r - .12, y = Math.cos(t*PI*.5) * r * 1.04;
        if (z > .45 && y < .75) continue;
        head.add(mesh(GEO.sphLo, H, x*.95, y + .05, z, .3));
      }
    } else if (lk.hair === 'rapado') cap(1.012, 1.3, .5);
    else if (lk.hair === 'largo') {
      cap(1.045, 1.35, .45);
      head.add(mesh(GEO.sph, H, 0, -.4, -.42, 1.0, 1.25, .62));                       // cae por la espalda
      for (const sx of [1, -1]) head.add(mesh(GEO.sph, H, sx*.84, -.5, -.05, .24, .78, .38));
    } else if (lk.hair === 'colita') {
      // flequillo y la colita que cae por adelante, sobre un hombro (así se ve de frente)
      cap(1.045, 1.3, .5);
      head.add(mesh(GEO.sph, H, -.12, .66, .58, .74, .24, .36));
      head.add(mesh(GEO.sphLo, H, .62, .1, -.7, .2));
      head.add(mesh(GEO.sph, H, .74, -.45, -.48, .25, .55, .27));
      head.add(mesh(GEO.sph, H, .86, -1.05, -.12, .22, .5, .24));
    } else if (lk.hair === 'rodete') {
      cap(1.045, 1.3, .5);
      head.add(mesh(GEO.sph, H, 0, 1.12, -.3, .42, .36, .42));            // rodete alto
    } else if (lk.hair === 'gorra') {
      // gorra con la visera de costado; se le ve el pelo a los costados
      cap(1.03, 1.45, .5);
      cap(1.075, 1.12, .28, M.gorra);
      head.add(mesh(GEO.sphLo, M.gorra2, 0, 1.08, -.1, .1));
      const v = mesh(GEO.sph, M.gorra2, .98, .48, -.22, .55, .06, .42); v.rotation.z = -.32; v.rotation.y = .25; head.add(v);
    } else if (lk.hair === 'pelado') {
      for (const sx of [1, -1]) head.add(mesh(GEO.sph, H, sx*.78, .1, -.32, .32, .42, .55));
      head.add(mesh(GEO.sph, H, 0, .05, -.8, .7, .45, .35));
    }
  }

  function applyFace(c, t){
    const F = c.F;
    const talk = c.talkTo > t ? .16 + .16*Math.sin(t*24) : 0;
    const blink = (!c.gest && c.blinkTo > t) ? .04 : 1;
    [F.eyeA, F.eyeB].forEach((v, i) => {
      const e = c.eyes[i], o = Math.min(v, blink) * (1 - .45*F.nose);
      e.g.scale.y = clamp(o, .06, 1.2);
      const closed = o < .25; e.w.visible = e.pu.visible = !closed; e.shut.visible = closed;
    });
    c.brows.forEach((b, i) => { const sx = i === 0 ? 1 : -1; b.position.y = .45 + F.browUp*.16 - F.nose*.03; b.rotation.z = -sx*.06 + sx*F.browIn*.34; });
    c.nose.scale.set(.16*(1 + F.nose*.2), .19*(1 - F.nose*.25), .15); c.nose.position.y = -.1 + F.nose*.04;
    const open = Math.max(F.open, talk);
    const m = c.mouth;
    m.scale.x = 1 - .5*F.pucker; m.position.z = .84 + .12*F.pucker; m.rotation.z = F.twist*.45; m.position.x = F.twist*.14; m.position.y = -.48 + F.nose*.03;
    // labios adelante: la boca se vuelve una "o"
    const pk = F.pucker > .3;
    c.ring.visible = pk; c.lipU.visible = c.lipL.visible = !pk;
    if (pk) { const r = .55 + .45*F.pucker; c.ring.scale.set(r*1.05, r, r*1.4); m.scale.x = 1; }
    c.lipU.position.y = .045 + open*.05 + F.bite*.05;
    c.lipL.position.y = -.045 - open*.15 + F.bite*.01; c.lipL.position.z = -F.bite*.06;
    c.inner.visible = open > .04 || pk;
    c.inner.scale.set(pk ? .1 : .2, pk ? .085 : .02 + open*.17, .06);
    c.inner.position.y = -open*.05;
    c.teeth.visible = F.bite > .12; c.teeth.scale.set(.27, .095*F.bite, .04);
    // la punta de la lengua asomando entre los labios
    c.tongue.visible = F.tongue > .08;
    if (c.tongue.visible) { c.tongue.position.set(0, -.07 - open*.05, .04 + .1*F.tongue); c.tongue.scale.set(.1, .042, .06 + .06*F.tongue); }
  }

  // ---------- gestos con la mano (panel "En la mesa", extras.part.js) ----------
  // Dos huesos (brazo y antebrazo, 1,25 cada uno): dado el hombro y adónde va la mano, el codo sale hacia abajo y
  // para afuera. Cada gesto dice, en cada momento, dónde está la mano derecha (coordenadas del cuerpo: x a la
  // izquierda del personaje, y arriba, z hacia la mesa), qué forma tiene, cómo gira, y cómo ponen la cara y la cabeza.
  const L_BRAZO = 1.25, tmpS = v3(0, 0, 0), tmpE = v3(0, 0, 0), tmpH = v3(0, 0, 0), tmpP = v3(0, 0, 0);
  function hueso(m, a, b){ m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, tmpP.copy(b).sub(a).normalize()); }
  function ikArm(A, H){
    const dir = tmpS.copy(H).sub(A.S); let d = dir.length(); dir.normalize();
    d = clamp(d, .4, 2*L_BRAZO - .02);
    const a = d / 2, h = Math.sqrt(Math.max(0, L_BRAZO*L_BRAZO - a*a));
    const pole = tmpE.set(A.sx*.55, -1, -.25); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const hand = tmpH.copy(A.S).addScaledVector(dir, d);
    const elbow = pole.multiplyScalar(h).add(A.S).addScaledVector(dir, a);
    hueso(A.up, A.S, elbow); hueso(A.lo, elbow, hand); A.hg.position.copy(hand);
  }
  function forma(A, s){
    if (A.shape === s) return; A.shape = s;
    const abierta = s === 'abierta' || s === 'palma';
    A.thumb.visible = s === 'pulgar'; A.index.visible = s === 'indice'; A.open.visible = abierta; A.mate.visible = s === 'mate';
    if (abierta) A.palm.scale.set(.32, .36, .13); else if (s === 'pulgar') A.palm.scale.set(.3, .36, .32); else A.palm.scale.set(.34, .3, .36);
    // la palma abierta con el pulgar casi junto a los dedos (para que, de frente, todo apunte para el mismo lado)
    if (s === 'palma') { A.pul.position.set(A.sx*-.3, .26, 0); A.pul.rotation.z = A.sx*.25; } else { A.pul.position.set(A.sx*-.38, .12, 0); A.pul.rotation.z = A.sx*.7; }
  }
  // gira la mano para que los dedos apunten a "dir" y la palma mire hacia "nrm" (si se da)
  const tmpD = v3(0, 0, 0), tmpN = v3(0, 0, 0), tmpZ = v3(0, 0, 0), qMano = new THREE.Quaternion(), qId = new THREE.Quaternion();
  function apuntar(dir, nrm){
    tmpD.copy(dir).normalize(); qMano.setFromUnitVectors(UP, tmpD);
    if (nrm) {
      tmpZ.copy(ZAX).applyQuaternion(qMano); tmpN.copy(nrm).addScaledVector(tmpD, -nrm.dot(tmpD)).normalize();
      const a = Math.atan2(tmpZ.clone().cross(tmpN).dot(tmpD), tmpZ.dot(tmpN));
      qMano.premultiply(qA(tmpD, a));
    }
    return qMano;
  }
  // dónde está la boca, en las coordenadas del cuerpo (para llevar el dedo o la bombilla justo ahí)
  const tmpB = v3(0, 0, 0);
  function bocaDe(c){ c.mouth.getWorldPosition(tmpB); return c.body.worldToLocal(tmpB).clone(); }
  function ojoDe(c){ c.eyes[1].g.getWorldPosition(tmpB); return c.body.worldToLocal(tmpB).clone(); }   // el ojo derecho
  const suave = x => x*x*(3 - 2*x);
  const mezcla = (a, b, k) => a.clone().lerp(b, suave(clamp(k, 0, 1)));
  const GA = {
    pulgar: { d: 2.2, f: t => ({ H: v3(-.95, 3.05 + .06*Math.sin(t*9), 1.75), s: 'pulgar', face: { browUp: .35, twist: .25 } }) },
    nodedo: { d: 2.4, f: t => ({ H: v3(-.55, 3.65, 1.7), s: 'indice', rz: .5*Math.sin(t*13), hy: .12*Math.sin(t*13), face: { browIn: .45, pucker: .25 } }) },
    // deja las cartas boca abajo en la mesa (computeSlots) y aplaude con las dos manos
    aplauso: { d: 3.0, cartas: 2.45, f: t => {
      const on = t > .55 && t < 2.35, k = on ? .5 + .5*Math.cos((t - .55)*14) : 1, gap = .13 + .32*k;
      return { H: v3(-gap, 2.75, 1.7), s: 'abierta', ry: PI/2, L: { H: v3(gap, 2.75, 1.7), s: 'abierta', ry: -PI/2 }, face: { browUp: .35, open: .25 } };
    } },
    risa: { d: 2.4, f: t => ({ H: v3(-.4, 1.0, 1.15), s: 'abierta', hp: -.28, bob: .08*Math.abs(Math.sin(t*15)), face: { open: .6, eyeA: .3, eyeB: .3, browUp: .3 } }) },
    bienahi: { d: 2.0, f: t => ({ H: v3(-1.3, 4.3 + .12*Math.sin(t*12), .9), s: 'puño', face: { open: .4, browUp: .6 } }) },
    // la mano sube desde abajo y la punta del índice toca el párpado de abajo; después te señala
    // (la punta del índice queda un poco abajo del ojo derecho y apenas adelante: ojo es dónde va la mano desde ahí)
    mirar: { d: 2.8, f: t => { const k = (t - 1.25) / .4;
      return { ojo: v3(-.08, -.73, .22), H2: v3(-.8, 3.3, 2.05), k, s: 'indice', dir: mezcla(v3(.12, 1, -.2), v3(-.2, .08, 1), k), face: { browIn: .5, eyeA: .75, eyeB: .75 } }; } },
    // la mano a su derecha, palma para arriba, con los dedos y el pulgar apuntando para afuera
    quese: { d: 2.2, f: () => ({ H: v3(-1.8, 2.15, 1.35), s: 'palma', dir: v3(-1, .12, .3), nrm: v3(0, 1, 0), hr: .22, bob: .1, face: { browUp: .85, twist: .3 } }) },
    pensar: { d: 3.0, f: () => ({ H: v3(-.2, 3.35, 1.05), s: 'puño', hr: .15, hp: -.12, face: { browIn: .3, twist: .35, eyeA: .8, eyeB: .8 } }) },
    // el índice parado sobre los labios
    shh: { d: 2.4, f: () => ({ boca: v3(0, -.42, .05), s: 'indice', face: { pucker: .85, browUp: .3 } }) },
    // golpea la mesa con el puño, dos veces, a su derecha (lejos de las cartas)
    bronca: { d: 2.2, f: t => { const ph = (t*2.4) % 1, up = ph < .65 ? suave(ph/.65) : 1 - suave((ph - .65)/.35); return { H: v3(-1.5, 1.35 + 1.25*up, 1.45), s: 'puño', face: { browIn: 1, nose: .4, bite: .4 } }; } },
    saludo: { d: 2.4, f: t => ({ H: v3(-1.75, 3.9, 1.0), s: 'abierta', rz: .4*Math.sin(t*11), face: { browUp: .4, twist: .2 } }) },
    // la punta de la bombilla en la boca
    mate: { d: 3.4, f: t => ({ boca: v3(0, -1.13, .15), s: 'mate', face: t > .6 && t < 2.7 ? { pucker: .75, eyeA: .45, eyeB: .45 } : {} }) },
  };
  const charDe = p => Lay && (Lay.chars[p] || (yoSentado(p) ? Lay.yo : null));   // tu cuerpo (sin cabeza) cuando estás sentado
  function aplaudiendo(p){ const c = charDe(p); return !!(c && c.ag && GA[c.ag.k] && GA[c.ag.k].cartas && clock() - c.ag.t0 < GA[c.ag.k].cartas); }
  const envolver = a => Math.atan2(Math.sin(a), Math.cos(a));
  const ATRAS = 1.9;   // mirando más para atrás que esto (unos 110°), deja las cartas en la mesa y se da vuelta en la silla
  function miraAtras(p){
    if (yoSentado(p)) return enOjos() && !!CAM.ojo && Math.abs(envolver(CAM.ojo.yaw)) > ATRAS;
    const mi = miradaDe(p); return !!(mi && !mi.mu && Math.abs(mi.y) > ATRAS);
  }
  const cartasEnMesa = p => aplaudiendo(p) || miraAtras(p);
  // cuánto gira el cuerpo (el resto lo gira la cabeza, hasta 1,15): pasados los 0,9, tuerce el torso en la silla
  const torsion = y => Math.sign(y) * clamp(Math.abs(y) - .9, 0, 1.5);
  function gestoMano(c, t){
    const g = c.ag; let out = null, e = 0;
    if (g) {
      const tt = g.fijo != null ? g.fijo : t - g.t0;   // fijo: para mirar un instante del gesto (pruebas)
      if (tt >= g.d || !GA[g.k]) c.ag = null;
      else { e = suave(clamp(Math.min(tt / .35, (g.d - tt) / .4), 0, 1)); out = GA[g.k].f(tt, c); }
    }
    if (out && out.boca) out.H = bocaDe(c).add(out.boca);
    if (out && out.ojo) { const b = ojoDe(c).add(out.ojo); out.H = out.H2 ? mezcla(b, out.H2, out.k) : b; }
    c.arms.forEach((A, i) => {
      const o = out && (i === 1 ? out : out.L);
      if (o) {
        ikArm(A, mezcla(A.H0, o.H, e)); forma(A, e > .25 ? o.s : 'puño');
        if (o.dir) A.hg.quaternion.copy(qId).slerp(apuntar(o.dir, o.nrm), e);
        else A.hg.rotation.set((o.rx || 0)*e, (o.ry || 0)*e, (o.rz || 0)*e);
        A.quieto = false;
      } else if (!A.quieto) { ikArm(A, A.H0); forma(A, 'puño'); A.hg.rotation.set(0, 0, 0); A.quieto = true; }
    });
    return out ? { out, e } : null;
  }

  function updateChars(t, dt){
    if (!Lay) return;
    const R = G.round;
    if (Lay.yo) {
      const yo = Lay.yo; gestoMano(yo, t);
      const tw = enOjos() && CAM.ojo ? torsion(envolver(CAM.ojo.yaw)) : 0;
      yo.tw = (yo.tw || 0) + (tw - (yo.tw || 0)) * Math.min(1, dt*4); yo.body.rotation.y = yo.tw;
    }
    Lay.chars.forEach(c => {
      if (!c) return;
      // cara: seña en curso o reacción
      const tgt = Object.assign({}, NEUTRAL);
      if (c.gest && c.gest.k) { const gk = GEST[c.gest.k]; for (const k in gk) tgt[k] = NEUTRAL[k] + (gk[k] - NEUTRAL[k]) * c.gest.env; }
      const ga = gestoMano(c, t);
      if (ga && ga.out.face && !c.gest) for (const k in ga.out.face) tgt[k] += (ga.out.face[k] - NEUTRAL[k]) * ga.e;
      if (c.react && c.react.face) { const rk = c.react.face, e = Math.sin(PI*clamp((t - c.react.t0)/c.react.d, 0, 1)); for (const k in rk) tgt[k] += (rk[k] - NEUTRAL[k]) * e; }
      for (const k in tgt) c.F[k] += (tgt[k] - c.F[k]) * Math.min(1, dt*18);
      if (!c.gest && t > c.blinkAt) { c.blinkTo = t + .13; c.blinkAt = t + 2.5 + Math.random()*4; }
      applyFace(c, t);
      // mirada: la de la persona que juega ese lugar (si avisó hacia dónde mira), si no, la de siempre
      const mi = !c.gest ? miradaDe(c.p) : null;
      let look, yaw, pitch, lean = 0;
      let tw = 0;
      if (mi && !mi.mu) { tw = torsion(mi.y); yaw = clamp(mi.y - tw, -1.15, 1.15); pitch = clamp(mi.pi, -.35, .6); lean = clamp((1 - mi.z) * 4, -.45, .6); }
      else {
        if (c.gest) look = c.gest.look;
        else if (mi && mi.mu) { look = muePose(true).pos.clone(); lean = .6; }   // se acerca a ver la muestra
        else if (c.lookUntil > t && c.lookTo) look = c.lookTo;
        else if (R && G.phase === 'play' && lastAct === c.p) look = c.g.localToWorld(tmpW.set(0, 1.4, 1.5)).clone();
        else look = v3(Math.sin(t*.31 + c.phase)*1.6, 0, Math.cos(t*.23 + c.phase)*1.2);
        c.g.worldToLocal(tmpV.copy(look));
        const dx = tmpV.x, dy = tmpV.y - 4.2, dz = tmpV.z + .08;
        yaw = clamp(Math.atan2(dx, dz), -1.15, 1.15); pitch = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -.35, .6);
      }
      c.lean = (c.lean || 0) + (lean - (c.lean || 0)) * Math.min(1, dt*4);
      c.yaw += (yaw - c.yaw) * Math.min(1, dt*5); c.pitch += (pitch - c.pitch) * Math.min(1, dt*5);
      let ry = 0, rx = 0, bz = 0;
      if (c.react) {
        const e = (t - c.react.t0) / c.react.d;
        if (e >= 1) c.react = null;
        else {
          const s = Math.sin(PI*e);
          if (c.react.type === 'nod') rx = .22*Math.sin(e*PI*4)*(1 - e);
          else if (c.react.type === 'shake') ry = .3*Math.sin(e*PI*6)*(1 - e);
          else if (c.react.type === 'lunge') { bz = .45*s; rx = -.08*s; }
          else if (c.react.type === 'slump') rx = .4*s;
        }
      }
      if (ga) { rx += (ga.out.hp || 0)*ga.e; ry += (ga.out.hy || 0)*ga.e; }
      c.pivot.rotation.set(c.pitch + rx, c.yaw + ry, ga ? (ga.out.hr || 0)*ga.e : 0);
      c.pivot.position.y = 3.25 + (ga ? (ga.out.bob || 0)*ga.e : 0);
      c.body.position.z = bz + c.lean;
      c.body.scale.y = 1 + .008*Math.sin(t*1.7 + c.phase);
      c.body.rotation.z = .012*Math.sin(t*.7 + c.phase);
      c.tw = (c.tw || 0) + (tw - (c.tw || 0)) * Math.min(1, dt*4); c.body.rotation.y = c.tw;
      const inact = R && (!R.active[c.p] || R.out[c.p]);
      c.body.position.y += ((inact ? -.25 : 0) - c.body.position.y) * Math.min(1, dt*3);
    });
  }
  function charHead(p){ const c = Lay.chars[p]; return c ? c.head.getWorldPosition(v3(0,0,0)) : humanSeat(); }
  function partnerOf(p){ return (p + 2) % G.n; }

  // ---------- señas: trabajos en fila, uno por vez ----------
  const LEAD = .6, PER = 1.75;
  function queueSenas(p, list, kind){ S.cnt.senas++; S.jobs.push({ p, list: list.slice(), kind, notBefore: Math.max(now, S.dealEnd) + .25 }); }
  function replaySenas(p){
    const R = G.round;
    if (!R || !Lay || !Lay.chars[p]) return;
    if (team(p) === team(ME)) { if (R.senasShown[p] && G.rules.senas && !R.leyPhase && !R.duel) { S.jobs = S.jobs.filter(j => j.p !== p); if (S.job && S.job.p === p) S.job = null; queueSenas(p, R.senasShown[p], 'partner'); S.jobs[S.jobs.length-1].notBefore = now; } }
    else { const v = (R.seen[ME] || []).filter(x => x.p === p); if (v.length && !R.leyPhase) { queueSenas(p, v.map(x => x.s), 'caught'); S.jobs[S.jobs.length-1].notBefore = now; } }
  }
  function runJobs(){
    let j = S.job;
    if (!j && S.jobs.length && now >= S.jobs[0].notBefore) { j = S.job = S.jobs.shift(); j.t0 = now; j.cap = null; }
    if (!j) return;
    const c = Lay && Lay.chars[j.p];
    if (!c) { S.job = null; return; }
    const e = now - j.t0, idx = Math.floor((e - LEAD) / PER);
    if (e > LEAD + j.list.length*PER + .3) { S.job = null; c.gest = null; return; }
    let env = 0, k = null;
    if (e >= LEAD && idx < j.list.length) {
      k = j.list[idx]; const u = (e - LEAD) - idx*PER;
      env = u < .25 ? u/.25 : u < 1.25 ? 1 : u < 1.5 ? 1 - (u - 1.25)/.25 : 0;
    }
    c.gest = { k: env > 0 ? k : null, env, look: j.kind === 'partner' ? humanSeat() : charHead(partnerOf(j.p)) };
    const cap = env > .2 ? k : '';
    if (cap !== j.cap) {
      j.cap = cap;
      const nm = esc(G.names[j.p]);
      const head = j.kind === 'partner' ? `<b>${nm}</b> te hace señas` : `👀 Le pescaste una seña a <b>${nm}</b>`;
      const ges = cap ? `${EMOJI[cap]} ${T.SENAS[cap].gesto}` + (showHelp ? ` → <b>${T.SENAS[cap].cartas}</b>` : '') : '&nbsp;';
      pipEl.querySelector('.cap').innerHTML = `${head}<div class="ges">${ges}</div>`;
    }
  }

  // ---------- dónde va cada carta ----------
  function flat(x, y, z, up, yaw){ return { pos: v3(x, y, z), quat: qA(UP, yaw).multiply((up ? Q_UP : Q_DOWN).clone()), scale: 1 }; }
  // tu fila va un poco más hacia el centro, para que tu mano no la tape
  // tu fila va más hacia el centro (sentado, mirás la mesa desde cerca y tu mano tapa lo que tenés adelante)
  function rowRad(p){ return p === ME ? Lay.rr - Lay.hs - (mirando() ? 0 : Lay.ojoFila || 0) : Math.abs(Math.cos(ang(p))) < .3 ? Lay.rr + Lay.opp : Lay.rrS; }
  function rowCenter(p){ return onCircle(ang(p), rowRad(p)); }
  function tablePose(p, b, id){
    const c = rowCenter(p), d = rowDir(p), sp = d.z ? 1.25 : Lay.sp;
    return flat(c.x + d.x*(b-1)*sp + hashJ(id, 'x')*.06, .02 + b*.007, c.z + d.z*(b-1)*sp + hashJ(id, 'z')*.08, true, hashJ(id, 'r')*.14);
  }
  function downPose(p, i, k, up, id){
    const c = onCircle(ang(p), rowRad(p) + Lay.inact), d = i - (k-1)/2, r = rowDir(p);   // abiertas a lo largo de su fila
    return flat(c.x + r.x*d*.45, .02 + i*.007, c.z + r.z*d*.45, up, hashJ(id, 'r')*.12 + d*.12);
  }
  // las cartas que deja boca abajo sobre la mesa, delante suyo, para aplaudir
  function dejadaPose(p, i, k, id){
    const a = ang(p), d = i - (k-1)/2, w = onCircle(a, Lay.TR - .9), tx = -Math.sin(a), tz = -Math.cos(a);
    return flat(w.x + tx*d*.62, .02 + i*.007, w.z + tz*d*.62, false, hashJ(id, 'a')*.12 + d*.12);
  }
  function fanPose(p, i, k){
    const c = Lay.chars[p], d = i - (k-1)/2;
    const lp = v3(d*.36, 1.78 - Math.abs(d)*.07, 1.5 - Math.abs(d)*.03 + i*.012);
    const lq = qA(XAX, .62).multiply(qA(UP, PI)).multiply(qA(ZAX, d*.22));
    return { pos: c.g.localToWorld(lp), quat: c.g.getWorldQuaternion(new THREE.Quaternion()).multiply(lq), scale: 1 };
  }
  // cartas que quedan en el mazo: las de verdad que no salieron, menos las tapadas que andan en manos ajenas
  function deckCount(){
    let n = 0;
    for (const id in CARDS) { const o = CARDS[id]; if (o.hidden) { if (o.where !== 'deck') n--; } else if (o.where === 'deck') n++; }
    return n;
  }
  const ownerOf = id => id === 'xm' ? 'm' : +id.slice(1).split('-')[0]; // de quién es una carta tapada
  // El mazo va a la derecha del que dio (así se ve enseguida quién dio) y la muestra boca arriba debajo
  // del mazo, asomando hacia el centro de la mesa, como se pone en la realidad. Al cambiar de mano el
  // mazo se desliza al nuevo repartidor, girado para que la muestra asome siempre hacia el medio.
  function deckSpot(dealer){
    const a = ang(dealer), k = dealer === ME ? Lay.dk0 : Lay.dk, E = onCircle(a, k[0]);
    return v3(E.x - Math.sin(a)*k[1], 0, E.z - Math.cos(a)*k[1]);
  }
  const MUE_Y = .014;   // el mazo apoya sobre la muestra
  function deckH(){ return .48*deckCount()/40 + MUE_Y; }
  function deckYaw(pos){ return Math.atan2(-pos.x, -pos.z); }   // el largo de la carta apunta al centro
  function deckTop(){ const d = Lay.deck.position; return flat(d.x, deckH() + .01, d.z, false, Lay.deck.rotation.y + PI/2); }
  // la muestra asoma lo mismo que antes, ahora por el lado largo del mazo (que es menos profundo hacia el centro)
  const MUE_K = CH*.78 - (CH - CW)*.49;
  function muePose(up){
    const d = Lay.deck.position, y = Lay.deck.rotation.y, k = MUE_K;
    const negra = G && G.round && G.round.muestra && G.round.muestra.n >= 10;   // sota, caballo o rey: que asome el palo
    return flat(d.x + Math.sin(y)*k, .006, d.z + Math.cos(y)*k, up, y + .05 + (negra ? PI : 0));
  }
  function handLayout(){
    const D = 4, h = 2*D*Math.tan(camera.fov*PI/360), w = h*camera.aspect;
    const ch = Math.min(.225*h, (.9*w/3.3)*CH/CW), s = ch/CH;
    return { D, h, w, s, ch, baseY: -h/2 + ch*.3, sp: CW*s*1.1 };
  }
  function handLocal(o){
    const R = G.round, hand = R.hands[ME], k = hand.length, i = Math.max(0, hand.findIndex(c => c.id === o.id)), L = handLayout();
    const d = i - (k-1)/2, can = S.playable.has(o.id), hov = S.hover === o.id && can;
    const lift = hov ? .26 : can ? .1 : 0;
    const pos = v3(d*L.sp, L.baseY - Math.abs(d)*.03*L.ch + lift*L.ch - (S.mz ? .8*L.ch : S.myOut ? .4*L.ch : 0), -L.D + i*.004);
    return { pos, quat: qA(ZAX, -d*.06), scale: L.s * (hov ? 1.05 : 1), i };
  }
  function slotPose(slot, o){
    if (slot.hand) {
      const l = handLocal(o);
      return { pos: handGroup.localToWorld(l.pos.clone()), quat: camera.quaternion.clone().multiply(l.quat), scale: l.scale };
    }
    if (slot.deck) return deckTop();
    if (slot.muestra) return muePose(slot.face);
    return slot.pose;
  }
  function computeSlots(){
    const R = G.round, out = {}, n = G.n, ended = G.phase !== 'play';
    const fueMazo = p => R.said[p] && /mazo/i.test(R.said[p].text) && (R.out[p] || ended);
    for (let p = 0; p < n; p++) {
      const h = R.hands[p], k = h.length;
      h.forEach((c, i) => {
        if (fueMazo(p)) { out[c.id] = { key: 'd', deck: true }; return; }
        if (yoSentado(p)) { out[c.id] = cartasEnMesa(p) ? { key: `a:${p}:${i}:${k}`, pose: dejadaPose(p, i, k, c.id), face: false, p } : { key: 'hand', hand: true, face: true }; return; }
        if (ended) { const up = !!R.mustShow[p] && !c.hidden; out[c.id] = { key: `r:${p}:${i}:${k}:${up}`, pose: downPose(p, i, k, up, c.id), face: up, p }; return; }
        if (!R.active[p] || R.out[p]) { out[c.id] = { key: `x:${p}:${i}:${k}`, pose: downPose(p, i, k, false, c.id), face: false, p }; return; }
        if (cartasEnMesa(p)) { out[c.id] = { key: `a:${p}:${i}:${k}`, pose: dejadaPose(p, i, k, c.id), face: false, p }; return; }
        out[c.id] = { key: `f:${p}:${i}:${k}`, pose: fanPose(p, i, k), face: false, fan: true, p };
      });
    }
    const onTable = (c, p, b) => { out[c.id] = { key: `t:${p}:${b}:${!c.hidden}`, pose: tablePose(p, b, c.id), face: !c.hidden, table: true, p, b }; };
    R.tricks.forEach((t, b) => t.cards.forEach((c, p) => { if (c) onTable(c, p, b); }));
    R.cur.forEach((c, p) => { if (c) onTable(c, p, R.tricks.length); });
    const up = !R.leyPhase;
    out[R.muestra.id] = { key: 'm:' + up, pose: null, face: up && !R.muestra.hidden, muestra: true, p: 'm' };
    return out;
  }

  // ---------- movimientos ----------
  function go(o, slot, delay, opts, append){
    opts = opts || {};
    const tw = { start: now + (delay || 0), dur: (opts.dur || .45) * AS(), arc: opts.arc == null ? .5 : opts.arc, slot, started: false, fromPose: opts.from || null };
    if (append && o.tws.length) { const lastTw = o.tws[o.tws.length-1]; tw.start = Math.max(tw.start, lastTw.start + lastTw.dur + .01); o.tws.push(tw); }
    else o.tws = [tw];
    o.key = slot.key; o.slot = slot;
  }
  function place(o, slot){
    o.tws = []; o.key = slot.key; o.slot = slot;
    if (slot.deck) { o.g.visible = false; o.where = 'deck'; if (o.g.parent !== scene) scene.attach(o.g); setOnTop(o, false); return; }
    setFace(o, !!(slot.face || slot.hand));
    o.g.visible = true;
    if (slot.hand) {
      if (o.g.parent !== handGroup) handGroup.add(o.g);
      const l = handLocal(o); o.g.position.copy(l.pos); o.g.quaternion.copy(l.quat); o.g.scale.setScalar(l.scale);
      o.where = 'hand'; setOnTop(o, true, 100 + l.i*4);
    } else {
      if (o.g.parent !== scene) scene.attach(o.g);
      const ps = slotPose(slot, o); o.g.position.copy(ps.pos); o.g.quaternion.copy(ps.quat); o.g.scale.setScalar(1);
      o.where = 'scene'; setOnTop(o, false);
    }
  }
  function stepCard(o, t, dt){
    const tw = o.tws[0];
    if (tw) {
      if (t < tw.start) return;
      if (!tw.started) {
        tw.started = true;
        if (o.where === 'deck') { const d = tw.fromPose || deckTop(); o.g.position.copy(d.pos); o.g.quaternion.copy(d.quat); o.g.scale.setScalar(1); o.g.visible = true; setFace(o, false); }
        if (o.g.parent === handGroup) scene.attach(o.g);
        if (tw.slot.face || tw.slot.hand) setFace(o, true);
        else if (!tw.slot.deck && !tw.slot.muestra) setFace(o, false);
        if (tw.slot.table && !yoSentado(tw.slot.p)) S.cnt[tw.fromPose ? 'desdeMano' : 'desdeMazo']++; // carta jugada por otro: sale de su mano
        if (t < S.dealEnd && !tw.slot.deck && !tw.slot.table) SND.play('deal');
        tw.fromHand = o.where === 'hand';
        tw.from = { pos: o.g.position.clone(), quat: o.g.quaternion.clone(), scale: o.g.scale.x };
        o.where = 'moving';
        if (tw.slot.hand) setOnTop(o, true, 160);
      }
      const k = Math.min(1, (t - tw.start) / tw.dur), e = ease(k), d = slotPose(tw.slot, o);
      o.g.position.lerpVectors(tw.from.pos, d.pos, e); o.g.position.y += tw.arc * Math.sin(PI*k);
      o.g.quaternion.slerpQuaternions(tw.from.quat, d.quat, e);
      o.g.scale.setScalar(tw.from.scale + (d.scale - tw.from.scale) * e);
      if (tw.fromHand && !tw.slot.hand) setOnTop(o, k < .45, 160);
      if (k >= 1) {
        o.tws.shift();
        if (tw.slot.table) SND.play('place');
        if (tw.slot.hand) { handGroup.attach(o.g); o.where = 'hand'; }
        else if (tw.slot.deck) { o.g.visible = false; o.where = 'deck'; setOnTop(o, false); }
        else { o.where = 'scene'; setOnTop(o, false); }
      }
      return;
    }
    if (o.where === 'scene' && o.slot && o.slot.muestra) { const p = muePose(o.slot.face); o.g.position.copy(p.pos); o.g.quaternion.copy(p.quat); }
    if (o.where === 'hand') {
      const l = handLocal(o), f = Math.min(1, dt*12);
      o.g.position.lerp(l.pos, f); o.g.quaternion.slerp(l.quat, f); o.g.scale.setScalar(o.g.scale.x + (l.scale - o.g.scale.x)*f);
      setOnTop(o, true, 100 + l.i*4);
      const dim = S.myOut ? .55 : (S.myTurn && !S.playable.has(o.id)) ? .72 : 1;
      o.front.material.color.setScalar(dim);
      const hov = S.hover === o.id && S.playable.has(o.id);
      o.outline.visible = hov; if (hov) o.outline.material.color.setHex(0xe8b13a);
    } else o.front.material.color.setScalar(1);
  }

  // ---------- reconciliar con el estado del juego ----------
  function update(act, legal){
    if (!init()) return;
    lastAct = act; myLegal = legal || [];
    const R = G.round;
    if (!R) return;
    let fresh = false;
    ponerEscenario(typeof escenarioActual === 'function' ? escenarioActual() : 'clasico');
    if (!Lay || Lay.n !== G.n || Lay.names !== claveMesa()) { build(); fresh = true; }
    if (S.mid !== G.id) {   // empezó otro partido (G es una copia nueva en cada dibujo: se compara la marca)
      S.mid = G.id; S.roundNo = null; S.jobs = []; S.job = null; S.said = {}; S.cnt.partido++;
      CAM.user = false; CAM.ojo = ojo0(); const d = defaultCam();
      Object.assign(CAM, { phi: -.9, beta: 1.0, rho: d.rho*1.9, tx: d.tx, ty: d.ty, tz: d.tz }); CAM.g = d; CAM.k = 1.6;
      fresh = true;
    }
    if (customDeck !== S.deckSig) { S.deckSig = customDeck; for (const id in CARDS) if (CARDS[id].face) setFace(CARDS[id], true); }
    resume();
    camera.updateMatrixWorld(true);
    if (Lay.dealer !== G.dealer || fresh) { Lay.dealer = G.dealer; Lay.deckPos = deckSpot(G.dealer); if (fresh) { Lay.deck.position.set(Lay.deckPos.x, Lay.deck.position.y, Lay.deckPos.z); Lay.deck.rotation.y = deckYaw(Lay.deckPos); } }
    S.playable = new Set(myLegal.filter(a => a.type === 'play').map(a => a.card.id));
    S.myTurn = act === ME && G.phase === 'play' && !mirando();
    S.myOut = mirando() || !R.active[ME] || R.out[ME];
    $('cam3dMine').textContent = mirando() ? 'Vista de la mesa' : 'Tu lugar';
    if (hintEl) hintEl.textContent = mirando() ? 'Arrastrá para dar la vuelta a la mesa · rueda o pellizco para acercar' : 'Arrastrá para mirar para cualquier lado · rueda o pellizco para acercarte';

    const slots = computeSlots(), rk = G.roundNo + ':' + (R.duel ? R.duel.idx : 0);
    for (const id in slots) if (!CARDS[id]) { CARDS[id] = makeCard(id); CARDS[id].hidden = true; }
    // tapadas que se van (alguien jugó o mostró esa carta): la carta destapada sale de ahí
    const gone = {};
    for (const id in CARDS) {
      const o = CARDS[id];
      if (o.hidden && !slots[id] && (o.where !== 'deck' || o.tws.length) && !(o.slot && o.slot.deck)) (gone[ownerOf(id)] = gone[ownerOf(id)] || []).push(o);
    }
    for (const k in gone) gone[k].sort((a, b) => b.id.localeCompare(a.id));
    const takeFrom = owner => {
      const L = gone[owner]; if (!L || !L.length) return null;
      const ph = L.shift(), pose = { pos: ph.g.getWorldPosition(v3(0, 0, 0)), quat: ph.g.getWorldQuaternion(new THREE.Quaternion()), scale: 1 };
      ph.tws = []; ph.g.visible = false; ph.where = 'deck'; ph.key = 'd'; ph.slot = null; if (ph.g.parent !== scene) scene.attach(ph.g);
      return pose;
    };
    let dealT0 = null, snap = false;
    if (G.roundNo !== S.roundNo) {
      const untouched = R.tricks.length === 0 && R.cur.every(x => !x) && R.said.every(x => !x);
      if (S.roundNo === null && !untouched) snap = true;
      else {
        let k = 0;
        for (const id in CARDS) { const o = CARDS[id]; if (o.where !== 'deck' || o.tws.length) { go(o, { key: 'd', deck: true }, k*.012, { dur: .32, arc: .35 }); k++; } }
        dealT0 = k ? .45*AS() : .1;
      }
      if (S.mz) muestraZoom(false);
      S.roundNo = G.roundNo; S.jobs = []; S.job = null; S.senasRk = null; S.seenN = 0; S.humanSenas = null; S.pescados = '';
      Lay.chars.forEach(c => { if (c) c.gest = null; });
    }
    const dt = ({ 2: .09, 4: .075, 6: .062 })[G.n] * AS();
    for (const id in CARDS) {
      const o = CARDS[id], s = slots[id] || { key: 'd', deck: true };
      if (snap) { place(o, s); continue; }
      if (dealT0 !== null) {
        if (s.deck) continue;
        let order;
        if (s.muestra) order = 3*G.n + 1;
        else { const p = R.hands.findIndex(h => h.some(c => c.id === id)), j = R.hands[p].findIndex(c => c.id === id); order = j*G.n + ((p - R.dealMano + G.n) % G.n); }
        go(o, s, dealT0 + order*dt, { dur: .42, arc: .7 }, true);
        continue;
      }
      if (s.key !== o.key) {
        const opts = s.table ? { dur: .55, arc: .9 } : s.deck ? { dur: .4, arc: .5 } : { dur: .45, arc: .4 };
        if ((!o.hidden || s.table) && o.where === 'deck' && !o.tws.length && s.p !== undefined) opts.from = takeFrom(s.p);
        if (o.hidden && s.deck && o.where === 'deck' && !o.tws.length) { o.key = 'd'; o.slot = s; continue; }
        go(o, s, 0, opts);
      }
      else o.slot = s;
    }
    for (const k in gone) gone[k].forEach(ph => { ph.tws = []; ph.g.visible = false; ph.where = 'deck'; ph.key = 'd'; ph.slot = null; });
    if (dealT0 !== null) { S.dealEnd = now + dealT0 + (3*G.n + 2)*dt + .45*AS(); S.cnt.reparto++; SND.play('shuffle'); }
    else if (snap) { S.dealEnd = now; S.cnt.ubicar++; }
    S.rk = rk;

    // la baza que se está jugando (o la que se acaba de cerrar, hasta que alguien tira la próxima): borde
    // dorado, así se distingue de las cartas de las bazas anteriores
    for (const id in CARDS) { const o = CARDS[id]; if (o.where !== 'hand' && !(o.slot && o.slot.hand)) o.outline.visible = false; }
    bazaEnJuego(R).forEach(c => { const o = c && CARDS[c.id]; if (o) { o.outline.visible = true; o.outline.material.color.setHex(0xe8b13a); } });
    // insignias de pieza, mata y fío en tus cartas
    for (const id in CARDS) {
      const o = CARDS[id], inHand = o.slot && o.slot.hand;
      const cat = inHand && showHelp && !R.leyPhase ? T.category({ n: +id.split('-')[0], s: id.split('-')[1], id }, R.muestra) : null;
      o.badge.visible = !!TEX.badge[cat];
      if (o.badge.visible) o.badge.material.map = TEX.badge[cat];
    }

    // lo que dicen: globos y caras
    for (let p = 0; p < G.n; p++) {
      const sd = R.said[p], prev = S.said[p];
      const key = sd ? G.roundNo + ':' + sd.t : null;
      if (key === prev) continue;
      S.said[p] = key;
      if (!sd || fresh) continue;
      showBubble(p, sd.text);
    }
    // señas del compañero (al empezar la mano, cuando ya se repartió) y señas pescadas
    if (G.n >= 4 && G.rules.senas && !R.duel && !R.leyPhase && G.phase === 'play' && !R.hands[ME].some(c => c.hidden)) {
      // señas de los compañeros: las de la computadora llegan al empezar la mano; las de una persona, cuando las hace
      if (S.senasRk !== rk) { S.senasRk = rk; S.pSen = {}; }
      for (let p = 0; p < G.n; p++) {
        if (p === ME || team(p) !== team(ME)) continue;
        const list = R.senasShown[p] || [], sig = list.join(','), prev = S.pSen[p];
        if (sig === (prev || '')) { S.pSen[p] = sig; continue; }
        const nuevas = prev === undefined ? list : T.senasMinus(list, prev ? prev.split(',') : []);
        S.pSen[p] = sig;
        if (nuevas.length) queueSenas(p, nuevas, 'partner');
      }
      const seen = R.seen[ME] || [];
      for (; S.seenN < seen.length; S.seenN++) queueSenas(seen[S.seenN].p, [seen[S.seenN].s], 'caught');
      const hs = (R.senasShown[ME] || []).join(',');
      if (S.humanSenas !== null && hs !== S.humanSenas && hs) Lay.chars.forEach(c => { if (c && team(c.p) === team(ME)) { c.lookTo = humanSeat(); c.lookUntil = now + 1.4; c.react = { type: 'nod', t0: now + .3, d: .8 }; } });
      S.humanSenas = hs;
      const pesc = [];
      for (let o = 0; o < G.n; o++) if (team(o) !== team(ME) && (R.seen[o] || []).some(v => v.p === ME)) pesc.push(o);
      const pk = pesc.join(',');
      if (pk !== S.pescados) { pesc.filter(o => !S.pescados.split(',').includes(String(o))).forEach(o => { const c = Lay.chars[o]; if (c) { c.lookTo = humanSeat(); c.lookUntil = now + 1.6; c.react = { type: 'nod', t0: now, d: .6, face: { twist: .35, browUp: .4 } }; } }); S.pescados = pk; }
    }
    updateLabels(act);
  }

  function showBubble(p, text, ms, largo){
    S.cnt.dichos++;
    const el2 = yoSentado(p) ? myBub : Lay.chars[p] && Lay.chars[p].bub;
    if (!el2) return;
    el2.textContent = text; el2.classList.toggle('largo', !!largo); el2.classList.remove('on'); void el2.offsetWidth; el2.classList.add('on');
    clearTimeout(el2._t); el2._t = setTimeout(() => el2.classList.remove('on'), ms || 2200);
    // quien habla mueve la boca y reacciona; los demás lo miran
    const speaker = yoSentado(p) ? humanSeat() : charHead(p);
    Lay.chars.forEach(c => { if (c && c.p !== p && !c.gest) { c.lookTo = speaker; c.lookUntil = now + 1.6; } });
    const c = Lay.chars[p];
    if (!c) return;
    c.talkTo = now + clamp(.25 + text.length*.05, .5, 1.4);
    const tx = text.toLowerCase();
    if (/truco|retruco|vale cuatro/.test(tx)) c.react = { type: 'lunge', t0: now, d: .8, face: { browUp: .7 } };
    else if (/^no quiero|son buenas|achico/.test(tx)) c.react = { type: 'shake', t0: now, d: .9 };
    else if (/^quiero|con ley/.test(tx)) c.react = { type: 'nod', t0: now, d: .8 };
    else if (/mazo|paso/.test(tx)) c.react = { type: 'slump', t0: now, d: 1.3 };
    else if (/flor/.test(tx)) c.react = { type: 'lunge', t0: now, d: .7, face: { browUp: .5 } };
    else if (/envido|falta|real/.test(tx)) c.react = { type: 'lunge', t0: now, d: .6 };
  }

  function updateLabels(act){
    const R = G.round;
    Lay.chars.forEach(c => {
      if (!c) return;
      const p = c.p, tags = [], partner = G.n >= 4 && team(p) === team(ME) && !mirando();
      if (R.mano === p) tags.push('<span class="tag mano">mano</span>');
      if (G.dealer === p) tags.push('<span class="tag">da</span>');
      if (R.flor.sung[p]) tags.push('<span class="tag flor">flor</span>');
      if (act === p && G.phase === 'play') tags.push('<span class="tag turn">juega</span>');
      if (R.out[p]) tags.push('<span class="tag out">pasó</span>');
      let sen = '';
      if (partner && R.senasShown[p] && G.rules.senas && !R.leyPhase && !R.duel && !R.hands[ME].some(c => c.hidden)) sen += senaGroups(R.senasShown[p]).map(([k, n]) => `<span class="sena">${senaTxt(k, n)}</span>`).join('');
      if (!R.leyPhase) senaGroups((R.seen[ME] || []).filter(v => v.p === p).map(v => v.s)).forEach(([k, n]) => { sen += `<span class="sena caught">👀 ${senaTxt(k, n)}</span>`; });
      const mic = NET && NET.talking && NET.talking[p] ? ' 🎙' : '';
      const html = `<div class="nm">${esc(G.names[p])}${fuego(p)}${mic}${G.n >= 4 ? `<small>${mirando() ? colorEq(team(p)) : partner ? 'compañero' : 'rival'}</small>` : ''}</div>`
        + (tags.length ? `<div class="tags">${tags.join('')}</div>` : '') + (sen ? `<div class="senas">${sen}</div>` : '');
      if (html !== c.lblHTML) { c.lblIn.innerHTML = html; c.lblHTML = html; }
      c.lbl.classList.toggle('inactive', !R.active[p]);
      c.lbl.classList.toggle('click', !!sen);
      c.lbl.title = sen ? 'Tocá para volver a mirarle las señas' : '';
    });
    const chips = [];
    for (let i = 0; i < 3; i++) { const t = R.tricks[i]; chips.push(`<span class="bz"><i>${['1ª','2ª','3ª'][i]}</i>${t ? resChip(t).outerHTML : '<span class="res">—</span>'}</span>`); }
    bazEl.innerHTML = chips.join('');
  }

  // ---------- cámara ----------
  // La vista general: desde atrás y arriba del lugar de abajo. Es la de quien mira el partido (un poco más
  // alta y más atrás, porque está parado) y la base de "Desde arriba".
  function vistaGeneral(){
    const c = (Lay || { cam: PARAMS[2].cam }).cam, a = camera.aspect || 1.6;
    const wide = a < 1.25 ? Math.pow(1.25 / a, .5) : 1;
    return { phi: 0, beta: c.beta, rho: c.rho * wide, tx: c.tx * (a < 1 ? 0 : 1), ty: c.ty, tz: c.tz };
  }
  // El que juega mira con los ojos de su personaje: sentado en su lugar, a la altura de la cabeza de los
  // demás. Arrastrando gira la cabeza hasta 30° para cada lado y mira un poco más arriba o más abajo; la
  // rueda o el pellizco lo inclinan hacia la mesa o hacia atrás (el mismo margen que tenía la cámara de
  // antes para acercarse o alejarse). Así no da la vuelta a la mesa ni ve la espalda de nadie.
  // ojo: { yaw (hacia la izquierda), pitch (hacia abajo), z (1 = sentado derecho; menos, inclinado hacia la mesa) }
  const OJOS = { y: 4.5, afuera: 1.4, mira: 9, pitch: .38, fov: 1.18 };
  const LIM = { giro: PI/6, arriba: .75, abajo: .95, cerca: .86, lejos: 1.1 };
  const ojo0 = () => ({ yaw: 0, pitch: OJOS.pitch, z: 1 });
  function ojosCam(o){
    const TR = Lay ? Lay.TR : PARAMS[2].TR, base = vistaGeneral().rho, cp = Math.cos(o.pitch);
    const f = v3(-Math.sin(o.yaw)*cp, -Math.sin(o.pitch), -Math.cos(o.yaw)*cp);    // hacia dónde mira
    // los ojos: adelante del centro de la cabeza, hacia donde mira (así, dado vuelta, no te ves el cuello)
    const fh = Math.hypot(f.x, f.z) || 1, ojo = TR + OJOS.afuera + .32;
    const E = v3(f.x/fh*.32, OJOS.y, ojo + f.z/fh*.32).addScaledVector(f, (1 - o.z) * base);
    const T = E.clone().addScaledVector(f, OJOS.mira);
    return { phi: o.yaw, beta: o.pitch, rho: OJOS.mira, tx: T.x, ty: T.y, tz: T.z };
  }
  function limitarOjo(o){
    // la cabeza gira para cualquier lado (o.yaw no tiene tope; a los demás se les avisa entre -π y π); mirando para
    // abajo te ves el cuerpo. Lo que se limita es acercarse o alejarse (o.z)
    o.pitch = clamp(o.pitch, OJOS.pitch - LIM.arriba, OJOS.pitch + LIM.abajo);
    o.z = clamp(o.z, LIM.cerca, LIM.lejos);
  }
  const enOjos = () => !mirando() && CAM.vista !== 'top';
  // lo que ven los demás de tu cámara: tu cabeza girada, inclinado, o mirando la muestra de cerca
  function miradaPropia(){
    if (S.mz) return { y: 0, pi: .5, z: 1, mu: true };
    if (!enOjos() || !CAM.ojo) return { y: 0, pi: OJOS.pitch, z: 1, mu: false };
    return { y: envolver(CAM.ojo.yaw), pi: CAM.ojo.pitch, z: CAM.ojo.z, mu: false };
  }
  function defaultCam(){
    if (!mirando()) return ojosCam(ojo0());
    const d = vistaGeneral();
    return { ...d, beta: d.beta + .14, rho: d.rho * 1.12 };
  }
  // "Desde arriba" (y quien mira): la cámara gira alrededor de la mesa; el que juega, hasta 30°
  function limitarCam(g){
    if (mirando()) { g.beta = clamp(g.beta, .2, 1.5); g.rho = clamp(g.rho, 7, 34); return; }
    const b = topCam();
    g.phi = clamp(g.phi, b.phi - LIM.giro, b.phi + LIM.giro);
    g.beta = clamp(g.beta, b.beta - .1, Math.min(1.5, b.beta + .16));
    g.rho = clamp(g.rho, b.rho * LIM.cerca, b.rho * LIM.lejos);
  }
  function topCam(){ const d = vistaGeneral(); return { phi: 0, beta: 1.45, rho: d.rho * 1.05, tx: d.tx, ty: 0, tz: 1.2 }; }
  // sentado (con los ojos) se ve un poco más abierto, como ve una persona sin mover la cabeza
  let fovBase = 50;
  const fovCam = () => enOjos() && !S.mz ? Math.min(80, fovBase * OJOS.fov) : fovBase;
  function updateCamera(dt){
    if (CAM.g) {
      const f = Math.min(1, dt*CAM.k);
      for (const k of ['phi', 'beta', 'rho', 'tx', 'ty', 'tz']) CAM[k] += (CAM.g[k] - CAM[k]) * f;
    }
    const fv = fovCam();
    if (Math.abs(camera.fov - fv) > .05) { camera.fov += (fv - camera.fov) * Math.min(1, dt*4); camera.updateProjectionMatrix(); }
    const cb = Math.cos(CAM.beta);
    camera.position.set(CAM.tx + CAM.rho*Math.sin(CAM.phi)*cb, CAM.ty + CAM.rho*Math.sin(CAM.beta), CAM.tz + CAM.rho*Math.cos(CAM.phi)*cb);
    camera.lookAt(CAM.tx, CAM.ty, CAM.tz);
  }
  function setView(v){ if (S.mz) { S.mz = null; muLbl.classList.remove('on'); } CAM.vista = v; CAM.ojo = ojo0(); CAM.user = v !== 'mine'; CAM.g = v === 'top' ? topCam() : defaultCam(); CAM.k = 3; }

  // ---------- puntero: girar, acercar, jugar cartas ----------
  const ptrs = new Map();
  let drag = null;
  function pick(ev){
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width)*2 - 1, -((ev.clientY - r.top) / r.height)*2 + 1);
    ray.setFromCamera(ndc, camera);
    const hand = [];
    for (const id in CARDS) { const o = CARDS[id]; if (o.where === 'hand' || (o.slot && o.slot.hand && o.g.visible)) hand.push(o.front); }
    const hc = ray.intersectObjects(hand, false);
    if (hc.length) return { card: hc.sort((a, b) => b.object.renderOrder - a.object.renderOrder)[0].object.userData.cardId };
    const heads = Lay ? Lay.chars.filter(Boolean).map(c => c.skull) : [];
    const hh = ray.intersectObjects(heads, false);
    if (hh.length) return { p: hh[0].object.userData.charP };
    const mo = muestraObj();
    if (mo && ray.intersectObject(mo.front, false).length) return { muestra: true };
    return {};
  }
  // ---------- ver la muestra de cerca ----------
  // Con el cursor encima de la muestra (o tocándola en pantallas táctiles, o con la tecla M) la cámara
  // se acerca a mirarla desde arriba y la mano baja; al salir, vuelve a donde estaba.
  function muestraObj(){
    const R = G && G.round; if (!R || !R.muestra || R.muestra.hidden) return null;
    const o = CARDS[R.muestra.id]; return o && o.g.visible && o.face && !o.tws.length ? o : null;
  }
  function muestraZoom(on){
    if (on && (S.mz || !muestraObj())) return;
    if (!on) { if (!S.mz) return; const z = S.mz; S.mz = null; CAM.g = z.prevG; CAM.user = z.prevUser; CAM.k = 4; muLbl.classList.remove('on'); muLbl.textContent = 'Muestra'; return; }
    const mp = muePose(true).pos, y = Lay.deck.rotation.y, k = CH*.1;
    const prevG = CAM.g ? { ...CAM.g } : defaultCam();
    S.mz = { prevG, prevUser: CAM.user, round: G.roundNo };
    CAM.g = { phi: CAM.phi, beta: 1.2, rho: 3.4, tx: mp.x + Math.sin(y)*k, ty: 0, tz: mp.z + Math.cos(y)*k };
    CAM.user = true; CAM.k = 4;
    muLbl.classList.add('on'); muLbl.textContent = 'Muestra: ' + T.cardName(G.round.muestra);
  }
  function canReplay(p){ const c = Lay && Lay.chars[p]; return c && c.lblHTML.includes('class="sena'); }
  function events(){
    canvas.addEventListener('pointerdown', ev => { ultimoToque = clock();
      canvas.setPointerCapture(ev.pointerId);
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 1) drag = { x: ev.clientX, y: ev.clientY, moved: false, pinch: null };
      else if (ptrs.size === 2 && drag) { const [a, b] = [...ptrs.values()]; drag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), rho: CAM.g ? CAM.g.rho : CAM.rho, z: CAM.ojo ? CAM.ojo.z : 1 }; drag.moved = true; }
    });
    canvas.addEventListener('pointermove', ev => { ultimoToque = clock();
      const pt = ptrs.get(ev.pointerId);
      if (!pt) {
        if (ev.pointerType === 'mouse') {
          const h = pick(ev); S.hover = h.card || null; S.hoverP = h.p !== undefined ? h.p : null;
          canvas.style.cursor = h.muestra ? 'zoom-in' : (h.card && S.playable.has(h.card)) || (S.hoverP !== null && canReplay(S.hoverP)) ? 'pointer' : 'grab';
          // cursor sobre la muestra: acercarse; al salir, volver (con un respiro para que no tiemble)
          clearTimeout(S.mzT);
          if (h.muestra && !S.mz) S.mzT = setTimeout(() => muestraZoom(true), 180);
          else if (!h.muestra && S.mz && !S.mz.sticky) S.mzT = setTimeout(() => muestraZoom(false), 250);
        }
        return;
      }
      const dx = ev.clientX - pt.x, dy = ev.clientY - pt.y;
      pt.x = ev.clientX; pt.y = ev.clientY;
      if (!drag) return;
      if (drag.pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        startUserCam();
        if (enOjos()) { CAM.ojo.z = drag.pinch.z * drag.pinch.d / Math.max(20, d); limitarOjo(CAM.ojo); CAM.g = ojosCam(CAM.ojo); }
        else { CAM.g.rho = clamp(drag.pinch.rho * drag.pinch.d / Math.max(20, d), 7, 34); limitarCam(CAM.g); }
        return;
      }
      if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 6) { drag.moved = true; canvas.style.cursor = 'grabbing'; }
      if (drag.moved) {
        startUserCam();
        // con los ojos: la mesa sigue al dedo (arrastrar a la derecha es girar la cabeza a la izquierda)
        if (enOjos()) { CAM.ojo.yaw += dx * .0045; CAM.ojo.pitch -= dy * .003; limitarOjo(CAM.ojo); CAM.g = ojosCam(CAM.ojo); }
        else { CAM.g.phi -= dx * (mirando() ? .0065 : .0032); CAM.g.beta = clamp(CAM.g.beta + dy * (mirando() ? .005 : .0028), .2, 1.5); limitarCam(CAM.g); }
        if (hintEl) hintEl.classList.add('gone');
      }
    });
    const up = ev => {
      const had = ptrs.delete(ev.pointerId);
      if (!had || !drag) return;
      if (!drag.moved && ptrs.size === 0) {
        const h = pick(ev);
        if (S.mz && S.mz.sticky) muestraZoom(false);   // tocando de nuevo, se vuelve
        else if (h.muestra && ev.pointerType !== 'mouse') { muestraZoom(true); if (S.mz) S.mz.sticky = true; }
        else if (h.card && S.playable.has(h.card)) { const c = G.round.hands[ME].find(x => x.id === h.card); if (c) { S.hover = null; human({ type: 'play', card: c }); } }
        else if (h.p !== undefined) replaySenas(h.p);
      }
      if (ptrs.size === 0) { drag = null; canvas.style.cursor = 'grab'; }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse' && !ptrs.size) { S.hover = null; clearTimeout(S.mzT); if (S.mz && !S.mz.sticky) muestraZoom(false); } });
    canvas.addEventListener('wheel', ev => {
      ultimoToque = clock(); ev.preventDefault(); startUserCam();
      if (enOjos()) { CAM.ojo.z *= Math.exp(ev.deltaY * .0011); limitarOjo(CAM.ojo); CAM.g = ojosCam(CAM.ojo); }
      else { CAM.g.rho = clamp(CAM.g.rho * Math.exp(ev.deltaY * .0011), 7, 34); limitarCam(CAM.g); }
    }, { passive: false });
    canvas.addEventListener('dblclick', () => setView('mine'));
    document.addEventListener('keydown', ev => {
      if (!running || document.querySelector('.overlay') || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
      if (ev.key === 'm' || ev.key === 'M') { if (S.mz) muestraZoom(false); else { muestraZoom(true); if (S.mz) S.mz.sticky = true; } return; }
      const i = '123'.indexOf(ev.key);
      if (i >= 0) { const c = G.round && G.round.hands[ME][i]; if (c && S.playable.has(c.id)) human({ type: 'play', card: c }); }
    });
    setTimeout(() => hintEl && hintEl.classList.add('gone'), 12000);
    $('cam3dMine').onclick = () => setView('mine');
    $('cam3dTop').onclick = () => setView('top');
  }
  function startUserCam(){ if (S.mz) { S.mz = null; muLbl.classList.remove('on'); } if (!CAM.ojo) CAM.ojo = ojo0(); if (!CAM.g) CAM.g = defaultCam(); CAM.user = true; CAM.k = 9; }

  // ---------- cuadro con la cara del que hace señas ----------
  function renderPip(){
    const j = S.job, c = j && Lay.chars[j.p];
    if (!c) { pipEl.hidden = true; return; }
    const W = stage.clientWidth, H = stage.clientHeight;
    const size = Math.round(clamp(Math.min(W, H) * .3, 118, 210)), x = W - size - 12, y = 12;
    const hp = c.head.getWorldPosition(v3(0, 0, 0));
    const fwd = v3(0, 0, 1).applyQuaternion(c.head.getWorldQuaternion(tmpQ));
    const want = hp.clone().addScaledVector(fwd, 5.4).add(v3(0, .35, 0));
    if (!j.camOk) { pipCam.position.copy(want); j.camOk = true; } else pipCam.position.lerp(want, .25);
    pipCam.lookAt(hp.x, hp.y - .05, hp.z);
    pipCam.aspect = 1; pipCam.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setScissor(x, H - y - size, size, size); renderer.setViewport(x, H - y - size, size, size);
    renderer.render(scene, pipCam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    pipEl.hidden = false;
    pipEl.style.left = x + 'px'; pipEl.style.top = y + 'px'; pipEl.style.width = size + 'px';
    pipEl.querySelector('.frame').style.height = size + 'px';
  }

  // ---------- etiquetas sobre la escena ----------
  function toScreen(p, W, H){ tmpV.copy(p).project(camera); return { x: (tmpV.x + 1)/2*W, y: (1 - tmpV.y)/2*H, vis: tmpV.z < 1 && Math.abs(tmpV.x) < 1.3 && Math.abs(tmpV.y) < 1.3 }; }
  function placeLabels(){
    const W = stage.clientWidth, H = stage.clientHeight;
    Lay.chars.forEach(c => {
      if (!c) return;
      const top = c.pivot.localToWorld(tmpW.set(0, 2.35, 0));
      const s = toScreen(top, W, H), lh = c.lbl.offsetHeight || 40;
      c.lbl.style.display = s.vis ? '' : 'none';
      // no entra arriba de la cabeza: al costado, del lado del centro de la pantalla. Con un margen para
      // pasar de un modo al otro, así una etiqueta que crece un poco (señas, "juega") no salta de lugar
      c.lblSide = c.lblSide ? s.y - lh < 30 : s.y - lh < 6;
      if (c.lblSide) {
        const mid = toScreen(c.pivot.localToWorld(tmpW.set(0, .98, 0)), W, H), r = Math.abs(toScreen(c.pivot.localToWorld(tmpW.set(1.25, .98, 0)), W, H).x - mid.x);
        const left = mid.x > W/2 - 40;
        // el nombre queda a la altura de la cabeza y lo que se agrega (señas, marcas) crece para abajo
        c.lbl.style.transform = `translate(${Math.round(mid.x + (left ? -r - 10 : r + 10))}px, ${Math.round(clamp(mid.y - 12, 6, H - lh - 4))}px) translate(${left ? '-100%' : '0'}, 0)`;
        c.lbl.classList.toggle('side', true); c.lbl.classList.toggle('sideL', left);
      } else {
        c.lbl.style.transform = `translate(${Math.round(clamp(s.x, 60, W - 60))}px, ${Math.round(clamp(s.y, 4, H - 30))}px) translate(-50%, -100%)`;
        c.lbl.classList.toggle('side', false);
      }
    });
    const L = handLayout(), topY = (L.baseY + L.ch*.5) / (L.h/2);
    myBub.style.bottom = Math.round((1 + topY)/2*H + 10) + 'px';
    // el cartel va debajo de la muestra, o arriba si abajo lo taparían tus cartas
    const mp = muePose(true).pos, m = toScreen(v3(mp.x, 0, mp.z + CH*.5 + .15), W, H);
    const handTop = (1 - topY)/2*H, low = m.y + 16 > handTop - 6;
    const m2 = low ? toScreen(v3(mp.x, 0, mp.z - CH*.5 - .15), W, H) : m;
    muLbl.style.display = m2.vis ? '' : 'none';
    muLbl.style.transform = `translate(${Math.round(m2.x)}px, ${Math.round(m2.y)}px) translate(-50%, ${low ? '-100%' : '0'})`;
  }

  // ---------- bucle ----------
  // ¿se está moviendo algo que pida dibujar a 60 cuadros? (cartas en viaje, cámara, el dedo o el mouse)
  let ultimoCuadro = 0, ultimoToque = 0, ultimaSombra = 0;
  const DPR = { ahora: 1, suma: 0, n: 0 };
  function animando(t){
    for (const id in CARDS) if (CARDS[id].tws.length) return true;
    if (drag || ptrs.size || t - ultimoToque < 1.2 || S.jobs.length || S.job) return true;
    if (CAM.g) for (const k of ['phi', 'beta', 'rho', 'tx', 'ty', 'tz']) if (Math.abs(CAM.g[k] - CAM[k]) > 1e-3) return true;
    return false;
  }
  function frame(){
    rafId = requestAnimationFrame(frame);
    const t = clock();
    if (!Lay || !G || !G.round) { last = t; return; }
    // quieta (solo las caras que miran y parpadean), a 30 cuadros por segundo: la mitad de trabajo
    if (t - ultimoCuadro < 1 / 31 && !animando(t)) return;
    ultimoCuadro = t;
    const crudo = t - last, dt = Math.min(.05, crudo || .016); last = t; now = t;
    updateCamera(dt);
    if (NET) avisarMirada(miradaPropia());
    camera.updateMatrixWorld(true);
    runJobs();
    for (const id in CARDS) stepCard(CARDS[id], t, dt);
    updateChars(t, dt);
    const n = deckCount(), dp = Lay.deck.position, kf = Math.min(1, dt*4);
    Lay.deck.scale.y = Math.max(.02, n/40); dp.y = .24*Lay.deck.scale.y + MUE_Y;
    dp.x += (Lay.deckPos.x - dp.x)*kf; dp.z += (Lay.deckPos.z - dp.z)*kf;
    const yw = deckYaw(Lay.deckPos); let dy = yw - Lay.deck.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    Lay.deck.rotation.y += dy*kf;
    const a = G.phase === 'play' ? lastAct : null;
    if (a !== null && a !== undefined) {
      const rc = rowCenter(a), d = rowDir(a);
      Lay.glow.position.set(rc.x, .012, rc.z); Lay.glow.rotation.z = d.z ? PI/2 : 0;
      Lay.glow.material.opacity += ((.55 + .25*Math.sin(t*4)) - Lay.glow.material.opacity) * Math.min(1, dt*6);
    } else Lay.glow.material.opacity *= .9;
    if (lamparaMesa) lamparaMesa.visible = CAM.vista !== 'top';
    const ck = Array.from({ length: G.n }, (_, p) => miraAtras(p) ? 1 : 0).join('');
    if (ck !== S.atras) { const antes = S.atras; S.atras = ck; if (antes !== undefined) update(lastAct, myLegal); }
    let mov = false; for (const id in CARDS) if (CARDS[id].tws.length) { mov = true; break; }
    if (mov || t - ultimaSombra > .1) { renderer.shadowMap.needsUpdate = true; ultimaSombra = t; }
    // si la compu no llega a dibujar fluido (menos de 42 cuadros por segundo mientras algo se mueve), baja la resolución
    if (mov || drag) {
      DPR.suma += crudo; DPR.n++;
      if (DPR.n >= 90) {
        if (DPR.suma / DPR.n > 1/42 && DPR.ahora > 1) { DPR.ahora = Math.max(1, DPR.ahora - .25); renderer.setPixelRatio(DPR.ahora); resize(); }
        DPR.suma = DPR.n = 0;
      }
    }
    renderer.render(scene, camera);
    renderPip();
    placeLabels();
  }
  function resume(){ if (!running) { running = true; last = clock(); now = last; rafId = requestAnimationFrame(frame); } }
  function pause(){ if (running) { running = false; cancelAnimationFrame(rafId); } }

  // ---------- retratos para elegir personaje ----------
  // Cada personaje se arma igual que en la mesa y se le saca una foto de la cabeza y los hombros, con un
  // renderizador chico aparte (la mesa puede estar pausada o sin abrir). Las fotos quedan guardadas.
  let rt = null; const RET = {};
  function retrato(id){
    if (RET[id]) return RET[id];
    const P = PERSONAJES.find(x => x.id === id);
    if (!P || !init()) return null;
    if (!rt) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 220;
      let r; try { r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return null; }
      r.setPixelRatio(1); r.setSize(220, 220, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffe8c8, 0x2b1a10, 1.25));
      const d = new THREE.DirectionalLight(0xfff1dc, 1.7); d.position.set(3, 9, 10); sc.add(d);
      const b = new THREE.DirectionalLight(0x9fb9ff, .5); b.position.set(-6, 6, -8); sc.add(b);
      const cam = new THREE.PerspectiveCamera(21, 1, .1, 60); cam.position.set(0, 4.55, 10); cam.lookAt(0, 3.75, 0);
      rt = { r, sc, cam, cv };
    }
    const c = makeChar(ME, null, P.look);
    c.g.rotation.y = -.28;  // apenas de costado, como se lo ve desde la mesa
    rt.sc.add(c.g); rt.r.render(rt.sc, rt.cam);
    const url = rt.cv.toDataURL('image/png');
    rt.sc.remove(c.g);
    const comunes = new Set(Object.values(GEO));
    c.g.traverse(o => { if (o.isMesh) { if (!comunes.has(o.geometry)) o.geometry.dispose(); o.material.dispose(); } });
    return RET[id] = url;
  }

  return {
    available: () => init(),
    retrato,
    update, pause,
    // un gesto, un sonido o un dicho del frasero (extras.part.js): la burbuja y el movimiento del personaje
    gesto(p, text, k, ms){
      if (!Lay || !G) return;
      showBubble(p, Lay.chars[p] ? text.split(' ')[0] : text, ms);   // al personaje se lo ve haciendo el gesto: alcanza con el dibujito
      const c = charDe(p);
      if (c && GA[k]) { c.ag = { k, t0: clock(), d: GA[k].d }; c.react = null; c.talkTo = 0; }
      return GA[k] && GA[k].cartas ? GA[k].cartas : 0;   // si deja las cartas en la mesa, cuándo las vuelve a agarrar
    },
    debug: () => ({ CARDS, S, CAM, Lay, camera, setView, renderer, mirarA: (y, p) => { CAM.ojo.yaw = y; CAM.ojo.pitch = p; limitarOjo(CAM.ojo); CAM.g = ojosCam(CAM.ojo); }, queue: (p, l, k) => { queueSenas(p, l, k || 'partner'); S.jobs[S.jobs.length-1].notBefore = now; } }),
  };
}

// V3: la mesa 3D, que se carga cuando hace falta. Three.js (three.min.js, 573 KB) y todo lo 3D (personajes, el bar)
// se bajan recién al entrar a la mesa 3D (o en un momento libre después de abrir el juego, si la vista es 3D), así
// la pantalla de inicio y la mesa 2D abren antes. Mientras carga, V3.update deja la mesa vacía y redibuja al terminar.
const V3 = (() => {
  let real = null, cargando = null;
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  function cargar(){
    if (real) return Promise.resolve(real);
    if (cargando) return cargando;
    cargando = new Promise(listo => {
      if (typeof THREE !== 'undefined') { real = crearV3(); listo(real); return; }
      const sc = document.createElement('script'); sc.src = 'three.min.js'; sc.async = true;
      sc.onload = () => { try { real = crearV3(); } catch (e) { real = null; } listo(real); };
      sc.onerror = () => { cargando = null; listo(null); };   // sin internet y sin copia: se juega en 2D
      document.head.appendChild(sc);
    });
    return cargando;
  }
  const despues = () => cargar().then(r => { if (r && typeof render === 'function' && typeof G !== 'undefined' && G) render(); });
  return {
    available: () => webgl && (!real || real.available()),
    get listo(){ return !!real; },
    cargar,
    update(act, legal){ if (real) return real.update(act, legal); despues(); },
    pause(){ if (real) real.pause(); },
    retrato(id){ if (real) return real.retrato(id); cargar(); return null; },
    gesto(p, text, k, ms){ return real ? real.gesto(p, text, k, ms) : 0; },
    debug(){ return real ? real.debug() : null; },
  };
})();
