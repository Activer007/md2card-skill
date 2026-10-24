import test from 'node:test';
import assert from 'node:assert/strict';
import { createFooterCases } from '../scripts/validate-footers.mjs';
import { sourceCheck } from '../scripts/validate-visual-stress.mjs';
test('all footer modes cover both a single card and an explicitly bounded sequence',async()=>{
 const all=await createFooterCases();assert.equal(all.length,12);const cases=all.filter(item=>!item.paginate);assert.equal(cases.length,8);
 for(const item of cases){const source=await sourceCheck(item);assert.equal(source.cardCount,item.cards);assert.ok(source.segments.every(segments=>segments.includes(item.footer)&&segments.includes('原创练习；提及 AI 不代表已验证内容。')));const last=source.segments[0].at(-1);if(item.footerMode==='poster'&&item.cards===1)assert.equal(last,item.footer);else assert.equal(last,item.footerMode==='series'?`01 / 0${item.cards}`:`1 / ${item.cards}`);}
});


test('poster and series include both single-final and genuine flow auto candidates',async()=>{
 const cases=(await createFooterCases()).filter(item=>item.paginate==='auto');assert.equal(cases.length,4);
 for(const item of cases){await sourceCheck(item);assert.equal(item.template,null);assert.ok(item.footer.includes('AI'));assert.deepEqual(item.outputCards,item.length==='auto-short'?[1,1]:[2,30]);}
});

test('auto footer evidence reconstructs complete original semantic pages and rejects missing atoms',async()=>{
 const {parseSemanticDocument,renderSemanticCard}=await import('../scripts/semantic.mjs');
 const {checkAutoSource}=await import('../scripts/validate-visual-stress.mjs');
 const item=(await createFooterCases()).find(item=>item.id==='auto-series-short');
 const document=parseSemanticDocument(item.source);const card=renderSemanticCard(document,document.partitions[0],document.atoms,1);
 const manifest={cards:[{provenance:card.provenance}],pagination:{validation:{status:'pass'},probes:1,limits:{probes:4000}}};
 const source=checkAutoSource(item,manifest);assert.equal(source.cardCount,1);assert.ok(source.segments[0].includes('01 / 01'));assert.ok(source.segments[0].includes(item.footer));
 const broken=structuredClone(manifest);broken.cards[0].provenance.atomIds.pop();assert.throws(()=>checkAutoSource(item,broken));
 assert.throws(()=>checkAutoSource({...item,outputCards:[2,30]},manifest),/page-count boundary/);
});
