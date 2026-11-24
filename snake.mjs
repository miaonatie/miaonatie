// Real Snake game: each contribution cell is one food item.
// Contribution data from Platane/snk (MIT); collision-free Hamiltonian routing.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function pixelize(svg,dark,report=()=>{},runSeed=0){
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
  const originalW=Math.max(...cells.map(c=>c.x))+1,h=Math.max(...cells.map(c=>c.y))+2;
  const w=originalW+1+(originalW+1)%2,N=w*h;
  if(w<2||h<2||cells.some(c=>c.x<0||c.y<0))throw Error("Unsupported calendar dimensions");
  const id=(x,y)=>y*w+x;
  const real=new Map(cells.map(c=>[id(c.x+1,c.y+1),c.color]));
  const food=new Set([...real].filter(([,c])=>c!=="ce").map(([p])=>p));
  const neighbors=p=>{
    const x=p%w,y=Math.floor(p/w),out=[];
    if(x>0)out.push(p-1);if(x<w-1)out.push(p+1);
    if(y>0)out.push(p-w);if(y<h-1)out.push(p+w);
    return out;
  };
  // A seeded, reproducible route with safe shortcuts and a fixed home cell.
  // All themes share the same run seed; the route changes on each generation.
  const home=0;
  let seed=(2166136261^runSeed)>>>0;
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
  const candidates=[];
  for(const mx of [false,true])for(const my of [false,true])for(const reverse of [false,true]){
    const original=base.map(([x,y])=>id(mx?w-1-x:x,my?h-1-y:y));
    for(let trial=0;trial<6;trial++){
      let cycle=trial===0?[...original]:shuffledCycle(original);
      if(reverse)cycle.reverse();
      if(new Set(cycle).size!==N||cycle.some((p,i)=>!neighbors(p).includes(cycle[(i+1)%N])))throw Error("Invalid cycle");
      const states=solve(cycle,trial===0?1:6);
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
      candidates.push({states,score,signature:heads.join(',')});
    }
  }
  if(!candidates.length)throw Error("No collision-free route");
  // Several visibly different routes in one SVG. A static SVG repeats this
  // sequence, while a different run seed regenerates all the routes.
  candidates.sort((a,b)=>a.score-b.score);
  const unique=[...new Map(candidates.map(c=>[c.signature,c])).values()].sort((a,b)=>a.score-b.score);
  const chosen=[unique[0]];
  const edges=s=>new Set(s.map((v,i)=>i?v.body[0]+":"+s[i-1].body[0]:""));
  while(chosen.length<3&&chosen.length<unique.length){
    const seen=chosen.map(c=>edges(c.states));
    let top=null,topScore=-Infinity;
    for(const c of unique){
      if(chosen.includes(c))continue;
      const es=edges(c.states);
      const diff=Math.min(...seen.map(set=>[...es].filter(e=>!set.has(e)).length/Math.max(1,es.size)));
      const quality=diff*2-Math.max(0,c.score/Math.max(1,unique[0].score)-1)*0.45;
      if(quality>topScore){top=c;topScore=quality;}
    }
    chosen.push(top);
  }
  // Actual calendar is offset by one cell in x/y. Home is outside it.
  // At the end, exit left, make a short U-shaped lap above the calendar,
  // and re-enter from exactly the same outside cell. Tail retracts only
  // during this exterior lap; no sudden reset or pause.
  const start="0,-1";
  const xy=p=>[p%w,Math.floor(p/w)];
  const key=p=>p.join(",");
  const adj=(a,b)=>{const [x,y]=a.split(",").map(Number),[u,v]=b.split(",").map(Number);return Math.abs(x-u)+Math.abs(y-v)===1;};
  const frames=[];
  const reports=[];
  for(const {states:best} of chosen){
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
    frames.push({body:[start],reset:true,eaten:null});
    for(const s of best)frames.push({body:s.body.map(p=>key(xy(p))),eaten:s.eaten===null?null:key(xy(s.eaten))});
    const lap=[[-1,0],[-2,0],[-2,-1],[-2,-2]];
    const span=Math.min(w-2,Math.max(3,Math.ceil(food.size/2)-3));
    for(let x=-1;x<=span;x++)lap.push([x,-2]);
    lap.push([span,-1]);
    for(let x=span-1;x>=1;x--)lap.push([x,-1]);
    let body=best.at(-1).body.map(p=>key(xy(p)));
    const retract=Math.max(1,Math.ceil((body.length-1)/lap.length));
    for(const p of lap){
      const head=key(p);
      const size=Math.max(1,body.length-retract);
      body=[head,...body].slice(0,size);
      if(new Set(body).size!==body.length)throw Error("Exterior collision");
      frames.push({body:[...body],eaten:null});
    }
    if(body.length!==1||!adj(body[0],start))throw Error("Unclosed exterior lap");
    reports.push({moves:best.length-1,exteriorMoves:lap.length,finalLength:food.size+1});
  }
  for(let i=0;i<frames.length;i++){
    const a=frames[i],b=frames[(i+1)%frames.length];
    if(!adj(a.body[0],b.body[0]))throw Error("Discontinuous loop");
    if(new Set(a.body).size!==a.body.length)throw Error("Collision");
  }
  const tick=170,duration=frames.length*tick;
  const snake=dark?{head:"#d2a8ff",body:"#a371f7"}:{head:"#6639ba",body:"#8250df"};
  const original=new Map([...real].map(([p,c])=>[key(xy(p)),palette[c]||palette.ce]));
  const tracks=new Map(),previous=new Map();
  const positions=new Set([...original.keys(),...frames.flatMap(f=>f.body)]);
  let board;
  for(let i=0;i<frames.length;i++){
    const f=frames[i];
    if(f.reset)board=new Map(original);
    if(f.eaten!==null)board.set(f.eaten,palette.ce);
    const frame=new Map(board);
    for(const p of f.body)frame.set(p,snake.body);
    frame.set(f.body[0],snake.head);
    for(const p of positions){
      const color=frame.get(p)||"transparent";
      if(color!==previous.get(p)){
        if(!tracks.has(p))tracks.set(p,[]);
        tracks.get(p).push([i*tick,color]);
        previous.set(p,color);
      }
    }
  }
  const pct=t=>Number((100*t/duration).toFixed(7));
  let css=`/* snake-loop-v4 */.cell{shape-rendering:crispEdges;animation-duration:${duration}ms;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}@media(prefers-reduced-motion:reduce){.cell{animation:none!important}}`;
  const rects=[];
  for(const [p,track] of tracks){
    const [x,y]=p.split(",").map(Number);
    let attr="";
    if(track.length>1){
      const name="p"+rects.length;
      css+=`@keyframes ${name}{${track.map(([t,c])=>`${pct(t)}%{fill:${c}}`).join("")}100%{fill:${track[0][1]}}}`;
      attr=` style="animation-name:${name}"`;
    }
    rects.push(`<rect class="cell" x="${x*16+2}" y="${y*16+2}" width="12" height="12" fill="${track[0][1]}"${attr}/>`);
  }
  const coords=[...positions].map(p=>p.split(",").map(Number));
  const x0=Math.min(...coords.map(p=>p[0]))*16-2,y0=Math.min(...coords.map(p=>p[1]))*16-2;
  const width=(Math.max(...coords.map(p=>p[0]))+1)*16-x0+2,height=(Math.max(...coords.map(p=>p[1]))+1)*16-y0+2;
  report({routes:reports,food:food.size,start,initialLength:1,frameCount:frames.length,tick,duration,collisionFree:true,seamless:true});
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${width} ${height}" width="${width}" height="${height}"><title>Contribution snake</title><desc>${chosen.length} distinct routes; ${food.size} contribution cells; grows from 1 to ${food.size+1}; continuous exterior loop; seed ${runSeed}.</desc><style>${css}</style>${rects.join("")}</svg>`;
}

const seed = Number(process.env.SNAKE_SEED || Math.floor(Date.now()/86400000)) >>> 0;
for (const file of process.argv.slice(2)) {
  writeFileSync(file, pixelize(readFileSync(file, "utf8"), basename(file).includes("dark"), stats => console.log(file, stats), seed));
}
