import * as T from './three.module.min.js';

// Estúdio padrão dos visualizadores 3D da NHV (o mesmo arquivo vai em cada site).
// Fundo neutro com leve vinheta, luz de três pontos sem sombra dura, ambiente HDR
// e sombra de contato macia logo abaixo dos produtos.

export function fundo(scene){
  const c=document.createElement('canvas');c.width=c.height=512;
  const x=c.getContext('2d'),g=x.createRadialGradient(256,230,30,256,256,400);
  g.addColorStop(0,'#e9e5e1');g.addColorStop(.5,'#dcd7d2');g.addColorStop(1,'#c7c1bb');
  x.fillStyle=g;x.fillRect(0,0,512,512);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;scene.background=t;
}

// Principal pela frente e à direita, preenchimento frio à esquerda e contraluz por trás para recortar as bordas do fundo.
export function luzes(scene){
  scene.add(new T.HemisphereLight(0xffffff,0x9a938c,.3));
  const principal=new T.DirectionalLight(0xfffbf7,1.7);principal.position.set(.25,.4,.5);scene.add(principal);
  const preenchimento=new T.DirectionalLight(0xe6edf5,.55);preenchimento.position.set(-.45,.2,.25);scene.add(preenchimento);
  const contraluz=new T.DirectionalLight(0xffffff,1.1);contraluz.position.set(-.1,.35,-.6);scene.add(contraluz);
}

// Ambiente só para metal espelhado. Claro por inteiro (em cima também, para o ombro do frasco não escurecer),
// com softboxes brancos e algumas faixas verticais escuras que dão a leitura de espelho. u = 0,75 é a direção
// da câmera: o softbox largo ali deixa a frente clara e o texto preto legível.
export function ambienteCromo(renderer){
  const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');
  const g=x.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#dcdcde');g.addColorStop(.3,'#c4c4c6');g.addColorStop(.5,'#b3b1ae');g.addColorStop(1,'#9d9994');
  x.fillStyle=g;x.fillRect(0,0,1024,512);
  x.filter='blur(14px)';
  x.fillStyle='#ffffff';x.fillRect(0,0,1024,70);
  x.fillStyle='#f6f6f6';x.fillRect(640,60,260,340);
  x.fillStyle='#ffffff';x.fillRect(230,80,70,300);x.fillRect(470,90,24,280);x.fillRect(960,90,40,280);
  x.fillStyle='#6a6a6d';x.fillRect(580,90,34,300);x.fillRect(920,100,22,280);x.fillRect(360,110,40,260);x.fillRect(90,110,50,260);
  const t=new T.CanvasTexture(c);t.mapping=T.EquirectangularReflectionMapping;t.colorSpace=T.SRGBColorSpace;
  const pm=new T.PMREMGenerator(renderer);const r=pm.fromEquirectangular(t).texture;pm.dispose();t.dispose();
  return r;
}

const VERTICE='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const PESOS='float w[9];w[0]=.051;w[1]=.0918;w[2]=.12245;w[3]=.1531;w[4]=.1633;w[5]=.1531;w[6]=.12245;w[7]=.0918;w[8]=.051;';
function desfoque(eixo){
  return new T.ShaderMaterial({uniforms:{tDiffuse:{value:null},passo:{value:0}},vertexShader:VERTICE,depthTest:false,depthWrite:false,
    fragmentShader:`uniform sampler2D tDiffuse;uniform float passo;varying vec2 vUv;void main(){${PESOS}vec4 s=vec4(0.);for(int i=0;i<9;i++){vec2 d=${eixo}*passo*float(i-4);s+=texture2D(tDiffuse,vUv+d)*w[i];}gl_FragColor=s;}`});
}

// Sombra de contato: uma câmera ortográfica olha de baixo para cima, grava a proximidade dos objetos ao chão
// e o resultado é desfocado. Fica escura onde o objeto encosta e some suavemente para fora.
// Chame atualiza() sempre que os objetos mudarem de lugar (a câmera orbitando não muda a sombra).
export function sombraContato(renderer,scene,{largura=.34,profundidade=.34,altura=.09,opacidade=.62,escurecer=1.6,borrao=2.4,resolucao=1024}={}){
  const grupo=new T.Group();grupo.position.y=.0001;scene.add(grupo);
  const alvo=new T.WebGLRenderTarget(resolucao,resolucao),alvoBorrao=new T.WebGLRenderTarget(resolucao,resolucao);
  alvo.texture.generateMipmaps=alvoBorrao.texture.generateMipmaps=false;
  const plano=new T.PlaneGeometry(largura,profundidade).rotateX(Math.PI/2);
  const sombra=new T.Mesh(plano,new T.MeshBasicMaterial({map:alvo.texture,opacity:opacidade,transparent:true,depthWrite:false}));
  sombra.renderOrder=1;sombra.scale.y=-1;grupo.add(sombra);
  const tela=new T.Mesh(plano);tela.visible=false;grupo.add(tela);
  const cam=new T.OrthographicCamera(-largura/2,largura/2,profundidade/2,-profundidade/2,0,altura);cam.rotation.x=Math.PI/2;grupo.add(cam);
  const profundo=new T.MeshDepthMaterial();profundo.depthTest=profundo.depthWrite=false;
  profundo.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );','gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * '+escurecer.toFixed(3)+' );');};
  const h=desfoque('vec2(1.,0.)'),v=desfoque('vec2(0.,1.)');
  function borra(q){
    tela.visible=true;
    tela.material=h;h.uniforms.tDiffuse.value=alvo.texture;h.uniforms.passo.value=q/resolucao;
    renderer.setRenderTarget(alvoBorrao);renderer.render(tela,cam);
    tela.material=v;v.uniforms.tDiffuse.value=alvoBorrao.texture;v.uniforms.passo.value=q/resolucao;
    renderer.setRenderTarget(alvo);renderer.render(tela,cam);
    tela.visible=false;
  }
  function atualiza(){
    const bg=scene.background,cor=new T.Color(),alfa=renderer.getClearAlpha();renderer.getClearColor(cor);
    scene.background=null;sombra.visible=false;scene.overrideMaterial=profundo;
    renderer.setClearColor(0x000000,0);
    renderer.setRenderTarget(alvo);renderer.clear();renderer.render(scene,cam);
    scene.overrideMaterial=null;
    borra(borrao*4);borra(borrao);borra(borrao*.4);
    renderer.setRenderTarget(null);renderer.setClearColor(cor,alfa);
    scene.background=bg;sombra.visible=true;
  }
  return {grupo,atualiza};
}
