// Serum GHK-Cu da Renova Be: frasco e cartucho na MESMA cena.
//
// O vidro, o liquido e a pipeta sao os shaders de refracao do visualizador publicado,
// nao uma aproximacao com MeshPhysical: e o que faz o frasco parecer vidro de verdade.
// Eles precisam de tres retratos da cena por quadro, feitos em ordem (ver frame()).
//
// O que muda em relacao ao publicado:
//   - o cartucho e o novo, 35 x 35 x 140, no lugar da caixa antiga de duas pecas
//   - o rotulo e o novo, 85 x 40: 77,3% da volta (sobra vidro para ver o liquido) e
//     cantos arredondados de 3 mm, recortados pelo alfa da faca
//   - verniz e relevo das DUAS pecas saem das mascaras dos pacotes de impressao:
//     o verniz vira clearcoat, o relevo vira mapa de normais
import * as T from 'three';
import {OrbitControls} from './OrbitControls.js';
import {RGBELoader} from './RGBELoader.js';
import {fundo, luzes, sombraContato} from './estudio.js';

let sujo = true;
const captura = new URLSearchParams(location.search).has('capture');
if (captura) document.body.classList.add('capture');
const palco = document.querySelector('#stage');
const W = () => palco.clientWidth, H = () => palco.clientHeight;

const renderer = new T.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
palco.append(renderer.domElement);
renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1.5), 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1;

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(20, 1, .005, 3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = .16; controls.maxDistance = .9;
controls.minPolarAngle = .35; controls.maxPolarAngle = 1.62;
controls.autoRotateSpeed = .6;

const alvos = [0, 1, 2].map(() => new T.WebGLRenderTarget(1, 1, {type: T.HalfFloatType, samples: 0}));
const resolucao = new T.Vector2();
function redimensiona() {
  const w = W(), h = H();
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.getDrawingBufferSize(resolucao);
  alvos.forEach(t => t.setSize(resolucao.x, resolucao.y));
}
redimensiona();

const env = await new RGBELoader().loadAsync('./studio.hdr');
env.mapping = T.EquirectangularReflectionMapping; scene.environment = env;
fundo(scene);
scene.add(new T.HemisphereLight(0xffffff, 0xaaa5a0, .55));
luzes(scene);

// ---------------------------------------------------------------- vidro, liquido, pipeta
const vertex = `varying vec3 wp;varying vec3 wn;void main(){vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;wn=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
function optico(fonte, ior, parede, absorcao, tipo) {
  return new T.ShaderMaterial({
    uniforms: {source: {value: fonte}, resolution: {value: resolucao}, environment: {value: env},
      ior: {value: ior}, wall: {value: parede}, absorption: {value: new T.Vector3(...absorcao)}, kind: {value: tipo}},
    vertexShader: vertex,
    fragmentShader: `
uniform mat4 projectionMatrix;uniform sampler2D source;uniform sampler2D environment;uniform vec2 resolution;uniform float ior,wall,kind;uniform vec3 absorption;varying vec3 wp,wn;
vec3 environmentAt(vec3 d){vec2 uv=vec2(atan(d.z,d.x)*.159154943+.5,asin(clamp(d.y,-1.,1.))*.318309886+.5);vec3 light=texture2D(environment,uv).rgb;float a=atan(d.z,d.x);float strip=exp(-pow((a-.35)/.12,2.))+ .7*exp(-pow((a-2.65)/.22,2.));return max(vec3(.025),(light-vec3(.18))*.6)+vec3(2.8)*strip;}
void main(){vec3 N=normalize(wn),V=normalize(cameraPosition-wp);float nv=max(dot(N,V),.001);vec3 ray=refract(-V,N,1./ior);float distance=wall/max(nv,.25);
if(kind>0.5){float A=dot(ray.xz,ray.xz);float B=2.*dot(wp.xz,ray.xz);float C=dot(wp.xz,wp.xz)-RAIO*RAIO;distance=max(.001,(-B+sqrt(max(0.,B*B-4.*A*C)))/max(2.*A,.001));float cap=ray.y>0.?TOPO:FUNDO;float dcap=(cap-wp.y)/(abs(ray.y)>.00001?ray.y:.00001);if(dcap>0.)distance=min(distance,dcap);distance=min(distance,.065);}
vec3 endpoint=wp+ray*distance;vec4 projected=projectionMatrix*viewMatrix*vec4(endpoint,1.);vec2 suv=projected.xy/projected.w*.5+.5;vec2 screen=gl_FragCoord.xy/resolution;
suv=mix(screen,suv,kind>.5?.62:1.);vec3 transmitted=texture2D(source,clamp(suv,vec2(.002),vec2(.998))).rgb;
transmitted*=exp(-absorption*distance);float f0=pow((ior-1.)/(ior+1.),2.);float fresnel=f0+(1.-f0)*pow(1.-nv,5.);vec3 reflected=environmentAt(reflect(-V,N));if(kind>.5)reflected*=.75;vec3 color=mix(transmitted,reflected,fresnel);if(kind==0.){float edge=pow(1.-nv,2.5);color*=1.-.32*edge;}if(kind<-.5)color=mix(transmitted,vec3(.06),.18+.6*pow(1.-nv,3.))+reflected*fresnel*.12;
gl_FragColor=vec4(color,1.);#include <tonemapping_fragment>
#include <colorspace_fragment>
}`.replace(';#include', ';\n#include')
  });
}

const ESCALA = .102 / .1196;            // mesma proporcao provisoria do visualizador publicado
const matVidro = optico(alvos[2].texture, 1.5, .0015, [.5, .2, .1], 0);
const matLiquido = optico(alvos[1].texture, 1.333, .025, [78, 17, 6], 1);
const matPipeta = optico(alvos[0].texture, 1.5, .0004, [0, 0, 0], -1);
// o shader do liquido tem o raio e as tampas em coordenadas de mundo: entram ja escalados
matLiquido.fragmentShader = matLiquido.fragmentShader
  .replaceAll('RAIO', String(.0161 * ESCALA))
  .replace('TOPO', String(.0643 * ESCALA))
  .replace('FUNDO', String(.003 * ESCALA));
for (const m of [matVidro, matPipeta]) m.fragmentShader = m.fragmentShader.replaceAll('RAIO', '.0161').replace('TOPO', '.0643').replace('FUNDO', '.003');
for (const m of [matVidro, matLiquido, matPipeta]) m.needsUpdate = true;

const cromo = new T.MeshStandardMaterial({color: 0xe9e9e9, metalness: 1, roughness: .06, envMapIntensity: 1.2});
const branco = new T.MeshStandardMaterial({color: 0xfaf9f8, roughness: .28});

const solidos = [], vidros = [], liquidos = [], rotulos = [], internos = [];
const frasco = new T.Group(); scene.add(frasco);

const bufF = await (await fetch('./serum.glb')).arrayBuffer();
const dvF = new DataView(bufF), jlF = dvF.getUint32(12, true);
const gF = JSON.parse(new TextDecoder().decode(new Uint8Array(bufF, 20, jlF)));
const baseF = 28 + jlF;
function attrF(i) {
  const a = gF.accessors[i], v = gF.bufferViews[a.bufferView];
  const n = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type];
  const C = {5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array}[a.componentType];
  return new T.BufferAttribute(new C(bufF, baseF + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n);
}
for (const m of gF.meshes) {
  if (m.name.startsWith('Impressao')) continue;          // rotulo velho, 110 x 50
  if (m.name.startsWith('Pipeta') || m.name.startsWith('Bolha')) continue;  // refeitos abaixo
  const p = m.primitives[0], geo = new T.BufferGeometry();
  for (const [k, i] of Object.entries(p.attributes)) {
    const alvo = {POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv'}[k];
    if (alvo) geo.setAttribute(alvo, attrF(i));
  }
  geo.setIndex(attrF(p.indices));
  let mat, grupo;
  if (/^(Frasco|Base vidro|Gargalo)/.test(m.name)) { mat = matVidro; grupo = vidros; }
  else if (m.name.startsWith('Liquido')) { mat = matLiquido; grupo = liquidos; }
  else { mat = m.name.startsWith('Aro') ? cromo : branco; grupo = solidos; }
  const o = new T.Mesh(geo, mat); o.name = m.name; frasco.add(o); grupo.push(o);
}

// perfis de referencia do publicado: ombro redondo escorrendo para um gargalo estreito
function torno(pontos) {
  const c = new T.SplineCurve(pontos.map(([r, y]) => new T.Vector2(r, y)));
  return new T.LatheGeometry(c.getPoints(240), 192);
}
vidros.find(o => o.name.startsWith('Frasco')).geometry = torno([[.0001,0],[.014,0],[.0165,.0008],[.0175,.0028],[.0175,.010],[.0175,.060],[.0175,.066],[.0171,.069],[.0159,.0715],[.0136,.074],[.0103,.0765],[.0087,.0785],[.0087,.083],[.0076,.083],[.0076,.0785],[.0093,.0757],[.0125,.073],[.0148,.0708],[.0162,.068],[.0163,.060],[.0163,.010],[.016,.004],[.014,.0026],[.0001,.0026]]);
const bulbo = solidos.find(o => o.name.startsWith('Bulbo'));
bulbo.geometry = torno([[.0001,.097],[.0063,.097],[.00645,.0978],[.0063,.0988],[.0054,.0996],[.00505,.1012],[.0051,.1035],[.00545,.1075],[.00555,.111],[.0053,.1146],[.0045,.1173],[.0031,.119],[.0015,.1197],[.0001,.1198]]);
bulbo.material = new T.MeshPhysicalMaterial({color: 0xfaf9f8, roughness: .62, metalness: 0, sheen: 1, sheenRoughness: .45, sheenColor: new T.Color(0xffffff), clearcoat: .25, clearcoatRoughness: .35});

// pipeta: tubo fino ate o fundo, estrangulamento curto e bolinha na ponta
const perfilPipeta = [[.0001,.0084],[.0008,.0086],[.0012,.0091],[.0013,.0098],[.0011,.0105],[.0008,.0111],[.0009,.0117],[.0016,.0125],[.0023,.0134],[.0024,.0142],[.0024,.087]].map(([r, y]) => new T.Vector2(r, y));
const pipeta = new T.Mesh(new T.LatheGeometry(perfilPipeta, 128), new T.ShaderMaterial({
  uniforms: {source: {value: alvos[0].texture}, resolution: {value: resolucao}, raio: {value: .0024 * ESCALA}},
  vertexShader: vertex,
  fragmentShader: `
uniform mat4 projectionMatrix;uniform sampler2D source;uniform vec2 resolution;uniform float raio;varying vec3 wp,wn;
void main(){vec3 N=normalize(wn),V=normalize(cameraPosition-wp);vec3 Vh=normalize(vec3(V.x,0.,V.z));vec3 lado=normalize(cross(vec3(0.,1.,0.),Vh));
vec3 Nh=normalize(vec3(N.x,0.,N.z)+vec3(1e-5));float x=clamp(dot(Nh,lado),-1.,1.),ax=abs(x),ri=.72;
vec4 pa=projectionMatrix*viewMatrix*vec4(0.,wp.y,0.,1.),pb=projectionMatrix*viewMatrix*vec4(lado*raio+vec3(0.,wp.y,0.),1.);vec2 rad=(pb.xy/pb.w-pa.xy/pa.w)*.5;
float xs=ax<ri?x*.5:sign(x)*(ri*.5+(ax-ri)/(1.-ri)*(1.-ri*.5));
vec2 screen=gl_FragCoord.xy/resolution;vec3 t=texture2D(source,clamp(screen+rad*(xs-x),vec2(.002),vec2(.998))).rgb;
t*=mix(vec3(1.),vec3(.9,.95,.93),step(ri,ax));t*=1.-.6*exp(-pow((ax-ri)/.035,2.));t*=1.-.75*smoothstep(.88,1.,ax);
t+=vec3(.55)*exp(-pow((x-.5)/.06,2.))+vec3(.22)*exp(-pow((x+.8)/.04,2.));
gl_FragColor=vec4(t,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`}));
frasco.add(pipeta); internos.push(pipeta);
for (const [x, y, z, r] of [[-.006, .050, .012, .00045], [.005, .036, .010, .00055]]) {
  const b = new T.Mesh(new T.SphereGeometry(r, 32, 20), optico(alvos[0].texture, 1 / 1.333, .002, [0, 0, 0], -1));
  b.material.fragmentShader = b.material.fragmentShader.replaceAll('RAIO', '.0161').replace('TOPO', '.0643').replace('FUNDO', '.003');
  b.position.set(x, y, z); frasco.add(b); internos.push(b);
}

// ---------------------------------------------------------------- rotulo novo
const ROT = {r: .0175 + .00012, y0: .015, y1: .055, frente: .28};
const VOLTA = 85 / (2 * Math.PI * 17.5);     // 0,773 da volta: o resto fica em vidro nu
function faixaRotulo(raio) {
  const seg = 220, geo = new T.BufferGeometry(), pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = (u - ROT.frente) * VOLTA * Math.PI * 2;
    const x = Math.sin(a), z = Math.cos(a);
    for (const [y, v] of [[ROT.y1, 1], [ROT.y0, 0]]) { pos.push(x * raio, y, z * raio); nor.push(x, 0, z); uv.push(u, v); }
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); return geo;
}
const carregador = new T.TextureLoader();
async function tex(arq, cor, viraY = true) {
  const t = await carregador.loadAsync('./' + arq);
  // as UVs do GLB do cartucho foram escritas para flipY desligado, como o glTF manda
  t.flipY = viraY;
  if (cor) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
  return t;
}
const alfaFaca = await tex('rot-alfa.png', false);
const mapasRot = {};
async function carregaRotulo(lado) {
  if (!mapasRot[lado]) mapasRot[lado] = {
    cor: await tex(`rot-${lado}-cor.png`, true),
    verniz: await tex(`rot-${lado}-verniz.png`, false),
    normal: await tex(`rot-${lado}-normal.png`, false)
  };
  return mapasRot[lado];
}
let rotulo = null;
async function poeRotulo(lado) {
  const m = await carregaRotulo(lado);
  if (!rotulo) {
    rotulo = new T.Mesh(faixaRotulo(ROT.r), new T.MeshPhysicalMaterial({
      map: m.cor, alphaMap: alfaFaca, transparent: true, alphaTest: .35,
      roughness: .86, metalness: 0,
      clearcoat: 1, clearcoatMap: m.verniz, clearcoatRoughness: .03,
      normalMap: m.normal, normalScale: new T.Vector2(1, 1),
      clearcoatNormalMap: m.normal, clearcoatNormalScale: new T.Vector2(1.1, 1.1),
      side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1
    }));
    rotulo.name = 'Rotulo';
    // texto pequeno continua legivel de longe
    rotulo.material.onBeforeCompile = s => {
      s.fragmentShader = s.fragmentShader.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, -.8 )');
    };
    rotulo.material.customProgramCacheKey = () => 'rotulo-renova';
    frasco.add(rotulo); rotulos.push(rotulo);
    rotulo.geometry.scale(ESCALA, ESCALA, ESCALA);
  } else {
    const mt = rotulo.material;
    mt.map = m.cor; mt.clearcoatMap = m.verniz; mt.normalMap = m.normal; mt.clearcoatNormalMap = m.normal;
    mt.needsUpdate = true;
  }
  sujo = true;
}
await poeRotulo('esquerda');

// o frasco inteiro entra na proporcao do publicado
for (const o of [...solidos, ...vidros, ...liquidos, ...internos]) {
  o.geometry.scale(ESCALA, ESCALA, ESCALA);
  o.position.multiplyScalar(ESCALA);
  o.geometry.computeBoundingSphere();
}

// ---------------------------------------------------------------- cartucho novo
const cartucho = new T.Group(); scene.add(cartucho);
const bufC = await (await fetch('./cartucho.glb')).arrayBuffer();
const dvC = new DataView(bufC), jlC = dvC.getUint32(12, true);
const gC = JSON.parse(new TextDecoder().decode(new Uint8Array(bufC, 20, jlC)));
const baseC = 28 + jlC;
function attrC(i) {
  const a = gC.accessors[i], v = gC.bufferViews[a.bufferView];
  const n = {SCALAR: 1, VEC2: 2, VEC3: 3}[a.type];
  const C = {5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array}[a.componentType];
  return new T.BufferAttribute(new C(bufC, baseC + (v.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n);
}
const paineis = ['frente', 'verso', 'topo', 'base', 'direita', 'esquerda'];
const matCartucho = {};
for (const nome of paineis) {
  const cor = await tex(`car-${nome}-cor.png`, true, false);
  let verniz = null, normal = null;
  if (nome !== 'base') { verniz = await tex(`car-${nome}-verniz.png`, false, false); normal = await tex(`car-${nome}-normal.png`, false, false); }
  matCartucho[nome] = new T.MeshPhysicalMaterial({
    map: cor, roughness: .88, metalness: 0,
    clearcoat: verniz ? 1 : 0, clearcoatMap: verniz, clearcoatRoughness: .035,
    normalMap: normal, normalScale: new T.Vector2(.9, .9),
    clearcoatNormalMap: normal, clearcoatNormalScale: new T.Vector2(1.2, 1.2),
    ior: 1.46, specularIntensity: .3
  });
  matCartucho[nome].onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, -.5 )');
  };
  matCartucho[nome].customProgramCacheKey = () => 'cartucho-' + nome;
}
const matMiolo = new T.MeshStandardMaterial({color: 0xefece6, roughness: .85, metalness: 0});
for (let i = 0; i < gC.meshes.length; i++) {
  const m = gC.meshes[i], p = m.primitives[0], geo = new T.BufferGeometry();
  for (const [k, id] of Object.entries(p.attributes)) {
    const alvo = {POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv'}[k];
    if (alvo) geo.setAttribute(alvo, attrC(id));
  }
  geo.setIndex(attrC(p.indices));
  const nome = (m.name || '').split(' ')[0];
  cartucho.add(new T.Mesh(geo, matCartucho[nome] || matMiolo));
}
cartucho.position.set(-.064, 0, -.012);
cartucho.rotation.y = -.20;

// sombras de contato
const sombraFrasco = sombraContato(renderer, scene, {largura: .10, profundidade: .10, altura: .11, opacidade: .5, escurecer: 1.6, borrao: 2});
sombraFrasco.atualiza();
const lona = document.createElement('canvas'); lona.width = lona.height = 512;
const cx = lona.getContext('2d');
cx.filter = 'blur(30px)'; cx.fillStyle = 'rgba(53,45,33,.17)'; cx.fillRect(150, 150, 215, 215);
cx.filter = 'blur(9px)'; cx.fillStyle = 'rgba(53,45,33,.22)'; cx.fillRect(168, 168, 178, 178);
const sombraCartucho = new T.Mesh(new T.PlaneGeometry(.12, .12), new T.MeshBasicMaterial({map: new T.CanvasTexture(lona), transparent: true, depthWrite: false}));
sombraCartucho.rotation.x = -Math.PI / 2; sombraCartucho.position.set(-.064, .00002, -.012);
sombraCartucho.rotation.z = .20; scene.add(sombraCartucho);

// ---------------------------------------------------------------- camera e laco
const mostra = (lista, v) => lista.forEach(o => o.visible = v);
function quadro() {
  controls.update();
  if (!sujo && !controls.autoRotate) return;
  sujo = false;
  mostra(vidros, false); mostra(liquidos, false); mostra(rotulos, false); mostra(internos, false);
  renderer.setRenderTarget(alvos[0]); renderer.render(scene, camera);
  mostra(internos, true);
  renderer.setRenderTarget(alvos[1]); renderer.render(scene, camera);
  mostra(liquidos, true);
  renderer.setRenderTarget(alvos[2]); renderer.render(scene, camera);
  mostra(vidros, true); mostra(rotulos, true);
  renderer.setRenderTarget(null); renderer.render(scene, camera);
}
function olha(alvoX, alvoY, d, px, py, pz) {
  controls.autoRotate = false;
  document.querySelector('#rotate').setAttribute('aria-pressed', 'false');
  camera.position.set(alvoX + px * d, py, pz * d);
  controls.target.set(alvoX, alvoY, 0);
  controls.update(); sujo = true;
}
// a lente e de 20 graus: a distancia sai da altura da peca, senao corta em cima e embaixo
const VISTAS = {
  conjunto: () => { cartucho.visible = sombraCartucho.visible = true;
                    olha(-.030, .060, Math.max(.56, .30 / camera.aspect), .10, .092, .99); },
  frasco:   () => { cartucho.visible = sombraCartucho.visible = false;
                    olha(0, .050, Math.max(.32, .15 / camera.aspect), 0, .058, 1); },
  cartucho: () => { cartucho.visible = sombraCartucho.visible = true;
                    olha(-.064, .070, Math.max(.62, .32 / camera.aspect), -.16, .105, .96); }
};
VISTAS.conjunto();
window.addEventListener('resize', () => { redimensiona(); sujo = true; });
controls.addEventListener('change', () => sujo = true);

document.querySelector('#v-conjunto').onclick = VISTAS.conjunto;
document.querySelector('#v-frasco').onclick = VISTAS.frasco;
document.querySelector('#v-cartucho').onclick = VISTAS.cartucho;
document.querySelector('#rotate').onclick = e => { controls.autoRotate = !controls.autoRotate; e.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate)); sujo = true; };
document.querySelector('#exposure').oninput = e => { renderer.toneMappingExposure = Number(e.target.value); sujo = true; };
// Luz rasante: deita a principal quase no plano da peca. E assim que se confere relevo
// seco e verniz localizado numa prova, porque a sombra rasa desenha o alto e o baixo.
const luzRasante = new T.DirectionalLight(0xfff6ec, 2.6);
luzRasante.position.set(.95, .16, .32); luzRasante.visible = false; scene.add(luzRasante);
const luzRasante2 = new T.DirectionalLight(0xeef3ff, 1.1);
luzRasante2.position.set(-.9, .1, .2); luzRasante2.visible = false; scene.add(luzRasante2);
const direcionais = [];
scene.traverse(o => { if (o.isDirectionalLight && o !== luzRasante && o !== luzRasante2) direcionais.push(o); });
const intensidadesBase = direcionais.map(l => l.intensity);
document.querySelector('#rasante').onclick = e => {
  const liga = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(liga));
  luzRasante.visible = luzRasante2.visible = liga;
  direcionais.forEach((l, i) => l.intensity = intensidadesBase[i] * (liga ? .22 : 1));
  scene.environmentIntensity = liga ? .25 : 1;
  sujo = true;
};
document.querySelector('#save').onclick = () => {
  const b = document.querySelector('#save'); b.textContent = 'Salvando…';
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(Math.min(4, 2400 / Math.max(W(), H())));
  redimensiona(); sujo = true; quadro();
  renderer.domElement.toBlob(blob => {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.download = 'renova-serum-ghk-cu.png'; a.href = url; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); b.textContent = 'Salvar PNG · 2400 px';
  }, 'image/png');
  renderer.setPixelRatio(pr); redimensiona(); sujo = true;
};

document.querySelector('#status').hidden = true;
renderer.setAnimationLoop(quadro);
window.serum3d = {scene, camera, renderer, controls, frasco, cartucho, rotulo, redraw: () => sujo = true, loaded: true};
