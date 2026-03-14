import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fakeEmbed } from "../embeddings/fake.js";
import { stableUuid } from "../util/uuid.js";

type RecordKind = "L1_fact" | "L2_topic" | "L3_rollup" | "L4_abstraction";
type FixtureRecord = { key: string; kind?: RecordKind; title: string; text_summary: string };
type FixtureCase = { id: string; query_text: string; critical_facts: string[] };
type Fixture = { actor: string; context_char_budget: number; context_token_budget: number; records: FixtureRecord[]; cases: FixtureCase[] };
type EndpointName = "recall_text" | "planning_context" | "context_assemble";
type ArmName = "l0_plus_l1_plus_l2_plus_l3" | "l0_plus_l1_plus_l2_plus_l3_plus_l4";
type SampleResult = { endpoint: EndpointName; status: number; ok: boolean; context_est_tokens: number; selected_memory_layers: string[]; retrieved_memory_layers: string[]; context_chars: number; critical_facts_found: string[]; critical_facts_missing: string[]; fact_recall_rate: number };
type CaseResult = { case_id: string; arm: ArmName; query_text: string; critical_facts: string[]; results: Record<EndpointName, SampleResult> };

function argValue(flag: string): string | null { const idx = process.argv.indexOf(flag); if (idx === -1) return null; const value = process.argv[idx+1]; if (!value || value.startsWith('--')) return null; return value; }
function rootDir(): string { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'); }
function nowTag(): string { const n=new Date(); const p=(x:number)=>String(x).padStart(2,'0'); return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`; }
function readFixture(file:string): Fixture { return JSON.parse(readFileSync(file,'utf8')) as Fixture; }
function nodeId(scope:string,key:string){ return stableUuid(`${scope}:l4-exploratory:${key}`); }
function edgeId(scope:string,src:string,dst:string){ return stableUuid(`${scope}:l4-exploratory:edge:${src}:${dst}`); }

function makePayload(fixture: Fixture, scope: string, tenantId: string) {
  const eventRecords = fixture.records.filter((r)=>!r.kind);
  const l1Records = fixture.records.filter((r)=>r.kind==='L1_fact');
  const l2Records = fixture.records.filter((r)=>r.kind==='L2_topic');
  const l3Records = fixture.records.filter((r)=>r.kind==='L3_rollup');
  const l4Records = fixture.records.filter((r)=>r.kind==='L4_abstraction');
  const events = eventRecords.map((r)=>({ id: nodeId(scope,r.key), scope, type:'event', tier:'hot', title:r.title, text_summary:r.text_summary, raw_ref:`seed://l4-exploratory/${r.key}`, slots:{ lifecycle_state:'active', compression_layer:'L0' }, salience:0.92, importance:0.9, confidence:0.97, embedding_model:'fake:deterministic', embedding:fakeEmbed(r.text_summary), memory_lane:'shared' }));
  const l1Nodes = l1Records.map((r)=>({ id: nodeId(scope,r.key), scope, type:'concept', tier:'warm', title:r.title, text_summary:r.text_summary, slots:{ compression_layer:'L1', summary_kind:'write_distillation_fact', citations: events.map(e=>e.id), lifecycle_state:'active' }, salience:0.95, importance:0.94, confidence:0.99, embedding_model:'fake:deterministic', embedding:fakeEmbed(r.text_summary), memory_lane:'shared' }));
  const l2Nodes = l2Records.map((r)=>({ id: nodeId(scope,r.key), scope, type:'topic', tier:'warm', title:r.title, text_summary:r.text_summary, slots:{ compression_layer:'L2', summary_kind:'topic_cluster', citations:[...events.map(e=>e.id), ...l1Nodes.map(n=>n.id)], lifecycle_state:'active' }, salience:0.96, importance:0.95, confidence:0.98, embedding_model:'fake:deterministic', embedding:fakeEmbed(r.text_summary), memory_lane:'shared' }));
  const l3Nodes = l3Records.map((r)=>({ id: nodeId(scope,r.key), scope, type:'concept', tier:'warm', title:r.title, text_summary:r.text_summary, slots:{ compression_layer:'L3', summary_kind:'compression_rollup', citations:[...events.map(e=>e.id), ...l2Nodes.map(n=>n.id)], lifecycle_state:'active' }, salience:0.97, importance:0.96, confidence:0.99, embedding_model:'fake:deterministic', embedding:fakeEmbed(r.text_summary), memory_lane:'shared' }));
  const l4Nodes = l4Records.map((r)=>({ id: nodeId(scope,r.key), scope, type:'concept', tier:'warm', title:r.title, text_summary:r.text_summary, slots:{ compression_layer:'L4', summary_kind:'semantic_abstraction', shadow_mode:true, citations:[...events.map(e=>e.id), ...l3Nodes.map(n=>n.id)], lifecycle_state:'active' }, salience:0.8, importance:0.85, confidence:0.72, embedding_model:'fake:deterministic', embedding:fakeEmbed(r.text_summary), memory_lane:'shared' }));
  const edges = [
    ...l1Nodes.flatMap((n)=>events.map((e)=>({ id:edgeId(scope,n.id,e.id), scope, type:'derived_from', src:{id:n.id}, dst:{id:e.id}, weight:0.92, confidence:0.95 }))),
    ...l2Nodes.flatMap((n)=>[...events,...l1Nodes].map((s)=>({ id:edgeId(scope,n.id,s.id), scope, type:'derived_from', src:{id:n.id}, dst:{id:s.id}, weight:0.9, confidence:0.94 }))),
    ...l3Nodes.flatMap((n)=>[...events,...l2Nodes].map((s)=>({ id:edgeId(scope,n.id,s.id), scope, type:'derived_from', src:{id:n.id}, dst:{id:s.id}, weight:0.91, confidence:0.95 }))),
    ...l4Nodes.flatMap((n)=>[...events,...l3Nodes].map((s)=>({ id:edgeId(scope,n.id,s.id), scope, type:'derived_from', src:{id:n.id}, dst:{id:s.id}, weight:0.88, confidence:0.9 }))),
  ];
  return { tenant_id: tenantId, scope, actor: fixture.actor, auto_embed:false, memory_lane:'shared', input_text:'l4 exploratory benchmark seed corpus', nodes:[...events,...l1Nodes,...l2Nodes,...l3Nodes,...l4Nodes], edges };
}

async function postJson(baseUrl:string, endpoint:string, body:unknown, extraHeaders?: Record<string,string>) {
  const response = await fetch(`${baseUrl}${endpoint}`, { method:'POST', headers:{ 'content-type':'application/json', ...(extraHeaders??{}) }, body: JSON.stringify(body) });
  let parsed:any=null; try { parsed = await response.json(); } catch { /* ignore non-JSON responses */ }
  return { status: response.status, ok: response.ok, body: parsed };
}
function textForEndpoint(endpoint:EndpointName, body:any):string { if(endpoint==='recall_text') return typeof body?.context?.text==='string'?body.context.text:''; if(endpoint==='planning_context') return typeof body?.recall?.context?.text==='string'?body.recall.context.text:''; return typeof body?.layered_context?.merged_text==='string'?body.layered_context.merged_text:''; }
function costSignalsForEndpoint(endpoint:EndpointName, body:any):any { if(endpoint==='recall_text') return body?.cost_signals??null; if(endpoint==='planning_context') return body?.cost_signals??body?.planning_summary??null; return body?.cost_signals??body?.assembly_summary??null; }
function selectionStatsForEndpoint(endpoint:EndpointName, body:any):any { if(endpoint==='recall_text') return body?.context?.selection_stats??null; if(endpoint==='planning_context') return body?.recall?.context?.selection_stats??null; return body?.recall?.context?.selection_stats??null; }
function buildSampleResult(endpoint:EndpointName, criticalFacts:string[], body:any, status:number, ok:boolean): SampleResult { const text=textForEndpoint(endpoint,body); const cost=costSignalsForEndpoint(endpoint,body); const sel=selectionStatsForEndpoint(endpoint,body); const found=criticalFacts.filter((f)=>text.includes(f)); const missing=criticalFacts.filter((f)=>!text.includes(f)); return { endpoint, status, ok, context_est_tokens:Number(cost?.context_est_tokens ?? body?.planning_summary?.context_est_tokens ?? body?.assembly_summary?.context_est_tokens ?? 0), selected_memory_layers:Array.isArray(cost?.selected_memory_layers)?cost.selected_memory_layers.map((x:unknown)=>String(x)):[], retrieved_memory_layers:Array.isArray(sel?.retrieved_memory_layers)?sel.retrieved_memory_layers.map((x:unknown)=>String(x)):[], context_chars:text.length, critical_facts_found:found, critical_facts_missing:missing, fact_recall_rate: criticalFacts.length?Number((found.length/criticalFacts.length).toFixed(6)):1 } }
function mean(values:number[]){ return values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(6)):0; }
function uniqueSorted(values:string[]){ return Array.from(new Set(values)).sort(); }
function renderReport(summary:any){ const lines=['# L4 Exploratory Shadow Benchmark','',`- scope: \`${summary.scope}\``,`- fixture: \`${summary.fixture_file}\``,`- cases: \`${summary.cases}\``,`- note: internal exploratory benchmark; not for public claims.`, '']; for (const arm of ['l0_plus_l1_plus_l2_plus_l3','l0_plus_l1_plus_l2_plus_l3_plus_l4']) { const a=summary.arms[arm]; lines.push(`## ${arm}`,'',`- avg_fact_recall_rate: \`${a.avg_fact_recall_rate}\``,`- avg_context_est_tokens: \`${a.avg_context_est_tokens}\``,`- avg_context_chars: \`${a.avg_context_chars}\``,`- selected_memory_layers: \`${a.selected_memory_layers.join(', ')}\``,''); } return lines.join('\n')+'\n'; }

async function main(){
  const root=rootDir(); const baseUrl=(argValue('--base-url')??'http://127.0.0.1:3321').replace(/\/$/,''); const fixtureFile=path.resolve(argValue('--fixture-file') ?? path.join(root,'src/jobs/fixtures/l4-exploratory-shadow-research-v1.json')); const tenantId=argValue('--tenant-id')??'default'; const scope=argValue('--scope')??`l4_exploratory_${nowTag()}`; const outputDir=path.resolve(argValue('--output-dir') ?? path.join(root,'artifacts/benchmarks/l4-exploratory-shadow', nowTag())); mkdirSync(outputDir,{recursive:true});
  const fixture=readFixture(fixtureFile); const writeOut=await postJson(baseUrl,'/v1/memory/write', makePayload(fixture,scope,tenantId)); if(!writeOut.ok) throw new Error(`write failed: status=${writeOut.status}`);
  const arms: Record<ArmName,string[]> = { l0_plus_l1_plus_l2_plus_l3:['L0','L1','L2','L3'], l0_plus_l1_plus_l2_plus_l3_plus_l4:['L0','L1','L2','L3','L4'] };
  const headers={ 'x-aionis-internal-allow-drop-trust-anchors':'true','x-aionis-internal-apply-layer-policy-to-retrieval':'true' };
  const rows: CaseResult[] = [];
  for (const [arm,allowedLayers] of Object.entries(arms) as Array<[ArmName,string[]]>) {
    for (const item of fixture.cases) {
      const common={ tenant_id:tenantId, scope, query_text:item.query_text, memory_layer_preference:{allowed_layers:allowedLayers}, context_char_budget:fixture.context_char_budget, context_token_budget:fixture.context_token_budget };
      const armHeaders = arm === 'l0_plus_l1_plus_l2_plus_l3_plus_l4'
        ? { ...headers, 'x-aionis-internal-allow-l4-serving':'true' }
        : headers;
      const recallOut=await postJson(baseUrl,'/v1/memory/recall_text',{...common, return_debug:true}, armHeaders);
      const planningOut=await postJson(baseUrl,'/v1/memory/planning/context',{...common, tool_candidates:['rg','pytest'], context:{intent:'analysis', repo:'benchmark'}}, armHeaders);
      const assembleOut=await postJson(baseUrl,'/v1/memory/context/assemble',{...common, tool_candidates:['rg','pytest'], context:{intent:'analysis', repo:'benchmark'}, return_layered_context:true}, armHeaders);
      rows.push({ case_id:item.id, arm, query_text:item.query_text, critical_facts:item.critical_facts, results:{ recall_text: buildSampleResult('recall_text', item.critical_facts, recallOut.body, recallOut.status, recallOut.ok), planning_context: buildSampleResult('planning_context', item.critical_facts, planningOut.body, planningOut.status, planningOut.ok), context_assemble: buildSampleResult('context_assemble', item.critical_facts, assembleOut.body, assembleOut.status, assembleOut.ok) }});
    }
  }
  const summary:any={ generated_at:new Date().toISOString(), base_url:baseUrl, tenant_id:tenantId, scope, fixture_file:fixtureFile, cases:fixture.cases.length, write_status:writeOut.status, arms:{} };
  for (const arm of Object.keys(arms) as ArmName[]) { const armRows=rows.filter((r)=>r.arm===arm); const samples=armRows.flatMap((r)=>Object.values(r.results)); summary.arms[arm]={ avg_fact_recall_rate:mean(samples.map(s=>s.fact_recall_rate)), avg_context_est_tokens:mean(samples.map(s=>s.context_est_tokens)), avg_context_chars:mean(samples.map(s=>s.context_chars)), selected_memory_layers:uniqueSorted(samples.flatMap(s=>s.selected_memory_layers)), retrieved_memory_layers:uniqueSorted(samples.flatMap(s=>s.retrieved_memory_layers)) }; }
  writeFileSync(path.join(outputDir,'cases.jsonl'), `${rows.map((r)=>JSON.stringify(r)).join('\n')}\n`,'utf8');
  writeFileSync(path.join(outputDir,'summary.json'), `${JSON.stringify(summary,null,2)}\n`,'utf8');
  writeFileSync(path.join(outputDir,'report.md'), renderReport(summary),'utf8');
  process.stdout.write(`${JSON.stringify({ output_dir: outputDir, scope, summary }, null, 2)}\n`);
}
main().catch((error)=>{ console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
