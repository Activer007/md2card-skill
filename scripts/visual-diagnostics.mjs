// Advisory geometry only. No pagination prediction, OCR, rewriting or acceptance.
import { getTemplate, resolveTemplateAspect } from './templates.mjs';

export const VISUAL_LIMITS = Object.freeze({ nodes: 40000, rectangles: 20000, cardRectangles: 1024, depth: 64 });
const freeze = value => { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
export const RULES = freeze({
  'VD-01': { name: 'Title/body gap', threshold: { minPx: 8, maxTitleLineHeights: 1.5, maxFloorPx: 96 }, exceptions: ['side-by-side', 'intervening-image', 'intervening-metric', 'photography', 'photo-cover'], advice: 'Review the located title/body spacing at output size; adjust authored structure only after review. Do not shrink text automatically.' },
  'VD-02': { name: 'Four horizontal bands', threshold: { sparseBandAreaRatio: 0.08, sparseBands: 2 }, exceptions: ['photography', 'book-excerpt', 'short-declaration', 'cover', 'quote-layout'], advice: 'Review distribution across the four content bands. Intentional whitespace is valid; do not add invented filler or remove sources.' },
  'VD-03': { name: 'Lower whitespace', threshold: { blankHeightRatio: 0.25 }, exceptions: ['photography', 'book-excerpt', 'short-declaration', 'cover', 'quote-layout'], advice: 'Inspect the marked lower blank region and the complete card. Keep intentional whitespace; consider an author-approved manual boundary only if useful.' },
  'VD-04': { name: 'Screenshot painted area', threshold: { minCardAreaRatio: 0.20, minContentWidthRatio: 0.55 }, exceptions: ['non-screenshot', 'no-image'], advice: 'Inspect screenshot text at final viewing size. Consider a larger complete image or author-supplied detail on another card; do not crop or remove context automatically.' },
  'VD-05': { name: 'Consecutive composition', threshold: { consecutiveCards: 2 }, exceptions: ['table-continuation', 'auto-pagination'], advice: 'Review the listed consecutive cards for intentional continuity. Repetition is informational; do not switch templates or insert a CTA automatically.' },
  'VD-06': { name: 'Text on image', threshold: { overlapAreaPx2: 0 }, exceptions: ['no-image', 'no-dom-overlay'], advice: 'A person must inspect local contrast, subject obstruction and any text embedded in the raster. Geometry and a backing color do not establish readability.' }
});

/** Same decoded Chromium document as the mandatory overflow measurement. CSS px, card-local. */
export async function collectVisualGeometry(page) {
  return page.locator('.card').evaluateAll((cards, limits) => {
    let nodes = 0, rectangles = 0;
    return cards.map((card, index) => {
      const origin = card.getBoundingClientRect(), elements = [], exclusions = { hidden: 0, decorativeImages: 0 };
      const box = r => ({ x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height });
      const cardBox = { x: 0, y: 0, width: origin.width, height: origin.height };
      const intersect = (a, b) => { const x = Math.max(a.x,b.x), y = Math.max(a.y,b.y); return { x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y) }; };
      const stateCache = new WeakMap(), childIndexes = new WeakMap();
      const childIndex = el => {
        if (!childIndexes.has(el.parentElement)) childIndexes.set(el.parentElement,new Map(Array.from(el.parentElement.children,(child,i)=>[child,i+1])));
        return childIndexes.get(el.parentElement).get(el);
      };
      const state = el => {
        if (!el || el === card.parentElement) return { visible: true, clip: cardBox, depth: 0, selector: '' };
        if (stateCache.has(el)) return stateCache.get(el);
        const parent = state(el.parentElement), style = getComputedStyle(el), rect = box(el.getBoundingClientRect());
        const depth = parent.depth + 1;
        let clip = parent.clip;
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) clip = intersect(clip,{...cardBox,x:rect.x,width:rect.width});
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) clip = intersect(clip,{...cardBox,y:rect.y,height:rect.height});
        const selector = el === card ? `.card:nth-of-type(${index+1})` : `${parent.selector}>${el.tagName.toLowerCase()}:nth-child(${childIndex(el)})`;
        const transformed = parent.transformed || style.transform !== 'none' ||
          ['rotate','scale','translate'].some(name => style[name] && style[name] !== 'none') ||
          (style.zoom && style.zoom !== 'normal' && Number(style.zoom) !== 1);
        const result = { visible: parent.visible && !el.hidden && el.getAttribute('aria-hidden') !== 'true' && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) !== 0, clip, depth, selector, style, transformed };
        stateCache.set(el,result); return result;
      };
      let complete = true, reason = null;
      const stop = why => { complete = false; reason = why; };
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (nodes >= limits.nodes || rectangles >= limits.rectangles) { stop('deck-collection-budget'); break; }
        nodes++;
        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        // Bound depth before recursive style/clip lookup.
        let depth = 0; for (let p=el;p && p!==card;p=p.parentElement) { if (++depth>limits.depth) break; }
        if (depth > limits.depth) { stop('element-depth-budget'); break; }
        const s = state(el); if (!s.visible) { exclusions.hidden++; continue; }
        const role = el.closest('.card-footer') ? 'footer' : el.closest('.card-source') ? 'source' : el.closest('h1') ? 'title' : el.closest('.card-eyebrow') ? 'eyebrow' : el.closest('figcaption') ? 'caption' : el.closest('.template-metric,.statistic-block') ? 'metric' : 'content';
        const add = (rect, extra) => {
          if (rectangles >= limits.rectangles || elements.length >= limits.cardRectangles) { stop('rectangle-budget'); return; }
          const bbox = intersect(rect,s.clip);
          if (bbox.width > 0 && bbox.height > 0) { rectangles++; elements.push({ id:`c${index+1}-e${elements.length+1}`, selector:s.selector, role, tag:el.tagName.toLowerCase(), bbox, ...extra }); }
        };
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() && !el.closest('script,style')) {
          if (s.transformed) { stop('transformed-geometry-not-supported'); break; }
          const range = document.createRange();
          range.setStart(node,node.textContent.search(/\S/u)); range.setEnd(node,node.textContent.trimEnd().length);
          for (const r of range.getClientRects()) { add(box(r),{ kind:'text', fontSize:parseFloat(s.style.fontSize), lineHeight:parseFloat(s.style.lineHeight)||parseFloat(s.style.fontSize)*1.2 }); if (!complete) break; }
        } else if (el.tagName === 'IMG' && node.nodeType === Node.ELEMENT_NODE) {
          if (el.getAttribute('role') === 'presentation' || role === 'footer') { exclusions.decorativeImages++; continue; }
          if (s.transformed) { stop('transformed-geometry-not-supported'); break; }
          const raw = box(el.getBoundingClientRect()), st = s.style;
          const left = parseFloat(st.borderLeftWidth)+parseFloat(st.paddingLeft), top = parseFloat(st.borderTopWidth)+parseFloat(st.paddingTop);
          const frame = { x:raw.x+left,y:raw.y+top,width:raw.width-left-parseFloat(st.borderRightWidth)-parseFloat(st.paddingRight),height:raw.height-top-parseFloat(st.borderBottomWidth)-parseFloat(st.paddingBottom) };
          const nw=el.naturalWidth, nh=el.naturalHeight;
          if (!nw || !nh || frame.width<=0 || frame.height<=0) { stop('image-geometry-unavailable'); break; }
          if (['absolute','fixed'].includes(st.position) && raw.width*raw.height >= origin.width*origin.height*.9 && !el.matches('.card-image') && !el.closest('figure')) { exclusions.decorativeImages++; continue; }
          let w=frame.width,h=frame.height;
          if (['contain','cover','scale-down','none'].includes(st.objectFit)) {
            const scale = st.objectFit==='none'?1:st.objectFit==='cover'?Math.max(w/nw,h/nh):Math.min(w/nw,h/nh,st.objectFit==='scale-down'?1:Infinity);
            w=nw*scale;h=nh*scale;
          }
          const position=st.objectPosition.split(/\s+/);
          const offset=(token,free)=>token?.endsWith('%')?parseFloat(token)*free/100:token?.endsWith('px')?parseFloat(token):NaN;
          const dx=offset(position[0],frame.width-w),dy=offset(position[1],frame.height-h);
          if (![dx,dy].every(Number.isFinite)) { stop('object-position-not-supported'); break; }
          add(intersect(frame,{x:frame.x+dx,y:frame.y+dy,width:w,height:h}),{kind:'image',role:'image',objectFit:st.objectFit,objectPosition:st.objectPosition,natural:{width:nw,height:nh},frame});
        }
        if (!complete) break;
      }
      return { index:index+1, complete, incompleteReason:reason, card:cardBox, content:box(card.querySelector('.card-content').getBoundingClientRect()), footer:box(card.querySelector('.card-footer').getBoundingClientRect()), elements, exclusions, collection:{deckNodes:nodes,deckRectangles:rectangles} };
    });
  }, VISUAL_LIMITS);
}

export function intersect(a,b) { const x=Math.max(a.x,b.x), y=Math.max(a.y,b.y); return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)}; }
const area = r => r.width*r.height;
const bottom = r => r.y+r.height;
const bounds = rects => rects.length ? { x:Math.min(...rects.map(r=>r.x)), y:Math.min(...rects.map(r=>r.y)), width:Math.max(...rects.map(r=>r.x+r.width))-Math.min(...rects.map(r=>r.x)), height:Math.max(...rects.map(bottom))-Math.min(...rects.map(r=>r.y)) } : null;

/** Exact rectangle union, O(n log n), so nested/overlapping ink boxes are not counted twice. */
export function unionArea(rects) {
  const rs=rects.filter(r=>r.width>0&&r.height>0); if (!rs.length) return 0;
  const ys=[...new Set(rs.flatMap(r=>[r.y,bottom(r)]))].sort((a,b)=>a-b), yi=new Map(ys.map((y,i)=>[y,i]));
  const events=rs.flatMap(r=>[[r.x,1,yi.get(r.y),yi.get(bottom(r))-1],[r.x+r.width,-1,yi.get(r.y),yi.get(bottom(r))-1]]).sort((a,b)=>a[0]-b[0]);
  const count=new Int32Array(ys.length*4), length=new Float64Array(ys.length*4);
  const update=(n,l,r,a,b,d)=>{ if(a<=l&&r<=b)count[n]+=d;else{const m=(l+r)>>1;if(a<=m)update(n*2,l,m,a,b,d);if(b>m)update(n*2+1,m+1,r,a,b,d);}length[n]=count[n]>0?ys[r+1]-ys[l]:l===r?0:length[n*2]+length[n*2+1]; };
  let result=0,last=events[0][0];for(const [x,d,a,b] of events){result+=length[1]*(x-last);update(1,0,ys.length-2,a,b,d);last=x;}return result;
}

function contextFor(card,options) {
  const m=card.metadata, t=m.template?getTemplate(m.template):null;
  const ratio=options.width/options.height;
  const aspect=t?resolveTemplateAspect(t.id,options).id:Math.abs(ratio-.75)<=.002?'portrait':Math.abs(ratio-1)<=.002?'square':Math.abs(ratio-16/9)<=.002?'slide':`custom-${options.width}x${options.height}`;
  const composition=t?.aspectLayouts?.[aspect]?.composition??t?.composition??m.layout??'explainer';
  let whitespace=null;
  if(m.visualVariant==='photo-cover'||['T37','T38','T39','T40'].includes(t?.id))whitespace='photography';
  else if(['T25','T29','T30'].includes(t?.id))whitespace='book-excerpt';
  else if(t?.id==='T13')whitespace='short-declaration';
  else if(m.layout==='quote'||t?.layout==='quote')whitespace='quote-layout';
  else if(m.layout==='cover'||t?.layout==='cover')whitespace='cover';
  return {template:t?.id??null,family:t?.family??null,composition,aspect,variant:m.visualVariant??'default',whitespace};
}

export function buildVisualDiagnostics({screen,print,cards,options,inputSha256}) {
  const contexts=cards.map(c=>contextFor(c,options));
  const results=[];
  for(const [media,geometry] of Object.entries({screen,print})) for(const [i,g] of geometry.entries()) {
    const context=contexts[i], card=cards[i], checks=[];
    const emit=(id,status,measured,evidence=[],exception=null,severity='INFO')=>checks.push({ruleId:id,ruleVersion:1,...RULES[id],status,severity,measured,exception,evidence});
    if(!g.complete) {
      for(const id of Object.keys(RULES))emit(id,'not-evaluated',{reason:g.incompleteReason});
    } else {
      const text=g.elements.filter(e=>e.kind==='text'), titles=text.filter(e=>e.role==='title'), body=text.filter(e=>e.role==='content'), images=g.elements.filter(e=>e.kind==='image');
      const titleBox=bounds(titles.map(e=>e.bbox)), first=body[0], gap=titleBox&&first?first.bbox.y-bottom(titleBox):null;
      let gapException=card.metadata.visualVariant==='photo-cover'?'photo-cover':null;
      if(titleBox&&first&&intersect({...titleBox,y:first.bbox.y,height:first.bbox.height},first.bbox).width===0)gapException='side-by-side';
      if(titleBox&&first&&images.some(e=>e.bbox.y>=bottom(titleBox)&&bottom(e.bbox)<=first.bbox.y))gapException='intervening-image';
      const gapThreshold=RULES['VD-01'].threshold;
      const maxGap=Math.max(gapThreshold.maxFloorPx,...titles.map(e=>e.lineHeight*gapThreshold.maxTitleLineHeights));
      if(gap>maxGap&&context.whitespace==='photography')gapException='photography';
      if(titleBox&&first&&gap>maxGap&&text.some(e=>e.role==='metric'&&e.bbox.y<first.bbox.y&&bottom(e.bbox)>bottom(titleBox)))gapException='intervening-metric';
      const badGap=gap!==null&&(gap<gapThreshold.minPx||gap>maxGap);
      emit('VD-01',gap===null?'not-applicable':gapException?'excepted':badGap?'attention':'within-reference',{gapPx:gap,maxGapPx:maxGap,titleRowPositionsPx:[...new Set(titles.map(e=>e.bbox.y))],titleRectangles:titles.length},[...titles.map(e=>e.id),...(first?[first.id]:[])],gapException,badGap&&!gapException?'WARN':'INFO');
      const foreground=g.elements.filter(e=>!['source','footer'].includes(e.role));
      const bands=Array.from({length:4},(_,j)=>{
        const bbox={...g.content,y:g.content.y+g.content.height*j/4,height:g.content.height/4};
        return {index:j+1,bbox,foregroundAreaRatio:unionArea(foreground.map(e=>intersect(e.bbox,bbox)))/area(bbox),textAreaRatio:unionArea(foreground.filter(e=>e.kind==='text').map(e=>intersect(e.bbox,bbox)))/area(bbox)};
      });
      const sparse=bands.filter(b=>b.foregroundAreaRatio<RULES['VD-02'].threshold.sparseBandAreaRatio).length>=RULES['VD-02'].threshold.sparseBands;
      emit('VD-02',sparse?(context.whitespace?'excepted':'attention'):'within-reference',{bands},foreground.map(e=>e.id),sparse?context.whitespace:null);
      const end=Math.max(g.content.y,...foreground.map(e=>bottom(intersect(e.bbox,g.content))));
      const blank=Math.max(0,bottom(g.content)-end), low=blank/g.content.height>RULES['VD-03'].threshold.blankHeightRatio;
      emit('VD-03',low?(context.whitespace?'excepted':'attention'):'within-reference',{blankHeightPx:blank,blankHeightRatio:blank/g.content.height,bbox:{...g.content,y:end,height:blank}},foreground.map(e=>e.id),low?context.whitespace:null,low&&!context.whitespace?'WARN':'INFO');
      const screenshot=context.template==='T20'||card.metadata.imageRole==='screenshot';
      const sizes=images.map(e=>({id:e.id,paintedAreaPx2:area(e.bbox),cardAreaRatio:area(e.bbox)/area(g.card),contentWidthRatio:e.bbox.width/g.content.width,frame:e.frame,painted:e.bbox}));
      const small=sizes.some(s=>s.cardAreaRatio<RULES['VD-04'].threshold.minCardAreaRatio||s.contentWidthRatio<RULES['VD-04'].threshold.minContentWidthRatio);
      emit('VD-04',!images.length||!screenshot?'not-applicable':small?'attention':'within-reference',{images:sizes},images.map(e=>e.id),!images.length?'no-image':!screenshot?'non-screenshot':null,screenshot&&small?'WARN':'INFO');
      const key=c=>[c.family,c.composition,c.aspect,c.variant].join('/');
      let start=i,endIndex=i;while(start>0&&key(contexts[start-1])===key(context))start--;while(endIndex+1<contexts.length&&key(contexts[endIndex+1])===key(context))endIndex++;
      const repeated=endIndex-start+1>=RULES['VD-05'].threshold.consecutiveCards, tables=text.some(e=>['td','th'].includes(e.tag)), repeatException=options.paginate==='auto'?'auto-pagination':tables?'table-continuation':null;
      emit('VD-05',repeated?(repeatException?'excepted':'attention'):'within-reference',{consecutiveCards:endIndex-start+1,cardIndexes:Array.from({length:endIndex-start+1},(_,j)=>start+j+1),identity:key(context)},[],repeated?repeatException:null);
      const overlays=text.filter(e=>images.some(img=>area(intersect(e.bbox,img.bbox))>RULES['VD-06'].threshold.overlapAreaPx2));
      const onMedia=overlays.length>0||card.metadata.visualVariant==='photo-cover';
      emit('VD-06',onMedia?'human-review-required':'not-applicable',{overlappingTextRectangles:overlays.length,imageCount:images.length,rasterTextRecognition:'not-performed'},[...overlays.map(e=>e.id),...images.map(e=>e.id)],!images.length?'no-image':!onMedia?'no-dom-overlay':null,onMedia?'WARN':'INFO');
    }
    results.push({index:i+1,media,...context,sourceLines:card.sourceLines,geometry:g,checks});
  }
  return {schemaVersion:1,ruleSetVersion:'1.0.1',kind:'advisory-visual-diagnostics',inputSha256,coordinateSystem:'card-local CSS pixels; actual Chromium Range rectangles and painted raster boxes',automatedOnly:true,humanVisualReview:'not-performed',safetyGates:'Existing screen/print overflow must pass before this report is published; this report cannot waive safety gates.',collectionLimits:VISUAL_LIMITS,limitations:['Text rectangles approximate line area, not glyph ink or perceived balance.','CSS backgrounds, shadows, pseudo-elements and empty containers are excluded; decoration and their occlusion can be missed.','Raster text, subjects, contrast and reading order need human inspection.','Whitespace thresholds are advisory references, not universal visual acceptance criteria.','Complex transforms/object-position or exhausted collection budgets are not evaluated.'],cards:results};
}
