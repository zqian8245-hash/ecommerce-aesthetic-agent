import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source=path.join(root,'assets/classification-source/classification');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const taxonomy=read(path.join(source,'taxonomy.json'));
const rules=read(path.join(source,'rules.json'));
const annotations=read(path.join(root,'reference-library/visual-annotations.json')).records;
const maps={audience_id:taxonomy.audiences,motivation_id:taxonomy.purchase_motivations,scenario_id:taxonomy.scenarios};
const cases=[];
for(const record of annotations){
  const metaFile=path.join(source,'cases/seed',record.case_id+'.json');
  const meta=read(metaFile);
  const image=path.resolve(source,meta.asset.local_path);
  if(!image.startsWith(source+path.sep)||!fs.existsSync(image))throw new Error('Invalid image path: '+record.case_id);
  if(meta.case_id!==record.case_id)throw new Error('Case ID mismatch');
  const tags=Object.fromEntries(Object.entries(meta.tags).map(([k,v])=>{const item=maps[k]?.find(x=>x.id===v);if(!item)throw new Error('Unknown tag '+v);return[k,{id:v,name:item.name}];}));
  cases.push({...record,tags,rule_ids:meta.rule_ids,image_path:path.relative(root,image).replaceAll('\\','/'),image_sha256:crypto.createHash('sha256').update(fs.readFileSync(image)).digest('hex'),source_metadata_path:path.relative(root,metaFile).replaceAll('\\','/'),source_style_analysis:meta.style_analysis,source:meta.source,source_review_status:meta.review_status,use_mode:'research_style_reference',eligible_for_reference:true,eligible_for_score_calibration:false});
}
if(new Set(cases.map(x=>x.case_id)).size!==cases.length)throw new Error('Duplicate cases');
const ids=new Set(cases.map(x=>x.case_id));
for(const rule of rules.rules)for(const id of rule.recommended_case_ids)if(!ids.has(id))throw new Error('Dangling rule case: '+id);
const index={schema_version:'1.0',library_version:'2.2',created_date:'2026-10-01',source_archive:'classification(1).zip',source_root:'assets/classification-source/classification',case_count:cases.length,rule_count:rules.rules.length,quality_labeled_count:0,human_approved_case_count:cases.filter(c=>c.source_review_status==='approved').length,cases};
fs.writeFileSync(path.join(root,'reference-library/index.json'),JSON.stringify(index,null,2)+'\n','utf8');
console.log(JSON.stringify({cases:cases.length,rules:rules.rules.length,quality_labeled:0}));
