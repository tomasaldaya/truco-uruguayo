// Recorte de Three.js con solo lo que usa la mesa 3D (mesa3d.part.js).
// Para regenerar three.min.js (hace falta Node):
//   npm install three esbuild
//   npx esbuild three-entry.js --bundle --minify --format=iife --global-name=THREE --outfile=three.min.js
// Si mesa3d.part.js empieza a usar otra clase de Three.js, agregala acá.
export {
  ACESFilmicToneMapping, BoxGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry,
  DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFShadowMap,
  PerspectiveCamera, PlaneGeometry, Quaternion, Raycaster, RepeatWrapping, SRGBColorSpace, Scene, Shape,
  ShapeGeometry, SphereGeometry, SpotLight, TorusGeometry, Vector2, Vector3, WebGLRenderer, REVISION,
} from 'three';
