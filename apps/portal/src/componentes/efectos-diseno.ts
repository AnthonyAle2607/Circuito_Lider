// @ts-nocheck
/**
 * Efectos del diseño «Parrilla · Invermedia», portados del script de la maqueta (disenos/propuesta-2-parrilla-invermedia.html).
 * Se conservan tal cual: la redacción de agentes, el tablero «al aire», carruseles, manifiesto, pasos, círculo de
 * emisoras, boleto, sugerencias y el chat de Toño. Paquetes, cotizador y el botón de mantener ahora son React con
 * datos reales (componentes/Venta.tsx).
 *
 * Diferencias con la maqueta: todo temporizador, bucle de animación y evento de ventana pasa por estos envoltorios,
 * para apagarse al salir de la página (en una SPA los bucles seguirían corriendo).
 */
export function iniciarEfectos(): () => void {
 const ctl = new AbortController();
 const tiempos = new Set<number>();
 const observadores: IntersectionObserver[] = [];
 const raf = (f) => (ctl.signal.aborted ? 0 : requestAnimationFrame(f));
 const cada = (f, ms) => { const id = window.setInterval(f, ms); tiempos.add(id); return id; };
 const luego = (f, ms) => { const id = window.setTimeout(f, ms); tiempos.add(id); return id; };
 const enVentana = (tipo, f, op = {}) => window.addEventListener(tipo, f, { ...(typeof op === 'object' ? op : {}), signal: ctl.signal });
 const observador = (...a) => { const o = new IntersectionObserver(...a); observadores.push(o); return o; };
 const clearInterval = (id) => { window.clearInterval(id); tiempos.delete(id); };
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=s=>document.querySelector(s);
const ST=[{c:"Caracas",f:"94.9",p:14},{c:"Valencia",f:"106.7",p:10},{c:"Maracaibo",f:"100.5",p:10},{c:"Barquisimeto",f:"94.9",p:8},{c:"Mérida",f:"92.3",p:6},{c:"San Cristóbal",f:"91.1",p:6},{c:"El Vigía",f:"100.1",p:5},{c:"Puerto Ordaz",f:"100.3",p:7},{c:"Puerto La Cruz",f:"100.5",p:7},{c:"Margarita",f:"97.3",p:5}];
const money=n=>"$"+Math.round(n).toLocaleString("es-VE");
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

/* ===== Héroe: redacción con 10 agentes, uno por emisora ===== */
(function newsroom(){
 const C={ink:"#2E123E",ink2:"#3E1A52",ink3:"#52266B",line:"#5E3A75",cream:"#FFFFFF",mustard:"#FE6B00",red:"#FE6B00",wine:"#3E1A52",desk:"#251036",deskTop:"#52266B"};
 const SKIN=["#8D5A3B","#C68B62","#5E3A26","#E0B08A","#A86F4C","#704328","#D79F78","#B67B55","#4E2F1F","#C68B62"];
 const HAIR=["#2E123E","#3A2418","#2E123E","#6B3E22","#2E123E","#2A1A12","#8A5530","#2E123E","#2A1A12","#6B3E22"];
 const SHIRT=[C.mustard,C.cream,C.red,C.wine,C.mustard,C.cream,C.wine,C.red,C.cream,C.mustard];
 const RADIO=[C.red,C.mustard,C.cream,C.red,C.cream,C.mustard,C.red,C.cream,C.mustard];
 const svg=$("#newsroom");const NS="http://www.w3.org/2000/svg";
 const el=(t,a={},p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e};
 const g=(p,a={})=>el("g",a,p);
 const root=g(svg,{class:"nr"});
 // fondo: piloto "al aire" con ondas (plano, sin degradados)
 const bg=g(root);
 for(let i=0;i<4;i++)el("circle",{cx:600,cy:300,r:200,fill:"none",stroke:C.cream,"stroke-width":2,class:"ring",style:`animation-delay:${i*1.2}s`},bg);
 el("circle",{cx:600,cy:300,r:200,fill:C.red,class:"disc"},bg);
 const lbl=g(bg);el("text",{x:600,y:150,"text-anchor":"middle",fill:C.ink,"font-size":22,"font-weight":700,"letter-spacing":"6"},lbl).textContent="AL AIRE";
 // una fila de agentes
 const lcds=[];const bubbles=[];
 function agent(p,i,st,x,y,s,delay){
  const outer=g(p,{transform:`translate(${x} ${y}) scale(${s})`});
  const body=g(outer,{class:"rise",style:`--d:${delay}`});
  // silla y cuerpo
  el("rect",{x:-50,y:-160,width:100,height:170,rx:22,fill:C.ink3},body);
  el("rect",{x:-40,y:-112,width:80,height:124,rx:28,fill:SHIRT[i]},body);
  el("rect",{x:-9,y:-128,width:18,height:22,rx:4,fill:SKIN[i]},body);
  const head=g(body,{class:"head",style:`--d:${delay*3}`});
  el("circle",{cx:0,cy:-152,r:28,fill:SKIN[i]},head);
  // pelo: cuatro estilos
  const hs=i%4;
  if(hs===0)el("path",{d:"M-29 -154 A29 29 0 0 1 29 -154 L29 -162 Q0 -196 -29 -162 Z",fill:HAIR[i]},head);
  if(hs===1){el("path",{d:"M-30 -150 Q-32 -186 0 -184 Q32 -186 30 -150 L26 -160 Q0 -172 -26 -160 Z",fill:HAIR[i]},head);el("circle",{cx:0,cy:-188,r:12,fill:HAIR[i]},head)}
  if(hs===2){for(const [cx,cy] of [[-20,-170],[-6,-180],[10,-180],[22,-168],[-26,-156],[27,-154]])el("circle",{cx,cy,r:11,fill:HAIR[i]},head)}
  if(hs===3)el("path",{d:"M-31 -150 Q-34 -190 0 -186 Q34 -190 31 -150 L31 -112 L22 -112 L22 -158 Q0 -170 -22 -158 L-22 -112 L-31 -112 Z",fill:HAIR[i]},head);
  // cara
  el("circle",{cx:-9,cy:-150,r:2.8,fill:C.ink},head);el("circle",{cx:9,cy:-150,r:2.8,fill:C.ink},head);
  el("path",{d:"M-7 -138 Q0 -133 7 -138",fill:"none",stroke:C.ink,"stroke-width":2.4,"stroke-linecap":"round"},head);
  // audífonos y micrófono
  el("path",{d:"M-31 -152 A31 31 0 0 1 31 -152",fill:"none",stroke:C.ink,"stroke-width":6},head);
  el("rect",{x:-39,y:-164,width:12,height:26,rx:5,fill:C.ink},head);el("rect",{x:27,y:-164,width:12,height:26,rx:5,fill:C.ink},head);
  if(i%2===0){el("path",{d:"M33 -144 Q34 -126 14 -130",fill:"none",stroke:C.ink,"stroke-width":3.5,"stroke-linecap":"round"},head);el("circle",{cx:12,cy:-130,r:5,fill:C.ink},head)}
  return {outer,delay};
 }
 function deskItems(p,i,st,x,y,s,delay){
  const outer=g(p,{transform:`translate(${x} ${y}) scale(${s})`});
  const it=g(outer,{class:"rise",style:`--d:${delay+60}`});
  // brazos y manos sobre la consola
  el("path",{d:"M-30 -92 Q-48 -50 -50 -12",fill:"none",stroke:SHIRT[i],"stroke-width":17,"stroke-linecap":"round"},it);
  el("path",{d:"M30 -92 Q4 -46 -14 -14",fill:"none",stroke:SHIRT[i],"stroke-width":17,"stroke-linecap":"round"},it);
  // consola
  el("rect",{x:-82,y:-10,width:84,height:12,rx:4,fill:C.ink},it);
  for(let k=0;k<5;k++)el("rect",{x:-76+k*15,y:-8,width:9,height:5,rx:1.5,fill:k===2?C.red:C.line},it);
  el("circle",{cx:-50,cy:-14,r:8,fill:SKIN[i],class:"hand",style:"--k:0"},it);
  el("circle",{cx:-14,cy:-16,r:8,fill:SKIN[i],class:"hand",style:"--k:1"},it);
  // radio de la emisora
  const r=g(it);
  el("line",{x1:96,y1:-70,x2:124,y2:-122,stroke:C.cream,"stroke-width":3,"stroke-linecap":"round"},r);
  el("circle",{cx:124,cy:-122,r:4,fill:C.cream},r);
  el("rect",{x:18,y:-74,width:96,height:74,rx:12,fill:RADIO[i],stroke:C.ink,"stroke-width":3},r);
  for(let k=0;k<5;k++)el("line",{x1:28,y1:-56+k*9,x2:52,y2:-56+k*9,stroke:C.ink,"stroke-width":2.5,"stroke-linecap":"round",opacity:.55},r);
  el("rect",{x:58,y:-64,width:48,height:24,rx:4,fill:C.ink},r);
  const t=el("text",{x:82,y:-46,"text-anchor":"middle",fill:C.mustard,"font-size":15,"font-weight":700},r);t.textContent="88.0";lcds.push({t,to:parseFloat(st.f),delay});
  el("circle",{cx:82,cy:-18,r:9,fill:C.cream,stroke:C.ink,"stroke-width":2.5},r);
  el("line",{x1:82,y1:-18,x2:82,y2:-25,stroke:C.ink,"stroke-width":2.5,"stroke-linecap":"round"},r);
  el("circle",{cx:30,cy:-66,r:4,fill:C.red,class:"lamp",style:`--d:${delay*2}`},r);
  // ecualizador en la radio
  for(let k=0;k<3;k++)el("rect",{x:98+k*5,y:-30,width:3,height:12,fill:C.ink,class:"eqb",style:`animation-delay:${-k*.25-i*.1}s`},r);
  // cinta con la ciudad
  const tp=g(outer,{transform:"translate(0 36) rotate(-3)"});
  const tpi=g(tp,{class:"tp",style:`--d:${delay}`});
  const w=Math.max(120,st.c.length*12+70);
  el("rect",{x:-w/2,y:-16,width:w,height:32,fill:C.mustard,stroke:C.ink,"stroke-width":2.5},tpi);
  const tt=el("text",{x:0,y:8,"text-anchor":"middle",fill:C.ink,"font-size":22},tpi);tt.textContent=`${st.c} ${st.f}`;
  // burbuja de tarea
  const b=g(outer,{transform:"translate(0 -232)"});
  const bi=g(b,{class:"bub"});
  el("rect",{x:-92,y:-22,width:184,height:40,rx:12,fill:C.cream,stroke:C.ink,"stroke-width":2.5},bi);
  el("path",{d:"M-8 18 L0 30 L8 18 Z",fill:C.cream,stroke:C.ink,"stroke-width":2.5,"stroke-linejoin":"round"},bi);
  el("rect",{x:-6,y:14,width:12,height:6,fill:C.cream},bi);
  const bt=el("text",{x:0,y:4,"text-anchor":"middle",fill:C.ink,"font-size":13,"font-weight":700},bi);
  bubbles.push({g:bi,t:bt,st});
 }
 // fila de atrás (4) y fila de adelante (6, un poco más chica para que quepan)
 const back=[[5,330],[6,510],[7,690],[8,870]],front=[[0,95],[1,291],[2,487],[3,683],[4,879],[9,1075]];
 const rowBack=g(root),deskBack=g(root),itemsBack=g(root),rowFront=g(root),deskFront=g(root),itemsFront=g(root);
 back.forEach(([i,x],k)=>agent(rowBack,i,ST[i],x,402,.78,200+k*110));
 el("rect",{x:210,y:400,width:780,height:44,rx:6,fill:C.desk},deskBack);el("rect",{x:210,y:398,width:780,height:6,fill:C.deskTop},deskBack);
 back.forEach(([i,x],k)=>deskItems(itemsBack,i,ST[i],x,402,.78,200+k*110));
 front.forEach(([i,x],k)=>agent(rowFront,i,ST[i],x,560,.9,650+k*110));
 el("rect",{x:20,y:558,width:1160,height:102,rx:10,fill:C.desk},deskFront);el("rect",{x:20,y:556,width:1160,height:8,fill:C.deskTop},deskFront);
 front.forEach(([i,x],k)=>deskItems(itemsFront,i,ST[i],x,560,.9,650+k*110));
 // cada radio sintoniza su frecuencia al aparecer
 lcds.forEach(({t,to,delay})=>{if(reduce){t.textContent=to.toFixed(1);return}luego(()=>{const t0=performance.now();(function f(now){const p=Math.min(1,(now-t0)/1100);t.textContent=(88+(to-88)*ease(p)).toFixed(1);if(p<1)raf(f)})(t0)},delay+400)});
 // tareas que cambian: tres burbujas visibles a la vez
 const TASKS=s=>[`Programando ${s.c}`,"Revisando spot · 30 s","✓ Spot aprobado",`Al aire · ${s.f} FM`,"Cotizando 3 emisoras","Certificando 42 / 42","Cupo: ENCENDIDOS 06:40","✓ Pago confirmado"];
 let turn=0;function cycle(){const show=new Set();while(show.size<3)show.add(Math.floor(Math.random()*bubbles.length));bubbles.forEach((b,i)=>{if(show.has(i)){const list=TASKS(b.st);b.t.textContent=list[(turn+i)%list.length];b.g.classList.add("on")}else b.g.classList.remove("on")});turn++}
 luego(()=>{cycle();if(!reduce)cada(()=>{if(!document.hidden)cycle()},2600)},reduce?0:1900);
})();

/* qué suena ahora en Caracas (UTC-4), según la programación publicada */
const SHOWS=[{d:[1,2,3,4,5],a:6,b:9,n:"ENCENDIDOS",nat:1},{d:[1,2,3,4,5],a:9,b:11,n:"Máximo Volumen"},{d:[1,2,3,4,5],a:11,b:13,n:"CONVOCADOS",nat:1},{d:[1,2,3,4,5],a:13,b:15,n:"Batita en Líder"},{d:[1,2,3,4,5],a:15.25,b:16.25,n:"El 3 Pack"},{d:[1,2,3,4,5],a:17,b:18,n:"AL AIRE",nat:1},{d:[5,6],a:21,b:25,n:"Play House Líder"},{d:[6,0],a:9,b:10,n:"Más que To2"}];
/* tablero de aeropuerto: las letras giran hasta formar el mensaje */
const GLY="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:·";
function flapTo(el,text){text=text.toUpperCase();[...el.childNodes].forEach(n=>{if(n.nodeType===3)n.remove()});el.classList.add("flapboard");el.setAttribute("aria-label",text);
 const n=Math.max(text.length,el.children.length);while(el.children.length<n){const s=document.createElement("span");s.className="fc";s.setAttribute("aria-hidden","true");el.appendChild(s)}
 [...el.children].forEach((s,i)=>{const target=text[i]||" ";if(i>=text.length){s.remove();return}if(reduce){s.textContent=target;s.classList.toggle("sp",target===" ");return}
  let k=4+i%7;(function step(){if(k--<=0){s.textContent=target;s.classList.toggle("sp",target===" ");return}s.textContent=GLY[Math.floor(Math.random()*GLY.length)];s.classList.remove("sp");s.classList.remove("f");void s.offsetWidth;s.classList.add("f");luego(step,55)})()})}
const fmtH=h=>String(Math.floor(h)%24).padStart(2,"0")+":"+String(Math.round(h%1*60)).padStart(2,"0");
let flapI=0;(function liveNow(){const u=new Date(Date.now()-4*3600e3),day=u.getUTCDay(),h=u.getUTCHours()+u.getUTCMinutes()/60;const cur=SHOWS.find(s=>s.d.includes(day)&&h>=s.a&&h<s.b);
 const nx=SHOWS.filter(s=>s.d.includes(day)&&s.a>h).sort((a,b)=>a.a-b.a)[0];
 const msgs=[cur?(cur.nat?`Al aire ${cur.n}`:`Al aire ${cur.n}`):"Al aire musica",nx?`Sigue ${nx.n} ${fmtH(nx.a)}`:"Mañana ENCENDIDOS 06:00","10 emisoras 10 ciudades"];
 flapTo($("#liveNow"),msgs[flapI++%msgs.length]);luego(liveNow,reduce?60000:4800)})();

/* odómetro: cada dígito rueda hasta su valor */
function odometer(el){let pat="";return v=>{const p=v.replace(/\d/g,"#");el.setAttribute("aria-label",v);
 if(p!==pat){pat=p;el.innerHTML="";el.classList.add("odo");[...v].forEach(ch=>{if(/\d/.test(ch)){const c=document.createElement("span");c.className="c";c.setAttribute("aria-hidden","true");for(let i=0;i<10;i++){const d=document.createElement("span");d.textContent=i;c.appendChild(d)}el.appendChild(c)}else{const s=document.createElement("span");s.className="s";s.textContent=ch;s.setAttribute("aria-hidden","true");el.appendChild(s)}})}
 const ds=[...v].filter(ch=>/\d/.test(ch));el.querySelectorAll(".c").forEach((c,i)=>c.style.transform=`translateY(${-ds[i]}em)`)}}

/* imán: los botones principales se acercan al cursor */
function magnet(sel,str=.28,pad=50){if(reduce||!matchMedia("(pointer:fine)").matches)return;const bs=[...document.querySelectorAll(sel)];bs.forEach(b=>b.style.transition+=(b.style.transition?",":"")+"translate .4s cubic-bezier(.16,1,.3,1)");
 enVentana("pointermove",e=>bs.forEach(b=>{const r=b.getBoundingClientRect();const inside=e.clientX>r.left-pad&&e.clientX<r.right+pad&&e.clientY>r.top-pad&&e.clientY<r.bottom+pad;b.style.translate=inside?`${(e.clientX-r.left-r.width/2)*str}px ${(e.clientY-r.top-r.height/2)*str}px`:"0 0"}),{passive:true})}
magnet(".btn.primary,.btn.m,.final .btn.ink");

/* chispas al hacer clic */
function sparks(host,x,y){if(reduce)return;for(let i=0;i<8;i++){const s=document.createElement("span");s.className="spark";s.style.left=x+"px";s.style.top=y+"px";s.style.setProperty("--a",(i*45+Math.random()*12)+"deg");host.appendChild(s);luego(()=>s.remove(),550)}}

/* ===== Carruseles: no se frenan con el cursor; se arrastran con inercia ===== */
const carousels={};
function makeCarousel(box,{speed=40,dir=-1}={}){
 const track=box.querySelector(".track");let x=0,v=reduce?0:speed*dir,base=reduce?0:speed*dir,drag=false,lx=0,lt=0,half=1,last=performance.now();
 const measure=()=>{half=track.scrollWidth/2||1};measure();enVentana("resize",measure);
 function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(!drag){v+=(base-v)*Math.min(1,dt*1.6);x+=v*dt}
  if(x<=-half)x+=half;if(x>0)x-=half;track.style.transform=`translate3d(${x}px,0,0)`;raf(loop)}
 raf(loop);
 box.addEventListener("pointerdown",e=>{drag=true;lx=e.clientX;lt=performance.now();box.classList.add("dragging");try{box.setPointerCapture(e.pointerId)}catch(_){}});
 box.addEventListener("pointermove",e=>{if(!drag)return;const now=performance.now(),dx=e.clientX-lx;x+=dx;v=dx/Math.max(.008,(now-lt)/1000);lx=e.clientX;lt=now});
 const up=()=>{drag=false;box.classList.remove("dragging");v=Math.max(-2500,Math.min(2500,v))};
 box.addEventListener("pointerup",up);box.addEventListener("pointercancel",up);
 box.addEventListener("wheel",e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){x-=e.deltaX;e.preventDefault()}},{passive:false});
 return{nudge(d){v+=d*900}};
}
document.querySelectorAll(".carousel-hint button").forEach(b=>b.onclick=()=>carousels[b.dataset.c]?.nudge(+b.dataset.dir));

/* programas */
const PROGS=[["ENCENDIDOS","L–V · 06:00–09:00","Nacional","v1"],["CONVOCADOS","L–V · 11:00–13:00","Nacional","v2"],["AL AIRE","L–V · 17:00–18:00","Nacional","v3"],["MÁXIMO VOLUMEN","L–V · 09:00–11:00","Caracas","v4"],["BATITA EN LÍDER","L–V · 13:00–15:00","Caracas","v5"],["EL BRUNCH","L–V · 10:00–12:00","Mérida","v1"],["CAMBIO DE LUCES","L–V · 15:00–17:00","Mérida","v2"],["EL 3 PACK","L–V · 15:15–16:15","Caracas","v4"],["PLAY HOUSE LÍDER","Vie y sáb · 21:00–01:00","Caracas","v3"],["TIEMPO DE JUEGO","Sáb y dom · 09:00–12:00","Mérida","v5"]];
const card=([n,w,s,v])=>`<div class="pc ${v}"><div class="tag"><span>${s}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><h3>${n}</h3><span class="when">${w}</span></div>`;
$("#prow").innerHTML=PROGS.map(card).join("").repeat(2);
carousels.progs=makeCarousel($("#progs"),{speed:45,dir:-1});

/* emisiones */
const EM=[["06:42","Caracas 94.9","ENCENDIDOS"],["06:42","Maracaibo 100.5","ENCENDIDOS"],["07:15","Valencia 106.7","ENCENDIDOS"],["09:30","Caracas 94.9","Máximo Volumen"],["10:20","Mérida 92.3","El Brunch"],["12:15","Barquisimeto 94.9","CONVOCADOS"],["12:15","Puerto Ordaz 100.3","CONVOCADOS"],["15:40","Mérida 92.3","Cambio de Luces"],["17:38","Puerto La Cruz 100.5","AL AIRE"],["17:38","San Cristóbal 91.1","AL AIRE"]];
const tk=([h,e,p])=>`<div class="tk2"><b>${h}</b><span>${e}</span><span style="color:var(--soft)">${p}</span><span class="ok">Al aire · 30 s</span></div>`;
$("#tr1").innerHTML=EM.map(tk).join("").repeat(2);$("#tr2").innerHTML=EM.slice().reverse().map(tk).join("").repeat(2);
carousels.tk1=makeCarousel($("#tk1"),{speed:38,dir:-1});carousels.tk2=makeCarousel($("#tk2"),{speed:32,dir:1});

/* aparición al entrar */
const io=observador(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.2});
document.querySelectorAll(".rv,#board,#cmp").forEach(el=>io.observe(el));

/* manifiesto */
const letters=[];document.querySelectorAll("#manifest .w").forEach(w=>{const t=w.textContent;w.textContent="";[...t].forEach(ch=>{const s=document.createElement("span");s.className="l";s.textContent=ch;w.appendChild(s);letters.push(s)})});
const stepsBox=$("#steps"),rail=stepsBox.querySelector(".rail"),stepEls=[...stepsBox.querySelectorAll(".step")];
function onScroll(){const vh=innerHeight;const m=$("#manifest").getBoundingClientRect();const pm=Math.min(1,Math.max(0,(vh*.85-m.top)/(m.height+vh*.35)));const on=reduce?letters.length:Math.round(pm*letters.length);letters.forEach((s,i)=>s.classList.toggle("on",i<on));
 const r=stepsBox.getBoundingClientRect();rail.style.setProperty("--fill",Math.min(100,Math.max(0,(vh*.55-r.top)/r.height*100))+"%");
 stepEls.forEach(s=>{const b=s.getBoundingClientRect();s.classList.toggle("act",b.top<vh*.6&&b.bottom>vh*.3)})}
let ticking=false;enVentana("scroll",()=>{if(!ticking){ticking=true;raf(()=>{onScroll();ticking=false})}},{passive:true});onScroll();

/* mini interfaces de los pasos */
const u1=$("#u1");ST.forEach(s=>{const e=document.createElement("span");e.textContent=`${s.c} ${s.f}`;u1.appendChild(e)});
const u2=$("#u2");for(let r=0;r<6;r++)for(let d=0;d<7;d++){const i=document.createElement("i");if(d<5&&(r<3||r===5))i.className="nat";u2.appendChild(i)}
const u3w=$("#u3w");for(let i=0;i<46;i++)u3w.appendChild(document.createElement("span"));
const u4=$("#u4");[["02/12 06:42","Caracas 94.9"],["02/12 06:42","Maracaibo 100.5"],["02/12 12:15","Valencia 106.7"],["02/12 17:38","Caracas 94.9"],["03/12 06:51","Valencia 106.7"]].forEach(([a,b])=>{const d=document.createElement("div");d.innerHTML=`<span>${a}</span><span>${b}</span>`;u4.appendChild(d)});
const players={
 1(){const c=[...u1.children];let k=0;return cada(()=>{if(k>=c.length){c.forEach(x=>x.classList.remove("on"));k=0}else c[k++].classList.add("on");$("#u1c").textContent=`${c.filter(x=>x.classList.contains("on")).length} de 9`},380)},
 2(){const c=[...u2.children],o=[0,1,2,3,4,7,8,9,10,11,14,16,18,35,36,37,38,39,26,33];let k=0;return cada(()=>{if(k>=o.length){c.forEach(x=>x.classList.remove("on"));k=0}else c[o[k++]].classList.add("on");$("#u2c").textContent=`${c.filter(x=>x.classList.contains("on")).length} franjas`},260)},
 3(){const b=[...u3w.children],li=[...$("#u3").children];let t=0;return cada(()=>{t++;b.forEach((s,i)=>s.style.height=(18+Math.abs(Math.sin(i*.5+t*.6)*Math.cos(i*.17+t*.2))*82)+"%");const k=Math.floor(t/6)%(li.length+2);li.forEach((x,i)=>x.classList.toggle("on",i<k))},120)},
 4(){const rows=[...u4.children],n=$("#u4n");let t=0;return cada(()=>{t=(t+1)%60;n.textContent=Math.min(126,Math.round(t*126/40));rows.forEach((r,i)=>r.classList.toggle("on",t>i*7+4))},90)}};
const running={};const pio=observador(es=>es.forEach(e=>{const k=e.target.dataset.s;if(e.isIntersecting&&!running[k]&&!reduce)running[k]=players[k]();else if(!e.isIntersecting&&running[k]){clearInterval(running[k]);running[k]=null}}),{threshold:.35});
stepEls.forEach(s=>pio.observe(s));
if(reduce){[...u1.children].slice(0,3).forEach(x=>x.classList.add("on"));[...$("#u3").children].forEach(x=>x.classList.add("on"));[...u4.children].forEach(x=>x.classList.add("on"));$("#u4n").textContent="126"}

/* círculo: gira solo, se arrastra para girarlo, no se frena con el cursor */
(function wheel(){
 const w=$("#wheel"),orbit=$("#orbit");const spans=[];
 ST.forEach((s,i)=>{const a=i/ST.length*Math.PI*2-Math.PI/2;const d=document.createElement("div");d.className="st";d.style.left=(50+Math.cos(a)*50)+"%";d.style.top=(50+Math.sin(a)*50)+"%";d.innerHTML=`<span><b>${s.f}</b>${s.c}</span>`;orbit.appendChild(d);spans.push(d.firstChild)});
 const ticks=$("#ticks");for(let i=0;i<=30;i++){const t=document.createElement("i");if(i%5===0)t.className="m";t.style.transform=`translateX(-50%) rotate(${-135+i*9}deg)`;ticks.appendChild(t)}
 let ang=0,v=reduce?0:9,base=reduce?0:9,drag=false,la=0,lt=0,last=performance.now();
 const angleOf=e=>{const r=w.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI};
 function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(!drag){v+=(base-v)*Math.min(1,dt*1.4);ang+=v*dt}
  orbit.style.transform=`rotate(${ang}deg)`;spans.forEach(s=>s.style.transform=`rotate(${-ang}deg)`);raf(loop)}
 raf(loop);
 w.addEventListener("pointerdown",e=>{drag=true;la=angleOf(e);lt=performance.now();w.classList.add("dragging");try{w.setPointerCapture(e.pointerId)}catch(_){}});
 w.addEventListener("pointermove",e=>{if(!drag)return;const a=angleOf(e),now=performance.now();let d=a-la;if(d>180)d-=360;if(d<-180)d+=360;ang+=d;v=d/Math.max(.008,(now-lt)/1000);la=a;lt=now});
 const up=()=>{drag=false;w.classList.remove("dragging");v=Math.max(-720,Math.min(720,v))};w.addEventListener("pointerup",up);w.addEventListener("pointercancel",up);
})();

/* boleto: arrastra el talón hasta arrancarlo */
(function(){const t=$("#ticket"),s=$("#stub");let x0=0,y0=0,drag=false,moved=false;
 const tear=()=>{if(t.classList.contains("torn"))return;s.style.transform="";s.classList.add("fall");t.classList.add("torn");const r=t.getBoundingClientRect();sparks(t,r.width-170,r.height/2)};
 s.addEventListener("pointerdown",e=>{if(t.classList.contains("torn"))return;drag=true;moved=false;x0=e.clientX;y0=e.clientY;s.classList.add("drag");try{s.setPointerCapture(e.pointerId)}catch(_){}});
 s.addEventListener("pointermove",e=>{if(!drag)return;const dx=Math.max(0,e.clientX-x0),dy=e.clientY-y0;if(Math.hypot(dx,dy)>4)moved=true;s.style.transition="none";s.style.transform=`translate(${dx}px,${dy*.3}px) rotate(${dx/7}deg)`;if(dx>90)tear()});
 const end=()=>{if(!drag)return;drag=false;s.classList.remove("drag");if(!t.classList.contains("torn")){s.style.transition="transform .45s cubic-bezier(.16,1,.3,1)";s.style.transform=""}};
 s.addEventListener("pointerup",end);s.addEventListener("pointercancel",end);
 s.addEventListener("click",()=>{if(!moved)tear()});
 $("#reset").onclick=()=>{t.classList.remove("torn");s.classList.remove("fall");s.style.transform=""}})();

/* sugerencias */
document.querySelectorAll(".sug").forEach(c=>c.querySelectorAll("button").forEach(b=>b.onclick=()=>{c.classList.add("done");c.querySelector(".acts").textContent=b.classList.contains("yes")?"✓ Listo · "+b.textContent.toLowerCase():"Descartado"}));

/* ===== Toño: mascota del chat de soporte (no sigue el cursor) ===== */
(function(){const NS="http://www.w3.org/2000/svg";const E=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);p&&p.appendChild(e);return e};
 const K={ink:"#2E123E",m:"#FE6B00",r:"#FE6B00",c:"#FFFFFF"};
 function tono(host){const s=E("svg",{viewBox:"0 0 200 240",class:"tono"},host);const b=E("g",{class:"mbody"},s);
  E("rect",{x:66,y:196,width:18,height:34,rx:9,fill:K.ink},b);E("rect",{x:116,y:196,width:18,height:34,rx:9,fill:K.ink},b);
  E("line",{x1:100,y1:58,x2:100,y2:16,stroke:K.ink,"stroke-width":6,"stroke-linecap":"round"},b);E("circle",{cx:100,cy:14,r:12,fill:K.r,stroke:K.ink,"stroke-width":4,class:"ball"},b);
  E("path",{d:"M34 138 Q12 150 16 176",fill:"none",stroke:K.ink,"stroke-width":10,"stroke-linecap":"round"},b);
  const arm=E("g",{class:"arm"},b);E("path",{d:"M166 138 Q190 124 186 98",fill:"none",stroke:K.ink,"stroke-width":10,"stroke-linecap":"round"},arm);E("circle",{cx:186,cy:94,r:10,fill:K.c,stroke:K.ink,"stroke-width":4},arm);
  E("rect",{x:28,y:56,width:144,height:146,rx:36,fill:K.m,stroke:K.ink,"stroke-width":6},b);E("rect",{x:46,y:74,width:108,height:68,rx:20,fill:K.ink},b);
  [[78,104],[122,104]].forEach(([x,y])=>{const g=E("g",{class:"eye"},b);E("ellipse",{cx:x,cy:y,rx:13,ry:15,fill:"#fff"},g);E("circle",{cx:x+2,cy:y+2,r:6.5,fill:K.ink},g)});
  E("ellipse",{cx:100,cy:130,rx:9,ry:3.5,fill:K.r,class:"mouth"},b);
  for(let i=0;i<3;i++)E("line",{x1:52,y1:160+i*10,x2:108,y2:160+i*10,stroke:K.ink,"stroke-width":4,"stroke-linecap":"round",opacity:.5},b);
  E("circle",{cx:136,cy:170,r:12,fill:K.r,stroke:K.ink,"stroke-width":4},b);return s}
 const btn=$("#supBtn"),panel=$("#panel"),pm=$("#pm"),pq=$("#pq"),teaser=$("#teaser");
 const big=tono(btn),mini=tono($("#tonoMini"));
 const talk=on=>[big,mini].forEach(s=>s.classList.toggle("talk",on));
 const scroll=()=>pm.scrollTo({top:pm.scrollHeight,behavior:reduce?"auto":"smooth"});
 let busy=Promise.resolve(),greeted=false;
 function toño(html){busy=busy.then(async()=>{const t=document.createElement("div");t.className="bm t typing";t.innerHTML="<i></i><i></i><i></i>";pm.appendChild(t);scroll();talk(true);$("#tst").textContent="Toño está escribiendo…";
  await new Promise(r=>luego(r,reduce?50:Math.min(1500,450+html.length*10)));t.remove();talk(false);$("#tst").textContent="Soporte Invermedia · en línea";
  const m=document.createElement("div");m.className="bm t";m.innerHTML=html;pm.appendChild(m);scroll()});return busy}
 function user(t){const m=document.createElement("div");m.className="bm u";m.textContent=t;pm.appendChild(m);scroll()}
 const A={
  comprar:"Es así: <b>1)</b> eliges emisoras y horas en la parrilla, <b>2)</b> subes tu spot de 30 a 60 s, <b>3)</b> una persona lo revisa y pagas en línea, <b>4)</b> recibes la prueba de cada emisión. <a href=\"#como\">Ver los pasos</a>",
  precios:"El precio sale al instante en el <a href=\"#cotizar\">cotizador</a>: eliges emisoras, horas y semanas y ves el total. Los <a href=\"#paquetes\">paquetes</a> son un buen punto de partida.",
  exterior:"¡Sí! La plataforma está pensada para anunciantes fuera de Venezuela. Los medios de pago y las monedas se confirman antes del lanzamiento.",
  emisoras:"Son 10 emisoras de Circuito Líder: Caracas 94.9, Valencia 106.7, Maracaibo 100.5, Barquisimeto 94.9, Mérida 92.3, San Cristóbal 91.1, El Vigía 100.1, Puerto Ordaz 100.3, Puerto La Cruz 100.5 y Margarita 97.3.",
  certificado:"Cada emisión aparece en tu panel con hora y emisora, y al cerrar la campaña te llega el certificado de transmisión. 📄",
  normativa:"Una persona escucha tu spot y lo revisa según la normativa de CONATEL. Si algo no cumple, te decimos qué cambiar antes de programarlo.",
  formatos:"Hoy vendemos comerciales grabados de 30 a 60 segundos. La mención en vivo del locutor y el patrocinio de programas llegan después.",
  persona:"Te paso con el equipo de ventas 🙌. Te escriben por correo o WhatsApp para armar la pauta contigo. <i>(Los datos de contacto se definen antes del lanzamiento.)</i>",
  hola:"¡Hola! 👋 Soy Toño. Pregúntame cómo comprar, precios, emisoras o el certificado.",
  gracias:"¡Con gusto! Si necesitas algo más, aquí estoy. 📻"};
 const RULES=[[/precio|cuesta|tarifa|cu[aá]nto|costo|paquete/i,"precios"],[/compr|c[oó]mo funciona|pasos|empez|contratar/i,"comprar"],[/exterior|fuera|pa[ií]s|miami|espa[ñn]a|pago|moneda|d[oó]lar/i,"exterior"],[/emisora|ciudad|frecuencia|caracas|maracaibo|valencia|m[eé]rida/i,"emisoras"],[/certific|prueba|son[oó]|al aire|emisi[oó]n/i,"certificado"],[/conatel|normativ|revis|cumpl/i,"normativa"],[/formato|segundo|cu[ñn]a|mencion|patrocin|duraci/i,"formatos"],[/persona|humano|asesor|ventas|whatsapp|llamar|contacto/i,"persona"],[/gracias|genial|perfecto/i,"gracias"],[/hola|buenas|hey/i,"hola"]];
 const QUICK=[["¿Cómo compro?","comprar"],["Precios","precios"],["¿Desde el exterior?","exterior"],["Emisoras","emisoras"],["¿Cómo sé que sonó?","certificado"],["Hablar con una persona","persona"]];
 function quick(){pq.innerHTML="";QUICK.forEach(([l,k])=>{const b=document.createElement("button");b.type="button";b.textContent=l;b.onclick=()=>{user(l);toño(A[k])};pq.appendChild(b)})}
 function open(){panel.hidden=false;btn.setAttribute("aria-expanded","true");teaser.classList.remove("on");if(!greeted){greeted=true;toño("¡Hola! 👋 Soy <b>Toño</b>, el de soporte.");toño("¿En qué te ayudo con tu pauta de radio?");quick()}luego(()=>$("#pin").focus(),300)}
 function close(){panel.hidden=true;btn.setAttribute("aria-expanded","false");btn.focus()}
 btn.onclick=()=>panel.hidden?open():close();teaser.onclick=open;$("#tclose").onclick=close;
 enVentana("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)close()});
 $("#pf").addEventListener("submit",e=>{e.preventDefault();const v=$("#pin").value.trim();if(!v)return;$("#pin").value="";user(v);const hit=RULES.find(([re])=>re.test(v));toño(hit?A[hit[1]]:"Mmm, eso no lo tengo claro todavía 🤔. Te puedo contar cómo comprar, precios, emisoras o el certificado, o pasarte con una persona.")});
 pm.addEventListener("click",e=>{const a=e.target.closest("a[href^='#']");if(a&&innerWidth<700)close()});
 // saludo del botón: Toño saluda y muestra un mensaje corto, sin moverse de su esquina
 luego(()=>{if(panel.hidden){teaser.classList.add("on");big.classList.add("wave");luego(()=>big.classList.remove("wave"),2000);luego(()=>teaser.classList.remove("on"),7000)}},reduce?500:2500);
})();
 return () => {
  ctl.abort();
  tiempos.forEach((id) => { window.clearTimeout(id); window.clearInterval(id); });
  observadores.forEach((o) => o.disconnect());
 };
}

/** Odómetro: cada dígito rueda hasta su valor (lo usa el total del cotizador). */
export function odometro(el: HTMLElement) {
 let pat = '';
 return (v: string) => {
  const p = v.replace(/\d/g, '#');
  el.setAttribute('aria-label', v);
  if (p !== pat) {
   pat = p;
   el.innerHTML = '';
   el.classList.add('odo');
   [...v].forEach((ch) => {
    if (/\d/.test(ch)) {
     const c = document.createElement('span');
     c.className = 'c';
     c.setAttribute('aria-hidden', 'true');
     for (let i = 0; i < 10; i++) { const d = document.createElement('span'); d.textContent = String(i); c.appendChild(d); }
     el.appendChild(c);
    } else {
     const s = document.createElement('span');
     s.className = 's';
     s.textContent = ch;
     s.setAttribute('aria-hidden', 'true');
     el.appendChild(s);
    }
   });
  }
  const ds = [...v].filter((ch) => /\d/.test(ch));
  el.querySelectorAll<HTMLElement>('.c').forEach((c, i) => (c.style.transform = `translateY(${-Number(ds[i])}em)`));
 };
}

/** Chispas al hacer clic. */
export function chispas(host: HTMLElement, x: number, y: number) {
 if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 for (let i = 0; i < 8; i++) {
  const s = document.createElement('span');
  s.className = 'spark';
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  s.style.setProperty('--a', i * 45 + Math.random() * 12 + 'deg');
  host.appendChild(s);
  setTimeout(() => s.remove(), 550);
 }
}
