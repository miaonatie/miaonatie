// Classic purple pixel snake, extended tail and slower movement.
// Uses the original Platane/snk route and synchronized contribution timing.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function pixelize(svg,dark){
  if(svg.includes("miaonatie-long-purple-snake"))return svg;
  const style=svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  const head=style?.match(/@keyframes s0\{((?:[^{}]*\{[^{}]*\})+)\}/)?.[1];
  const duration=Number(style?.match(/\.s\{[^}]*?([\d.]+)ms/)?.[1]);
  if(!head||!duration)throw Error("Missing original snake tracks");
  const keys=new Map();
  const stepCount=Math.round(duration/100);
  if(stepCount<4)throw Error("Unexpected source animation length");
  for(const m of head.matchAll(/([\d.,%\s]+)\{transform:translate\(([-\d.]+)px,\s*([-\d.]+)px\)\}/g)){
    for(const t of m[1].matchAll(/([\d.]+)%/g))keys.set(Math.round(Number(t[1])*stepCount/100),[Number(m[2]),Number(m[3])]);
  }
  if(!keys.has(0))throw Error("Missing initial frame");
  keys.set(stepCount,keys.get(0));
  const frames=[...keys].sort((a,b)=>a[0]-b[0]);
  const route=[];
  for(let i=1;i<frames.length;i++){
    const [a,p]=frames[i-1],[b,q]=frames[i];
    for(let j=a;j<b;j++){
      const f=(j-a)/(b-a);
      route.push([Math.round((p[0]+(q[0]-p[0])*f)/16)*16,Math.round((p[1]+(q[1]-p[1])*f)/16)*16]);
    }
  }
  if(route.length!==stepCount)throw Error("Incomplete route");
  const length=Math.min(8,stepCount);
  const speed=1.35,period=Math.round(duration*speed);
  const colors=dark?["#d2a8ff","#bc8cff","#a371f7"]:["#6639ba","#8250df","#986ee2"];
  const at=(i,j)=>route[((i-j)%stepCount+stepCount)%stepCount];
  const visible=route.map((_,i)=>{
    const seen=new Set();
    let n=0;
    for(let j=0;j<length;j++){
      const p=at(i,j).join(",");
      if(seen.has(p))break;
      seen.add(p);n++;
    }
    return n;
  });
  let css=`/* miaonatie-long-purple-snake */.pixel-body{animation-duration:${period}ms;animation-timing-function:steps(1,end);animation-iteration-count:infinite;shape-rendering:crispEdges}.c{shape-rendering:crispEdges;stroke:none}@media(prefers-reduced-motion:reduce){.pixel-body{animation:none!important}.c{animation:none!important}}`;
  const body=[];
  for(let j=length-1;j>=0;j--){
    const name=`pixel${j}`,track=[];
    let last="";
    for(let i=0;i<=stepCount;i++){
      const [x,y]=at(i,j),opacity=j<visible[i%stepCount]?1:0;
      const value=`transform:translate(${x}px,${y}px);opacity:${opacity}`;
      if(value!==last||i===stepCount)track.push(`${Number((i/stepCount*100).toFixed(6))}%{${value}}`);
      last=value;
    }
    css+=`@keyframes ${name}{${track.join("")}}`;
    const [x,y]=at(0,j),color=j===0?colors[0]:j<4?colors[1]:colors[2];
    body.push(`<rect class="pixel-body" x="2" y="2" width="12" height="12" fill="${color}" style="animation-name:${name};transform:translate(${x}px,${y}px);opacity:${j<visible[0]?1:0}"/>`);
  }
  let next=style.replace(/@keyframes s\d+\{(?:[^{}]*\{[^{}]*\})+\}/g,"").replace(/\.s(?:\.s\d+)?\{[^}]*\}/g,"").replace(new RegExp(`${duration}ms`,"g"),`${period}ms`);
  let out=svg.replace(/<style>[\s\S]*?<\/style>/,`<style>${next}${css}</style>`).replace(/<rect\b[^>]*class="s s\d+"[^>]*\/>/g,"").replace(/<rect\b[^>]*class="u u\d+"[^>]*\/>/g,"").replace(/(<rect class="c(?: [^"]+)?")([^>]*?)\/>/g,(_,a,b)=>a+b.replace(/\s+r[xy]="[^"]*"/g,"")+"/>");
  const bounds=out.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  if(bounds){
    const [,x,y,w,h]=bounds.map(Number);
    const bottom=Math.max(112,...route.map(p=>p[1]+16));
    const height=Math.min(h,Math.ceil(bottom-y+4));
    out=out.replace(bounds[0],`viewBox="${x} ${y} ${w} ${height}"`).replace(/(<svg\b[^>]*?)height="[\d.]+"/,`$1height="${height}"`);
  }
  return out.replace("</svg>",body.join("")+"</svg>");
}

for (const file of process.argv.slice(2)) {
  writeFileSync(file, pixelize(readFileSync(file, "utf8"), basename(file).includes("dark")));
  console.log(`Rendered long purple pixel snake: ${file}`);
}
