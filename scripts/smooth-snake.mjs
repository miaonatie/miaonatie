// Real Snake game: each contribution cell is one food item.
// Contribution data from Platane/snk (MIT); collision-free Hamiltonian routing.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function pixelize(svg,dark,report=()=>{}){
  // Read real contribution levels from Platane/snk, not its fixed-length route.
  const style=svg.match(/<style>([\s\S]*?)<\/style>/)?.[1]||"";
  const root=style.match(/:root\{([^}]+)\}/)?.[1]||"";
  const palette=Object.fromEntries([...root.matchAll(/--(c[0-4]|ce):([^;}\s]+)/g)].map(m=>[m[1],m[2]]));
  const levels=new Map([...style.matchAll(/\.c\.(c[\da-z]+)\{fill:var\(--(c[1-4])\)/g)].map(m=>[m[1],m[2]]));
  const cells=[];
  for(const m of svg.matchAll(/<rect\b[^>]*class="c(?: ([^"]+))?"[^>]*\/>/g)){
    const x=Number(m[0].match(/\bx="(-?\d+(?:\.\d+)?)"/)?.[1]),y=Number(m[0].match(/\by="(-?\d+(?:\.\d+)?)"/)?.[1]);
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error("Invalid contribution coordinate");
    const color=m[1]?levels.get(m[1]):null;
    if(m[1]&&!color)throw Error("Unknown contribution level: "+m[1]);
    cells.push({x:Math.round((x-2)/16),y:Math.round((y-2)/16),color:color||"ce"});
  }
  if(!cells.length||!palette.ce)throw Error("Missing contribution calendar");
  const originalW=Math.max(...cells.map(c=>c.x))+1,h=Math.max(...cells.map(c=>c.y))+1;
  const w=originalW+originalW%2+(cells.filter(c=>c.color!=="ce").length=== (originalW+originalW%2)*h?2:0),N=w*h;
  if(w<2||h<2||cells.some(c=>c.x<0||c.y<0))throw Error("Unsupported calendar dimensions");
  const id=(x,y)=>y*w+x;
  const real=new Map(cells.map(c=>[id(c.x,c.y),c.color]));
  const food=new Set([...real].filter(([,c])=>c!=="ce").map(([p])=>p));
  const neighbors=p=>{
    const x=p%w,y=Math.floor(p/w),out=[];
    if(x>0)out.push(p-1);if(x<w-1)out.push(p+1);
    if(y>0)out.push(p-w);if(y<h-1)out.push(p+w);
    return out;
  };
  // A seeded, reproducible route with safe shortcuts and a fixed home cell.
  // Daily changes in the contribution calendar also change the random seed.
  const home=0;
  let seed=2166136261;
  for(const p of food)seed=Math.imul(seed^p,16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const base=[];
  for(let x=0;x<w;x++)base.push([x,0]);
  for(let x=w-1;x>=0;x--){
    if((w-1-x)%2===0){for(let y=1;y<h;y++)base.push([x,y]);}
    else{for(let y=h-1;y>=1;y--)base.push([x,y]);}
  }
  function shuffledCycle(cycle){
    // Randomly exchange opposite edges of 2x2 squares, keeping one closed cycle.
    const adj=Array.from({length:N},()=>new Set());
    const link=(a,b)=>{adj[a].add(b);adj[b].add(a);};
    const unlink=(a,b)=>{adj[a].delete(b);adj[b].delete(a);};
    for(let i=0;i<N;i++)link(cycle[i],cycle[(i+1)%N]);
    function trace(){
      const route=[home];let prev=-1,cur=home;
      while(route.length<N){
        const next=[...adj[cur]].find(p=>p!==prev);
        if(next===undefined||next===home)return null;
        route.push(next);prev=cur;cur=next;
      }
      return adj[cur].has(home)?route:null;
    }
    for(let i=0;i<N*2;i++){
      const x=Math.floor(random()*(w-1)),y=Math.floor(random()*(h-1));
      const a=id(x,y),b=id(x+1,y),c=id(x,y+1),d=id(x+1,y+1);
      let old,fresh;
      if(adj[a].has(b)&&adj[c].has(d)&&!adj[a].has(c)&&!adj[b].has(d)){old=[[a,b],[c,d]];fresh=[[a,c],[b,d]];}
      else if(adj[a].has(c)&&adj[b].has(d)&&!adj[a].has(b)&&!adj[c].has(d)){old=[[a,c],[b,d]];fresh=[[a,b],[c,d]];}
      else continue;
      old.forEach(e=>unlink(...e));fresh.forEach(e=>link(...e));
      if(!trace()){fresh.forEach(e=>unlink(...e));old.forEach(e=>link(...e));}
    }
    return trace()||cycle;
  }
  function solve(cycle,noise){
    const pos=new Map(cycle.map((p,i)=>[p,i]));
    const distance=(a,b)=>(pos.get(b)-pos.get(a)+N)%N;
    const manhattan=(a,b)=>Math.abs(a%w-b%w)+Math.abs(Math.floor(a/w)-Math.floor(b/w));
    const left=new Set(food),body=[home],states=[{body:[home],eaten:null}];
    while(left.size||body[0]!==home){
      const head=body[0],tail=body.at(-1);
      const free=distance(head,tail)||N;
      let target=home,limit=N;
      for(const p of left){const d=distance(head,p)||N;if(d<limit){limit=d;target=p;}}
      if(!left.size)limit=distance(head,home)||N;
      const choices=neighbors(head).map(p=>({p,d:distance(head,p)}))
        .filter(({p,d})=>d>0&&d<=limit&&(d<free||(d===free&&!left.has(p)))&&(!body.includes(p)||(p===tail&&!left.has(p))));
      // Prefer the next food, but occasionally choose another legal turn.
      const previous=states.length>1?states.at(-2).body[0]:-1;
      for(const c of choices)c.score=c.d*0.12-manhattan(c.p,target)*1.6+(left.has(c.p)?6:0)+(previous>=0&&c.p-head!==head-previous?0.25:0)+random()*noise;
      const chosen=choices.sort((a,b)=>b.score-a.score)[0];
      if(!chosen)return null;
      const p=chosen.p,grow=left.delete(p);
      if(!grow)body.pop();
      body.unshift(p);
      if(new Set(body).size!==body.length)throw Error("Self collision");
      states.push({body:[...body],eaten:grow?p:null});
      if(states.length>N*(food.size+3))return null;
    }
    return states;
  }
  let best=null,bestScore=Infinity;
  for(const mx of [false,true])for(const my of [false,true])for(const reverse of [false,true]){
    const original=base.map(([x,y])=>id(mx?w-1-x:x,my?h-1-y:y));
    for(let trial=0;trial<8;trial++){
      let cycle=trial===0?[...original]:shuffledCycle(original);
      if(reverse)cycle.reverse();
      if(new Set(cycle).size!==N||cycle.some((p,i)=>!neighbors(p).includes(cycle[(i+1)%N])))throw Error("Invalid cycle");
      const states=solve(cycle,trial===0?0:2.5);
      if(!states)continue;
      const heads=states.map(s=>s.body[0]);
      let turns=0,longest=0,run=0,last=null;
      for(let i=1;i<heads.length;i++){
        const dir=heads[i]-heads[i-1];
        if(dir===last)run++;else{if(last!==null)turns++;run=1;last=dir;}
        longest=Math.max(longest,run);
      }
      // Select a compact route with varied turns rather than a rigid column sweep.
      const score=states.length+Math.max(0,longest-15)*0.35-Math.min(turns,states.length/3)*0.15;
      if(score<bestScore){best=states;bestScore=score;}
    }
  }
  if(!best)throw Error("No collision-free route");
  // Validate true Snake rules, including growth only after eating and one-cell moves.
  const remaining=new Set(food);
  for(let i=0;i<best.length;i++){
    const {body,eaten}=best[i];
    if(new Set(body).size!==body.length)throw Error("Overlapping body");
    if(i){
      const previous=best[i-1].body;
      if(!neighbors(previous[0]).includes(body[0]))throw Error("Non-adjacent move");
      const grow=remaining.delete(body[0]);
      if((grow?body[0]:null)!==eaten||body.length!==previous.length+Number(grow))throw Error("Incorrect growth");
      if(body.slice(1).some((p,j)=>p!==previous[j]))throw Error("Incorrect tail motion");
    }
  }
  if(remaining.size||best[0].body[0]!==home||best.at(-1).body[0]!==home||best[0].body.length!==1||best.at(-1).body.length!==food.size+1)throw Error("Incomplete game");
  const tick=180,intro=2000,pause=900,duration=intro+Math.max(1,best.length-1)*tick+pause;
  const snake=dark?{head:"#d2a8ff",body:"#a371f7"}:{head:"#6639ba",body:"#8250df"};
  const bg=p=>real.has(p)?(palette[real.get(p)]||palette.ce):"transparent";
  const board=Array.from({length:N},(_,p)=>bg(p));
  const tracks=Array.from({length:N},()=>[]);
  const previous=Array(N).fill(null);
  for(let i=0;i<best.length;i++){
    const {body,eaten}=best[i];
    if(eaten!==null)board[eaten]=palette.ce;
    const frame=[...board];
    for(const p of body)frame[p]=snake.body;
    frame[body[0]]=snake.head;
    for(let p=0;p<N;p++)if(frame[p]!==previous[p]){
      tracks[p].push([i===0?0:intro+i*tick,frame[p]]);
      previous[p]=frame[p];
    }
  }
  const pct=t=>Number((100*t/duration).toFixed(6));
  let css=`/* miaonatie-growing-purple-snake-v3 */.cell{shape-rendering:crispEdges;animation-duration:${duration}ms;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}@media(prefers-reduced-motion:reduce){.cell{animation:none!important}}`;
  const rects=[];
  for(let p=0;p<N;p++){
    const track=tracks[p];
    if(!real.has(p)&&track.every(([,c])=>c==="transparent"))continue;
    let attr="";
    if(track.length>1){
      const name="p"+p;
      css+=`@keyframes ${name}{${track.map(([t,c])=>`${pct(t)}%{fill:${c}}`).join("")}100%{fill:${track[0][1]}}}`;
      attr=` style="animation-name:${name}"`;
    }
    rects.push(`<rect class="cell" x="${p%w*16+2}" y="${Math.floor(p/w)*16+2}" width="12" height="12" fill="${track[0][1]}"${attr}/>`);
  }
  const width=w*16+8,height=h*16+8;
  report({start:best[0].body[0],end:best.at(-1).body[0],introMs:intro,tickMs:tick,food:food.size,startLength:best[0].body.length,finalLength:best.at(-1).body.length,moves:best.length-1,duration,collisionFree:true});
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${width} ${height}" width="${width}" height="${height}"><title>Growing contribution snake</title><desc>A purple snake grows one square per contribution day and returns to the upper-left corner. Contribution data from Platane/snk. ${food.size} food cells; final length ${food.size+1}.</desc><style>${css}</style>${rects.join("")}</svg>`;
}

for (const file of process.argv.slice(2)) {
  writeFileSync(file, pixelize(readFileSync(file, "utf8"), basename(file).includes("dark"), stats => console.log(file, stats)));
}
