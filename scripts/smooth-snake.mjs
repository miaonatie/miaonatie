// Classic pixel-grid rendering on top of Platane/snk (MIT).
// Preserve the original routes and contribution-eating timing.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function pixelize(svg,dark){
  if(svg.includes("miaonatie-pixel-snake"))return svg;
  const style=svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if(!style)throw Error("Missing SVG styles");
  const blocks=[...style.matchAll(/@keyframes (s\d+)\{((?:[^{}]*\{[^{}]*\})+)\}/g)];
  if(!blocks.length)throw Error("Missing original snake tracks");
  let next=style;
  const colors=dark?["#79c0ff","#58a6ff","#388bfd","#1f6feb"]:["#0969da","#218bff","#54aeff","#80ccff"];
  for(const [full,name,inner] of blocks){
    const points=new Map();
    for(const m of inner.matchAll(/([\d.,%\s]+)\{transform:translate\(([-\d.]+)px,\s*([-\d.]+)px\)\}/g)){
      for(const t of m[1].matchAll(/([\d.]+)%/g))points.set(Number(t[1]),[Number(m[2]),Number(m[3])]);
    }
    if(!points.has(0))throw Error("Missing initial frame "+name);
    if(!points.has(100))points.set(100,points.get(0));
    const keys=[...points].sort((a,b)=>a[0]-b[0]);
    const frames=[];
    for(let i=0;i<keys.length-1;i++){
      const [t,a]=keys[i],[u,b]=keys[i+1];
      const n=Math.max(1,Math.round(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/16));
      for(let j=0;j<n;j++){
        const f=j/n,p=t+(u-t)*f;
        const x=Math.round((a[0]+(b[0]-a[0])*f)/16)*16,y=Math.round((a[1]+(b[1]-a[1])*f)/16)*16;
        frames.push(`${Number(p.toFixed(5))}%{transform:translate(${x}px,${y}px)}`);
      }
    }
    const end=keys.at(-1)[1];frames.push(`100%{transform:translate(${end[0]}px,${end[1]}px)}`);
    next=next.replace(full,`@keyframes ${name}{${frames.join("")}}`);
  }
  next+=`/* miaonatie-pixel-snake */.s{animation-timing-function:steps(1,end);shape-rendering:crispEdges}.c{shape-rendering:crispEdges;stroke:none}.s.s0{fill:${colors[0]}}.s.s1{fill:${colors[1]}}.s.s2{fill:${colors[2]}}.s.s3{fill:${colors[3]}}@media(prefers-reduced-motion:reduce){.s{display:none}.c{animation:none!important}}`;
  let out=svg.replace(/<style>[\s\S]*?<\/style>/,`<style>${next}</style>`).replace(/<rect\b[^>]*class="s s(\d+)"[^>]*\/>/g,(_,i)=>`<rect class="s s${i}" x="2" y="2" width="12" height="12"/>`).replace(/<rect\b[^>]*class="u u\d+"[^>]*\/>/g,"").replace(/(<rect class="c(?: [^"]+)?")([^>]*?)\/>/g,(_,a,b)=>a+b.replace(/\s+r[xy]="[^"]*"/g,"")+"/>");
  // Keep the extra top/bottom travel lanes; remove the unused score bar.
  const bounds=out.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
  if(bounds){
    const [,x,y,w,h]=bounds.map(Number);
    const bottom=Math.max(112,...blocks.flatMap(b=>[...b[2].matchAll(/translate\([-\d.]+px,\s*([-\d.]+)px\)/g)].map(m=>Number(m[1])+16)));
    const height=Math.min(h,Math.ceil(bottom-y+4));
    out=out.replace(bounds[0],`viewBox="${x} ${y} ${w} ${height}"`).replace(/(<svg\b[^>]*?)height="[\d.]+"/,`$1height="${height}"`);
  }
  return out;
}

for (const file of process.argv.slice(2)) {
  writeFileSync(file, pixelize(readFileSync(file, "utf8"), basename(file).includes("dark")));
  console.log(`Rendered pixel snake: ${file}`);
}
