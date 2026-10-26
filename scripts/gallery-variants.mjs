// Presentation of exact archived fixtures, not another template/capability registry.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateTemplateMetadata, TEMPLATE_ASPECTS } from './templates.mjs';

export const VARIANT_EVIDENCE = 'docs/gallery-variants.json';
export const VARIANT_EVIDENCE_SHA256 = 'b58b91bd2629e89cdcaf7cb693f828885d3b9dfbafc8bca3ccfc6b8c276944c1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const PHOTO_FIELDS = ['visualVariant','imageRole','mediaFit','focalX','focalY','textZone','mediaTone','subjectSafety'];
const parseInput = bytes => {
  const text = bytes.toString('utf8'), match = /^<!-- card: (.+) -->\r?\n/.exec(text);
  assert.ok(match, 'Variant example requires explicit card metadata');
  return { metadata: JSON.parse(match[1]), body: text.slice(match[0].length) };
};

export async function buildVariantEvidence(items, readRepoFile) {
  const files = new Set([VARIANT_EVIDENCE]);
  const checked = async record => {
    files.add(record.file);
    const bytes = await readRepoFile(record.file);
    assert.equal(sha(bytes), record.sha256, `GALLERY_VARIANT_INVALID: ${record.file} SHA-256 differs`);
    if (record.bytes !== undefined) assert.equal(bytes.length, record.bytes, `Variant artifact size differs: ${record.file}`);
    return bytes;
  };
  const spec = JSON.parse(await checked({file:VARIANT_EVIDENCE,sha256:VARIANT_EVIDENCE_SHA256}));
  assert.equal(spec.schemaVersion,1); assert.equal(spec.maintainerApproval,'pending');
  const entries=[];
  for (const entry of spec.entries) {
    const template=items.find(item=>item.id===entry.template);
    assert.ok(template, `Variant references unknown template ${entry.template}`);
    // A future template version needs fresh evidence; never inherit these pixels.
    assert.equal(template.version,entry.templateVersion,`${entry.template}: variant evidence version differs`);
    const origin=JSON.parse(await checked(entry.origin));
    assert.deepEqual(origin.archive,entry.archive);
    await checked(entry.reviewDocument);
    const report=JSON.parse(await checked(entry.report)), review=JSON.parse(await checked(entry.visualReview));
    assert.equal(entry.report.sha256,origin.reportSha256??origin.automatedReportSha256);
    if (origin.visualReviewSha256) assert.equal(entry.visualReview.sha256,origin.visualReviewSha256);
    const brand=entry.brand ? JSON.parse(await checked(entry.brand)) : null;
    let previous;
    const views=[];
    for(const view of entry.views) {
      const input=await checked(view.input), parsed=parseInput(input);
      const record=report.records.find(r=>r.id===entry.case&&r.mode===view.mode);
      assert.equal(record?.outcome,'exported'); assert.equal(record.inputSha256,view.input.sha256);
      if(brand) {
        files.add(brand.logo);
        assert.equal(sha(await readRepoFile(brand.logo)),record.manifest.brand.logoHash,'Brand logo differs');
        assert.equal(brand.name,record.manifest.brand.name);
        assert.equal(brand.accent,record.manifest.brand.accent);
      }
      assert.equal(parsed.metadata.template,entry.template);
      validateTemplateMetadata(parsed.metadata,{width:view.width,height:view.height});
      const defaultMetadata={...parsed.metadata};
      for(const key of entry.variant==='photo-cover'?PHOTO_FIELDS:['visualVariant']) delete defaultMetadata[key];
      if(previous) {
        assert.deepEqual(defaultMetadata,previous.metadata,'Comparison metadata changed beyond explicit variant fields');
        assert.equal(parsed.body,previous.body,'Comparison must preserve exact body text');
        assert.equal(parsed.metadata.visualVariant,entry.variant);
      } else {
        assert.equal(parsed.metadata.visualVariant,undefined);
        previous=parsed;
      }
      const image=record.manifest.assets.find(asset=>asset.reference===parsed.metadata.image);
      assert.ok(image,'Original image identity missing');files.add(parsed.metadata.image);
      assert.equal(sha(await readRepoFile(parsed.metadata.image)),image.hash??image.sha256,'Original image bytes changed');
      const png=await checked(view.png), artifact=record.manifest.artifacts.find(a=>a.file==='card-001.png');
      assert.equal(view.png.sha256,artifact.sha256);
      assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16),view.width); assert.equal(png.readUInt32BE(20),view.height);
      if(entry.variant==='photo-cover') {
        const inspected=review.records.find(r=>r.id===`${entry.case}-${view.mode}`);
        assert.equal(inspected.views.find(v=>v.file===view.png.archiveEntry).sha256,view.png.sha256);
        assert.equal(inspected.verdict,view.mode==='default'?'default compatibility only; existing contrast caveat':'photo composition accepted for this exact fixture');
      } else { assert.ok(review.cases.includes(entry.case)); assert.equal(review.maintainerApproval,'pending'); }
      views.push({...view,path:view.png.file,sha256:view.png.sha256,metadata:parsed.metadata,
        label:view.mode==='default'?'默认布局（同文对照）':entry.variant,
        status:entry.variant==='photo-cover'&&view.mode==='default'?'历史兼容对照 · 存在对比度限制':'代理已检查此精确样例 · 维护者待签收'});
    }
    // Default acceptance and variant inspection remain distinct. Pending mock or
    // future default entries must not acquire accepted-card images from this list.
    if(!template.preview) continue;
    const photo=entry.variant==='photo-cover';
    for (const view of views) view.command=`node scripts/render.mjs ${view.input.file} --asset-root . --size portrait --paginate manual --body-size medium --footer-mode poster${photo?' --brand examples/gallery-variants/photo-brand.json --footer "版式练习 · 不构成事实记录"':''} --format all --strict --preview --out output/gallery-${entry.template}-${view.mode}`;
    entries.push({...entry,views,id:`${entry.template}-${entry.variant}`,
      role:photo?'photo-story':'screenshot-evidence',title:photo?'摄影封面':'产品截图',
      description:photo?'作者明确允许裁切后，将标题放在选定的安静区域。':'把完整截图提前到标题之后，让界面成为阅读重点。',
      allowedAspects:template.aspects.filter(aspect=> {
        const dimensions=TEMPLATE_ASPECTS.find(item=>item.id===aspect);
        try {validateTemplateMetadata(views[1].metadata,{width:dimensions.numerator*360,height:dimensions.denominator*360});return true;}catch{return false;}
      }),
      requirements:photo?'单张可信本地照片或已披露的合成照片；image、alt、caption、source、一个 H1。八个裁切/叠字字段必须同时提供，不能用于截图或证据图。':'单张可信本地截图；image、alt、caption；保留来源说明和图外正文。一个 H1、两段 H2 功能说明，不接受额外行内图片。',
      safety:photo?'mediaFit=cover 是作者的裁切许可；subjectSafety=clear 要求作者检查裁切及文字区。focalX/Y 是位置百分比，不是人脸识别或主体保留保证。':'保持原始比例和完整内容，始终 contain；不裁切、不补造 UI，也不保证放大后手机微字可读。',
      refusals:photo?'无裁切许可、主体 blocked/uncertain、无文字区、焦点越界、非照片角色、远程图片或文字溢出会拒绝。回退时明确移除全部八个字段，不自动降级。':'其他模板/画幅、自动分页、额外行内图片、远程 URL、路径穿越、SVG 与内容溢出会拒绝。长截图可能完整但很窄。',
      disclosure:photo?'图片为 AI 合成练习，非真实地点或摄影记录。默认对照保留历史黑色品牌色导致的眉题/强调文字对比不足，仅作兼容对照。':'界面为原创虚构 UI，并非真实产品截图；演示数据不代表已上线功能。',
      fields:photo?Object.fromEntries(PHOTO_FIELDS.map(k=>[k,views[1].metadata[k]])):{visualVariant:entry.variant},
    });
  }
  return {entries,evidenceFiles:[...files]};
}
