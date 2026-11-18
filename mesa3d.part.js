// ---------- Mesa 3D (Three.js) ----------
// La cámara gira alrededor de la mesa (arrastrar, rueda o pellizco). Los jugadores de la
// computadora tienen cara y hacen con ella las señas del Art. 102; las cartas se reparten,
// se juegan y se juntan con movimiento. Tus cartas van abajo, pegadas a la cámara.
// La vista sigue al estado del juego: cada vez que se llama a render() se calcula dónde
// tiene que estar cada carta y las que cambiaron de lugar viajan hasta ahí.
// Si el navegador no tiene WebGL, se juega con la mesa 2D.
const V3 = (function(){
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
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x140e0a);
    scene.fog = new THREE.Fog(0x140e0a, 34, 75);
    camera = new THREE.PerspectiveCamera(50, 1, .1, 200); camera.layers.enable(1); scene.add(camera);
    handGroup = new THREE.Group(); camera.add(handGroup);
    pipCam = new THREE.PerspectiveCamera(26, 1, .1, 80);
    ray = new THREE.Raycaster(); ray.layers.enableAll();

    scene.add(new THREE.HemisphereLight(0xffe8c8, 0x2b1a10, 1.15));
    const spot = new THREE.SpotLight(0xffdcae, 3.4, 0, .66, .6, 0);
    spot.position.set(0, 17, 1.5); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
    spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.camera.near = 6; spot.shadow.camera.far = 32; spot.shadow.bias = -.0004; spot.shadow.normalBias = .02;
    const front = new THREE.DirectionalLight(0xfff1dc, .7); front.position.set(2, 9, 18); scene.add(front);
    const rim = new THREE.DirectionalLight(0x9fb9ff, .35); rim.position.set(-6, 8, -18); scene.add(rim);

    const floor = mesh(new THREE.PlaneGeometry(160, 160), std(0x6b4a33, .92, { map: floorTex() }));
    floor.rotation.x = -PI/2; floor.position.y = -7.5; floor.castShadow = false; scene.add(floor);

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
    GEO.arm = new THREE.CapsuleGeometry(.36, 1.7, 6, 14);
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
    camera.fov = camera.aspect < 1 ? Math.min(74, 2 * Math.atan(Math.tan(25 * PI/180) / Math.pow(camera.aspect, .8)) * 180/PI) : 50;
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
    front.castShadow = back.castShadow = true;
    g.add(outline, front, back, badge);
    g.visible = false; scene.add(g);
    front.userData.cardId = id;
    return { id, g, front, back, outline, badge, key: 'd', slot: null, tws: [], where: 'deck', face: false, onTop: false };
  }
  function setFace(o, show){ o.face = show; o.front.material.map = show && !o.hidden ? faceTex(o.id) : TEX.back; }
  function setOnTop(o, on, order){
    if (o.onTop !== on) {
      o.onTop = on;
      [o.front, o.back, o.outline, o.badge].forEach(m => { m.material.depthTest = !on; m.material.depthWrite = !on; m.layers.set(on ? 1 : 0); m.castShadow = !on && m !== o.outline && m !== o.badge; });
    }
    const r = on ? (order || 0) : 0;
    o.outline.renderOrder = r; o.front.renderOrder = r + 1; o.back.renderOrder = r + 1; o.badge.renderOrder = r + 2;
  }

  // ---------- disposición de la mesa ----------
  // rr: radio de la fila de cartas jugadas del que está enfrente o de vos; rrS: de los de los costados.
  // En mano a mano las bazas quedan en columnas (la compu arriba, vos abajo).
  // dk: dónde va el mazo, a la derecha del que dio: [distancia al centro, corrimiento hacia su derecha].
  // Están calculados para que el mazo no pise ninguna fila ni las cartas boca abajo, dé quien dé.
  // dk0: lo mismo cuando das vos, elegido además para que tu mano no tape la muestra.
  const PARAMS = {
    2: { TR: 4.8, rr: .9, rrS: .9, hs: .22, opp: .22, sp: 1.3, inact: 2.4, dk: [1.5, 2.6], dk0: [0.6, 3.2],
         cam: { beta: .8, rho: 14.2, tx: .35, ty: 2.0, tz: -1.9 } },
    4: { TR: 5.8, rr: 2.15, rrS: 2.65, hs: .25, opp: 0, sp: 1.18, inact: 1.65, dk: [3.3, 3.0], dk0: [3.6, 2.6],
         cam: { beta: .84, rho: 18.6, tx: 0, ty: 1.7, tz: -1.7 } },
    6: { TR: 6.4, rr: 2.6, rrS: 3.1, hs: .25, opp: 0, sp: .8, inact: 1.45, dk: [4.7, 2.1], dk0: [4.1, 2.6],
         cam: { beta: .86, rho: 20.5, tx: 0, ty: 1.8, tz: -1.9 } },
  };
  const ang = p => -PI/2 + ((p - ME + Lay.n) % Lay.n) * 2*PI / Lay.n; // vos abajo, y sigue hacia la derecha
  const onCircle = (a, r, y) => v3(Math.cos(a)*r, y || 0, -Math.sin(a)*r);
  function rowDir(p){ const a = ang(p); return (Lay.n === 4 && Math.abs(Math.cos(a)) > .5) ? v3(0, 0, 1) : v3(1, 0, 0); }
  function humanSeat(){ return v3(0, 4.3, Lay.TR + 2.2); }

  function build(){
    if (Lay) { scene.remove(Lay.root); lbls.innerHTML = ''; }
    const n = G.n, P = PARAMS[n], root = new THREE.Group();
    scene.add(root);
    Lay = Object.assign({ n, root, names: G.names.join('|') + '#' + ME, chars: [] }, P);
    buildTable(root, P.TR);
    for (let p = 0; p < n; p++) {
      if (p === ME) { Lay.chars.push(null); continue; }
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
    Lay.deck = mesh(new THREE.BoxGeometry(CW*.98, .48, CH*.98), [edge, edge, new THREE.MeshStandardMaterial({ map: TEX.back, roughness: .55 }), edge, edge, edge]);
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

  function makeChar(p, name){
    const lk = LOOKS[name] || SEAT_LOOKS[p] || LOOKS.Tito;
    const shirt = SHIRTS[team(p) === team(ME) ? 0 : 1][Math.floor(p/2) % 3]; // tu equipo de celeste
    const M = {
      skin: std(lk.skin, .72), skin2: std(new THREE.Color(lk.skin).multiplyScalar(.9), .7), shirt: std(shirt, .9),
      hair: std(lk.hc, .95), brow: std(lk.brow || lk.hc, .9), pants: std(0x2d2b36, .9), wood: std(0x4a2b17, .65),
      lip: std(0xa4433e, .55), tongue: std(0xd8606a, .45), white: std(0xfbfaf4, .35), dark: std(0x17110e, .4), inner: std(0x3a1313, .9), tooth: std(0xfffdf5, .3),
    };
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    // silla
    g.add(mesh(GEO.box, M.wood, 0, -3.6, -.4, 2.8, .3, 2.6));
    g.add(mesh(GEO.box, M.wood, 0, -1.4, -1.85, 2.8, 4.1, .28));
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.5, .7]) g.add(mesh(GEO.box, M.wood, sx, -5.6, sz, .24, 3.8, .24));
    // cuerpo
    body.add(mesh(GEO.box, M.pants, 0, -3.0, .7, 2.2, .95, 2.8));
    const torso = mesh(GEO.torso, M.shirt, 0, .25, -.2, 1.2, 1, .8); body.add(torso);
    body.add(mesh(GEO.neck, M.skin, 0, 3.05, -.12));
    const hands = [];
    for (const sx of [1, -1]) {
      const a = v3(sx*1.35, 2.15, -.2), b = v3(sx*.58, 1.38, 1.28);
      const arm = mesh(GEO.arm, M.shirt); arm.position.copy(a).add(b).multiplyScalar(.5);
      arm.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); body.add(arm);
      const hnd = mesh(GEO.sph, M.skin, b.x, b.y, b.z, .34, .3, .36); body.add(hnd); hands.push(hnd);
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
      for (const sx of [1, -1]) { const m = mesh(GEO.must, M.hair, sx*.13, 0, 0); m.rotation.z = PI/2 + sx*.35; m.castShadow = false; mu.add(m); }
    }
    hair(head, lk, M);
    const c = { p, g, body, pivot, head, skull, eyes, brows, nose, mouth, lipU, lipL, inner, teeth, ring, tongue, hands,
      F: Object.assign({}, NEUTRAL), yaw: 0, pitch: 0, blinkAt: clock() + 1 + Math.random()*3, blinkTo: 0,
      talkTo: 0, react: null, lookTo: null, lookUntil: 0, gest: null, phase: Math.random()*6 };
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

  function updateChars(t, dt){
    if (!Lay) return;
    const R = G.round;
    Lay.chars.forEach(c => {
      if (!c) return;
      // cara: seña en curso o reacción
      const tgt = Object.assign({}, NEUTRAL);
      if (c.gest && c.gest.k) { const gk = GEST[c.gest.k]; for (const k in gk) tgt[k] = NEUTRAL[k] + (gk[k] - NEUTRAL[k]) * c.gest.env; }
      if (c.react && c.react.face) { const rk = c.react.face, e = Math.sin(PI*clamp((t - c.react.t0)/c.react.d, 0, 1)); for (const k in rk) tgt[k] += (rk[k] - NEUTRAL[k]) * e; }
      for (const k in tgt) c.F[k] += (tgt[k] - c.F[k]) * Math.min(1, dt*18);
      if (!c.gest && t > c.blinkAt) { c.blinkTo = t + .13; c.blinkAt = t + 2.5 + Math.random()*4; }
      applyFace(c, t);
      // mirada
      let look;
      if (c.gest) look = c.gest.look;
      else if (c.lookUntil > t && c.lookTo) look = c.lookTo;
      else if (R && G.phase === 'play' && lastAct === c.p) look = c.g.localToWorld(tmpW.set(0, 1.4, 1.5)).clone();
      else look = v3(Math.sin(t*.31 + c.phase)*1.6, 0, Math.cos(t*.23 + c.phase)*1.2);
      c.g.worldToLocal(tmpV.copy(look));
      const dx = tmpV.x, dy = tmpV.y - 4.2, dz = tmpV.z + .08;
      let yaw = clamp(Math.atan2(dx, dz), -1.15, 1.15), pitch = clamp(Math.atan2(-dy, Math.hypot(dx, dz)), -.35, .6);
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
      c.pivot.rotation.set(c.pitch + rx, c.yaw + ry, 0);
      c.body.position.z = bz;
      c.body.scale.y = 1 + .008*Math.sin(t*1.7 + c.phase);
      c.body.rotation.z = .012*Math.sin(t*.7 + c.phase);
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
  function rowRad(p){ return p === ME ? Lay.rr - Lay.hs : Math.abs(Math.cos(ang(p))) < .3 ? Lay.rr + Lay.opp : Lay.rrS; }
  function rowCenter(p){ return onCircle(ang(p), rowRad(p)); }
  function tablePose(p, b, id){
    const c = rowCenter(p), d = rowDir(p), sp = d.z ? 1.25 : Lay.sp;
    return flat(c.x + d.x*(b-1)*sp + hashJ(id, 'x')*.06, .02 + b*.007, c.z + d.z*(b-1)*sp + hashJ(id, 'z')*.08, true, hashJ(id, 'r')*.14);
  }
  function downPose(p, i, k, up, id){
    const c = onCircle(ang(p), rowRad(p) + Lay.inact), d = i - (k-1)/2;
    return flat(c.x + d*.45, .02 + i*.007, c.z, up, hashJ(id, 'r')*.12 + d*.12);
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
  function deckTop(){ const d = Lay.deck.position; return flat(d.x, deckH() + .01, d.z, false, Lay.deck.rotation.y); }
  function muePose(up){
    const d = Lay.deck.position, y = Lay.deck.rotation.y, k = CH*.78;
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
    const pos = v3(d*L.sp, L.baseY - Math.abs(d)*.03*L.ch + lift*L.ch - (S.myOut ? .4*L.ch : 0), -L.D + i*.004);
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
        if (p === ME) { out[c.id] = { key: 'hand', hand: true, face: true }; return; }
        if (ended) { const up = !!R.mustShow[p] && !c.hidden; out[c.id] = { key: `r:${p}:${i}:${k}:${up}`, pose: downPose(p, i, k, up, c.id), face: up, p }; return; }
        if (!R.active[p] || R.out[p]) { out[c.id] = { key: `x:${p}:${i}:${k}`, pose: downPose(p, i, k, false, c.id), face: false, p }; return; }
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
        if (tw.slot.table && tw.slot.p !== ME) S.cnt[tw.fromPose ? 'desdeMano' : 'desdeMazo']++; // carta jugada por otro: sale de su mano
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
    if (!Lay || Lay.n !== G.n || Lay.names !== G.names.join('|') + '#' + ME) { build(); fresh = true; }
    if (S.mid !== G.id) {   // empezó otro partido (G es una copia nueva en cada dibujo: se compara la marca)
      S.mid = G.id; S.roundNo = null; S.jobs = []; S.job = null; S.said = {}; S.cnt.partido++;
      CAM.user = false; const d = defaultCam();
      Object.assign(CAM, { phi: -.9, beta: 1.0, rho: d.rho*1.9, tx: d.tx, ty: d.ty, tz: d.tz }); CAM.g = d; CAM.k = 1.6;
      fresh = true;
    }
    if (customDeck !== S.deckSig) { S.deckSig = customDeck; for (const id in CARDS) if (CARDS[id].face) setFace(CARDS[id], true); }
    resume();
    camera.updateMatrixWorld(true);
    if (Lay.dealer !== G.dealer || fresh) { Lay.dealer = G.dealer; Lay.deckPos = deckSpot(G.dealer); if (fresh) { Lay.deck.position.set(Lay.deckPos.x, Lay.deck.position.y, Lay.deckPos.z); Lay.deck.rotation.y = deckYaw(Lay.deckPos); } }
    S.playable = new Set(myLegal.filter(a => a.type === 'play').map(a => a.card.id));
    S.myTurn = act === ME && G.phase === 'play';
    S.myOut = !R.active[ME] || R.out[ME];

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
    if (dealT0 !== null) { S.dealEnd = now + dealT0 + (3*G.n + 2)*dt + .45*AS(); S.cnt.reparto++; }
    else if (snap) { S.dealEnd = now; S.cnt.ubicar++; }
    S.rk = rk;

    // bazas ganadas: borde dorado (o gris si fue parda)
    for (const id in CARDS) { const o = CARDS[id]; if (o.where !== 'hand' && !(o.slot && o.slot.hand)) o.outline.visible = false; }
    R.tricks.forEach(t => {
      const best = Math.max(...t.cards.filter(c => c && !c.hidden).map(c => T.rank(c, R.muestra)));
      t.cards.forEach((c, p) => {
        if (!c) return; const o = CARDS[c.id];
        if (!o) return;
        if (t.winnerTeam === -1 && !c.hidden && T.rank(c, R.muestra) === best) { o.outline.visible = true; o.outline.material.color.setHex(0xb9c2c2); }
        else if (t.winnerPlayer === p) { o.outline.visible = true; o.outline.material.color.setHex(0xe8b13a); }
      });
    });
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

  function showBubble(p, text){
    S.cnt.dichos++;
    const el2 = p === ME ? myBub : Lay.chars[p] && Lay.chars[p].bub;
    if (!el2) return;
    el2.textContent = text; el2.classList.remove('on'); void el2.offsetWidth; el2.classList.add('on');
    clearTimeout(el2._t); el2._t = setTimeout(() => el2.classList.remove('on'), 2200);
    // quien habla mueve la boca y reacciona; los demás lo miran
    const speaker = p === ME ? humanSeat() : charHead(p);
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
      const p = c.p, tags = [], partner = G.n >= 4 && team(p) === team(ME);
      if (R.mano === p) tags.push('<span class="tag mano">mano</span>');
      if (G.dealer === p) tags.push('<span class="tag">da</span>');
      if (R.flor.sung[p]) tags.push('<span class="tag flor">flor</span>');
      if (act === p && G.phase === 'play') tags.push('<span class="tag turn">juega</span>');
      if (R.out[p]) tags.push('<span class="tag out">pasó</span>');
      let sen = '';
      if (partner && R.senasShown[p] && G.rules.senas && !R.leyPhase && !R.duel && !R.hands[ME].some(c => c.hidden)) sen += senaGroups(R.senasShown[p]).map(([k, n]) => `<span class="sena">${senaTxt(k, n)}</span>`).join('');
      if (!R.leyPhase) senaGroups((R.seen[ME] || []).filter(v => v.p === p).map(v => v.s)).forEach(([k, n]) => { sen += `<span class="sena caught">👀 ${senaTxt(k, n)}</span>`; });
      const html = `<div class="nm">${esc(G.names[p])}${G.n >= 4 ? `<small>${partner ? 'compañero' : 'rival'}</small>` : ''}</div>`
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
  function defaultCam(){
    const c = (Lay || { cam: PARAMS[2].cam }).cam, a = camera.aspect || 1.6;
    const wide = a < 1.25 ? Math.pow(1.25 / a, .5) : 1;
    return { phi: 0, beta: c.beta, rho: c.rho * wide, tx: c.tx * (a < 1 ? 0 : 1), ty: c.ty, tz: c.tz };
  }
  function topCam(){ const d = defaultCam(); return { phi: 0, beta: 1.45, rho: d.rho * 1.05, tx: d.tx, ty: 0, tz: 1.2 }; }
  function updateCamera(dt){
    if (CAM.g) {
      const f = Math.min(1, dt*CAM.k);
      for (const k of ['phi', 'beta', 'rho', 'tx', 'ty', 'tz']) CAM[k] += (CAM.g[k] - CAM[k]) * f;
    }
    const cb = Math.cos(CAM.beta);
    camera.position.set(CAM.tx + CAM.rho*Math.sin(CAM.phi)*cb, CAM.ty + CAM.rho*Math.sin(CAM.beta), CAM.tz + CAM.rho*Math.cos(CAM.phi)*cb);
    camera.lookAt(CAM.tx, CAM.ty, CAM.tz);
  }
  function setView(v){ CAM.user = v !== 'mine'; CAM.g = v === 'top' ? topCam() : defaultCam(); CAM.k = 3; }

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
    return {};
  }
  function canReplay(p){ const c = Lay && Lay.chars[p]; return c && c.lblHTML.includes('class="sena'); }
  function events(){
    canvas.addEventListener('pointerdown', ev => {
      canvas.setPointerCapture(ev.pointerId);
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 1) drag = { x: ev.clientX, y: ev.clientY, moved: false, pinch: null };
      else if (ptrs.size === 2 && drag) { const [a, b] = [...ptrs.values()]; drag.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), rho: CAM.g ? CAM.g.rho : CAM.rho }; drag.moved = true; }
    });
    canvas.addEventListener('pointermove', ev => {
      const pt = ptrs.get(ev.pointerId);
      if (!pt) {
        if (ev.pointerType === 'mouse') { const h = pick(ev); S.hover = h.card || null; S.hoverP = h.p !== undefined ? h.p : null; canvas.style.cursor = (h.card && S.playable.has(h.card)) || (S.hoverP !== null && canReplay(S.hoverP)) ? 'pointer' : 'grab'; }
        return;
      }
      const dx = ev.clientX - pt.x, dy = ev.clientY - pt.y;
      pt.x = ev.clientX; pt.y = ev.clientY;
      if (!drag) return;
      if (drag.pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        startUserCam(); CAM.g.rho = clamp(drag.pinch.rho * drag.pinch.d / Math.max(20, d), 7, 34);
        return;
      }
      if (!drag.moved && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 6) { drag.moved = true; canvas.style.cursor = 'grabbing'; }
      if (drag.moved) {
        startUserCam();
        CAM.g.phi -= dx * .0065; CAM.g.beta = clamp(CAM.g.beta + dy * .005, .2, 1.5);
        if (hintEl) hintEl.classList.add('gone');
      }
    });
    const up = ev => {
      const had = ptrs.delete(ev.pointerId);
      if (!had || !drag) return;
      if (!drag.moved && ptrs.size === 0) {
        const h = pick(ev);
        if (h.card && S.playable.has(h.card)) { const c = G.round.hands[ME].find(x => x.id === h.card); if (c) { S.hover = null; human({ type: 'play', card: c }); } }
        else if (h.p !== undefined) replaySenas(h.p);
      }
      if (ptrs.size === 0) { drag = null; canvas.style.cursor = 'grab'; }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse' && !ptrs.size) S.hover = null; });
    canvas.addEventListener('wheel', ev => { ev.preventDefault(); startUserCam(); CAM.g.rho = clamp(CAM.g.rho * Math.exp(ev.deltaY * .0011), 7, 34); }, { passive: false });
    canvas.addEventListener('dblclick', () => setView('mine'));
    document.addEventListener('keydown', ev => {
      if (!running || document.querySelector('.overlay') || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
      const i = '123'.indexOf(ev.key);
      if (i >= 0) { const c = G.round && G.round.hands[ME][i]; if (c && S.playable.has(c.id)) human({ type: 'play', card: c }); }
    });
    setTimeout(() => hintEl && hintEl.classList.add('gone'), 12000);
    $('cam3dMine').onclick = () => setView('mine');
    $('cam3dTop').onclick = () => setView('top');
  }
  function startUserCam(){ if (!CAM.g) CAM.g = defaultCam(); CAM.user = true; CAM.k = 9; }

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
      if (s.y - lh < 6) {
        // no entra arriba de la cabeza: al costado, del lado del centro de la pantalla
        const mid = toScreen(c.pivot.localToWorld(tmpW.set(0, .98, 0)), W, H), r = Math.abs(toScreen(c.pivot.localToWorld(tmpW.set(1.25, .98, 0)), W, H).x - mid.x);
        const left = mid.x > W/2 - 40;
        c.lbl.style.transform = `translate(${Math.round(mid.x + (left ? -r - 10 : r + 10))}px, ${Math.round(clamp(mid.y, lh/2 + 6, H - lh/2))}px) translate(${left ? '-100%' : '0'}, -50%)`;
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
  function frame(){
    rafId = requestAnimationFrame(frame);
    const t = clock(), dt = Math.min(.05, t - last || .016); last = t; now = t;
    if (!Lay || !G || !G.round) return;
    updateCamera(dt);
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
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    renderPip();
    placeLabels();
  }
  function resume(){ if (!running) { running = true; last = clock(); now = last; rafId = requestAnimationFrame(frame); } }
  function pause(){ if (running) { running = false; cancelAnimationFrame(rafId); } }

  return {
    available: () => init(),
    update, pause,
    debug: () => ({ CARDS, S, CAM, Lay, camera, setView, renderer, queue: (p, l, k) => { queueSenas(p, l, k || 'partner'); S.jobs[S.jobs.length-1].notBefore = now; } }),
  };
})();
