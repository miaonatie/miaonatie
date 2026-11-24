// Render a rounded, tapered snake using the original Platane/snk route.
// No external dependencies; contribution grid and eating timestamps are preserved.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function stylize(svg,dark) {
  if(svg.includes("miaonatie-smooth-snake")) return svg;
  const style=svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  const head=style?.match(/@keyframes s0\{((?:[^{}]*\{[^{}]*\})+)\}/)?.[1];
  const duration=Number(style?.match(/\.s\{[^}]*?([\d.]+)ms/)?.[1]);
  if(!head||!duration) throw Error("Unrecognized snk SVG animation");
  const frames=new Map();
  for(const m of head.matchAll(/([\d.,%\s]+)\{transform:translate\(([-\d.]+)px,\s*([-\d.]+)px\)\}/g)){
    for(const t of m[1].matchAll(/([\d.]+)%/g)) frames.set(Number(t[1])*duration/100,[Number(m[2])+8,Number(m[3])+8]);
  }
  if(!frames.has(0)||frames.size<2) throw Error("Missing snake keyframes");
  frames.set(duration,frames.get(0));
  const keys=[...frames].sort((a,b)=>a[0]-b[0]);
  // Infer the time per 16px cell from the source track.
  const rates=keys.slice(1).map(([t,p],i)=>{const [s,q]=keys[i];return (t-s)*16/Math.hypot(p[0]-q[0],p[1]-q[1]);}).filter(v=>Number.isFinite(v)&&v>10);
  rates.sort((a,b)=>a-b);
  const step=rates[Math.floor(rates.length/2)]||100;
  const wrap=t=>((t%duration)+duration)%duration;
  function raw(t){
    t=wrap(t);let lo=0,hi=keys.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid][0]<=t)lo=mid;else hi=mid;}
    const [a,p]=keys[lo],[b,q]=keys[hi],f=(t-a)/(b-a);
    return [p[0]+(q[0]-p[0])*f,p[1]+(q[1]-p[1])*f];
  }
  function point(t){
    const a=raw(t-step*.28),b=raw(t),c=raw(t+step*.28);
    return [(a[0]+2*b[0]+c[0])/4,(a[1]+2*b[1]+c[1])/4];
  }
  const fmt=n=>Number(n.toFixed(3));
  const count=Math.max(120,Math.ceil(duration/(step*.45)));
  const times=new Set([0,duration]);
  for(let i=1;i<count;i++)times.add(i*duration/count);
  for(const [t] of keys)if(t>0&&t<duration){times.add(t);times.add(Math.max(0,t-step*.28));times.add(Math.min(duration,t+step*.28));}
  const timeline=[...times].sort((a,b)=>a-b);
  let last=0;const track=[],turn=[];
  for(const t of timeline){
    const p=point(t),a=point(t-step*.18),b=point(t+step*.18);
    let angle=Math.hypot(b[0]-a[0],b[1]-a[1])<.05?last:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
    if(turn.length){while(angle-last>180)angle-=360;while(angle-last<-180)angle+=360;}
    last=angle;
    const pct=fmt(t/duration*100);
    track.push(`${pct}%{transform:translate(${fmt(p[0])}px,${fmt(p[1])}px)}`);
    turn.push(`${pct}%{transform:rotate(${fmt(angle)}deg)}`);
  }
  const speed=1.12, period=Math.round(duration*speed);
  const colors=dark?["#155e63","#269e91","#65e6c1"]:["#16716e","#168b79","#10a57c"];
  const body=[];
  const segments=18;
  for(let i=segments;i>=1;i--){
    const f=i/segments,r=6.5-4.5*Math.pow(f,1.45),lag=i*step*.20;
    const p=point(-lag),color=f>.65?colors[0]:f>.32?colors[1]:colors[2];
    body.push(`<circle class="smooth-body" r="${fmt(r)}" fill="${color}" style="transform:translate(${fmt(p[0])}px,${fmt(p[1])}px);animation-delay:-${fmt((duration-wrap(lag))*speed)}ms"/>`);
  }
  const p0=point(0);
  body.push(`<g class="smooth-body" style="transform:translate(${fmt(p0[0])}px,${fmt(p0[1])}px)"><g class="smooth-face"><ellipse rx="7.7" ry="6.7" fill="${colors[2]}"/><circle cx="3.2" cy="-2.65" r="1.35" fill="#f7fffc"/><circle cx="3.2" cy="2.65" r="1.35" fill="#f7fffc"/><circle cx="3.65" cy="-2.65" r=".72" fill="#123b38"/><circle cx="3.65" cy="2.65" r=".72" fill="#123b38"/></g></g>`);
  const extra=`/* miaonatie-smooth-snake */.smooth-body{animation:snake-glide ${period}ms linear infinite}.smooth-face{animation:snake-turn ${period}ms linear infinite}@keyframes snake-glide{${track.join("")}}@keyframes snake-turn{${turn.join("")}}@media(prefers-reduced-motion:reduce){.smooth-body,.smooth-face,.c{animation:none!important}}`;
  let out=svg.replace(/<rect\b[^>]*class="s s\d+"[^>]*\/>/g,"").replace(/<rect\b[^>]*class="u u\d+"[^>]*\/>/g,"");
  // Match the contribution cells to the slower, smoother snake.
  out=out.replace(/<\/style>/,extra+"</style>").replace(new RegExp(`${duration}ms`,"g"),`${period}ms`);
  // Preserve the grid while trimming unused bottom space.
  const bounds=out.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  if(bounds){
    const [,x,y,w,h]=bounds.map(Number);
    const maxY=Math.max(112,...keys.map(k=>k[1][1]+10));
    const height=Math.min(h,Math.ceil(maxY-y+8));
    out=out.replace(bounds[0],`viewBox="${x} ${y} ${w} ${height}"`).replace(/(<svg\b[^>]*?)height="[\d.]+"/,`$1height="${height}"`);
  }
  return out.replace("</svg>",body.join("")+"</svg>");
}

for (const file of process.argv.slice(2)) {
  const svg = readFileSync(file, "utf8");
  writeFileSync(file, stylize(svg, basename(file).includes("dark")));
  console.log(`Styled ${file}`);
}
