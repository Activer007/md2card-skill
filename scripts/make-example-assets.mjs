#!/usr/bin/env node
// Original deterministic raster illustrations. No fetched images or font dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../examples/assets/', import.meta.url));
mkdirSync(root, {recursive:true});
function crc32(b) { let c=0xffffffff; for(const x of b) { c^=x; for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; }
function chunk(type,data) { const t=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4); n.writeUInt32BE(data.length); c.writeUInt32BE(crc32(Buffer.concat([t,data]))); return Buffer.concat([n,t,data,c]); }
function canvas(w,h,bg) {
 const pixels=Buffer.alloc(w*h*3);for(let i=0;i<w*h;i++)for(let k=0;k<3;k++)pixels[i*3+k]=bg[k];
 const rect=(x,y,rw,rh,color)=>{for(let yy=Math.max(0,y);yy<Math.min(h,y+rh);yy++)for(let xx=Math.max(0,x);xx<Math.min(w,x+rw);xx++)for(let k=0;k<3;k++)pixels[(yy*w+xx)*3+k]=color[k];};
 const circle=(cx,cy,r,color)=>{for(let yy=Math.max(0,cy-r);yy<Math.min(h,cy+r);yy++)for(let xx=Math.max(0,cx-r);xx<Math.min(w,cx+r);xx++)if((xx-cx)**2+(yy-cy)**2<=r*r)for(let k=0;k<3;k++)pixels[(yy*w+xx)*3+k]=color[k];};
 return {rect,circle,save(name){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)pixels.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);writeFileSync(root+name,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}};
}
const art=canvas(1200,660,[232,240,237]);
for(let x=0;x<1200;x+=40) for(let y=0;y<660;y+=40)art.circle(x,y,1,[188,209,201]);
art.rect(160,320,880,16,[112,155,140]);
for(const [x,bg] of [[110,[27,83,73]],[490,[52,112,97]],[870,[146,68,48]]]) {
 art.rect(x,180,220,300,bg);art.rect(x+30,225,100,12,[243,245,233]);
 for(let y=280;y<400;y+=34) art.rect(x+30,y,160-(y-280)/2,9,[216,229,216]);
 art.circle(x+190,450,42,[230,192,114]);
}
art.save('retrieval-pipeline.png');
const logo=canvas(128,128,[27,83,73]);logo.rect(30,28,25,72,[250,246,232]);logo.rect(55,75,45,25,[250,246,232]);logo.circle(87,39,13,[230,192,114]);logo.save('demo-logo.png');
console.log('Wrote original examples/assets PNG illustrations.');
