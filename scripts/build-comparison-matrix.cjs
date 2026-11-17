// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Strict evidence-index renderer, NOT an external-result verifier or release gate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ID = /^[a-z][a-z0-9_-]+$/;
const CASE = /^[A-Z][A-Z0-9_]+$/;
const SHA = /^[0-9a-f]{40}$/;
const RUN = /^https:\/\/github\.com\/Missel2\/s7-compatibility-lab\/actions\/runs\/[1-9][0-9]*$/;
const outcomes = new Set(['SCOPED_PASS','KNOWN_UNSAFE','NOT_OBSERVED_UNSAFE']);
const phases = new Set(['MERGED_BASELINE','PR_OPEN']);
const platforms = new Set(['ubuntu-24.04/linux-x64']);
function nonEmpty(x) { return typeof x === 'string' && x.trim() === x && x.length > 0; }
function distinct(values, title) {
  if (new Set(values).size !== values.length) throw Error('Duplicate '+title);
}
function validateCatalog(c) {
  assert.equal(c.schemaVersion,1);
  assert.equal(c.scope,'SOFTWARE_LOOPBACK_ONLY');
  assert.equal(c.policy,'EVIDENCE_NOT_QUALIFICATION');
  for (const key of ['candidates','prospects','scenarios','observations']) assert.ok(Array.isArray(c[key]) && c[key].length>0,key);
  const ids=c.candidates.map(x=>x.id), cases=c.scenarios.map(x=>x.id);
  distinct(ids,'candidate');distinct(cases,'scenario');distinct(c.prospects.map(x=>x.id),'prospect');
  const candidateMap=new Map(c.candidates.map(x=>[x.id,x]));
  const scenarioMap=new Map(c.scenarios.map(x=>[x.id,x]));
  for (const x of c.candidates) {
    assert.match(x.id,ID);
    for (const k of ['label','package','version','transport','host','platform','ecosystem','availability','status']) assert.ok(nonEmpty(x[k]),x.id+':'+k);
    assert.ok(platforms.has(x.platform),'Unsupported comparison platform');
    assert.ok(x.protocols?.includes('S7COMM_CLASSIC'),'Only actual classic S7 candidates supported in v1');
    assert.ok(['KNOWN_UNSAFE','NOT_QUALIFIED'].includes(x.status),
      'No qualified or speculative-safe candidate status in catalog: '+x.id);
  }
  for (const x of c.prospects) {
    assert.match(x.id,ID);
    assert.ok(!candidateMap.has(x.id),'A prospect must be separately admitted to tested candidates');
    for(const k of ['label','state','required']) assert.ok(nonEmpty(x[k]),k);
    assert.match(x.state,/^(NOT_ONBOARDED|NOT_ONBOARDED_AS_CANDIDATE|SEPARATE_PROTOCOL_PENDING)$/);
  }
  for(const s of c.scenarios) {
    assert.match(s.id,CASE);
    for(const k of ['family','protocol','oracle','fixture','definition','priority'])assert.ok(nonEmpty(s[k]),s.id+':'+k);
    if(s.protocol==='HARDWARE') {
      assert.equal(s.oracle,'UNDEFINED');
      assert.equal(s.fixture,'ISOLATED_HIL_UNAVAILABLE');
    } else {
      assert.equal(s.protocol,'S7COMM_CLASSIC');
    }
  }
  const used=new Set();
  for(const o of c.observations) {
    assert.ok(candidateMap.has(o.candidate),'Unknown candidate '+o.candidate);
    assert.ok(scenarioMap.has(o.scenario),'Unknown scenario '+o.scenario);
    const x=candidateMap.get(o.candidate), s=scenarioMap.get(o.scenario);
    const key=o.candidate+':'+o.scenario;
    if(used.has(key))throw Error('Duplicate candidate-scenario observation: '+key);
    used.add(key);
    assert.ok(outcomes.has(o.outcome),'Unsupported outcome for '+key);
    if(o.outcome==='KNOWN_UNSAFE')
      assert.equal(x.status,'KNOWN_UNSAFE','A recorded unsafe candidate cannot erase its unsafe state: '+key);
    assert.ok(phases.has(o.phase),'Unsupported PR state for '+key);
    assert.ok(s.oracle!=='UNDEFINED','No observed result before a concrete oracle exists: '+key);
    assert.ok(x.protocols.includes(s.protocol),'Protocol mismatch: '+key);
    assert.ok(o.evidence && typeof o.evidence==='object' && !Array.isArray(o.evidence));
    assert.match(o.evidence.run,RUN,'Must cite real lab Actions run URL');
    assert.match(o.evidence.commit,SHA,'Evidence must pin exact CI commit');
    assert.ok(nonEmpty(o.evidence.artifact) && /^[A-Za-z0-9_.-]+\.json$/.test(o.evidence.artifact),'No evidence JSON filename');
    assert.ok(nonEmpty(o.evidence.assertion),'Missing concrete observed assertion');
    assert.ok(!('candidatePass' in o)||o.candidatePass===false,'Cannot turn baseline characterization into release pass');
    if(o.phase==='PR_OPEN') {
      assert.ok(Array.isArray(o.limitations) && o.limitations.some(l=>/unmerged/i.test(l)),'Open PR result must declare unmerged limitation');
    }
    if(o.limitations!==undefined) {
      assert.ok(Array.isArray(o.limitations) && o.limitations.every(nonEmpty),'Invalid caveats');
    }
  }
  return {candidateMap,scenarioMap};
}
function buildMatrix(c) {
  const {candidateMap,scenarioMap}=validateCatalog(c);
  const byKey=new Map(c.observations.map(x=>[x.candidate+':'+x.scenario,x]));
  const rows=c.scenarios.map(s=>{
    const cells=c.candidates.map(candidate=>{
      const o=byKey.get(candidate.id+':'+s.id);
      const status=s.protocol==='HARDWARE'?'PENDING_HARDWARE':s.oracle==='UNDEFINED'?'NOT_TESTED':o?.outcome||'NOT_TESTED';
      return {candidate:candidate.id,outcome:status,phase:o?.phase??null,evidence:o?.evidence??null,limitations:o?.limitations??[]};
    });
    const relevant=cells.filter(x=>x.evidence!==null);
    // Compatible environment/oracle, but do not convert missing cases to wins.
    const comparable=relevant.length>=2 && s.protocol==='S7COMM_CLASSIC' && s.oracle!=='UNDEFINED' &&
      relevant.every(x=>candidateMap.get(x.candidate).platform===candidateMap.get(relevant[0].candidate).platform);
    return {id:s.id,family:s.family,protocol:s.protocol,priority:s.priority,
      oracle:s.oracle,fixture:s.fixture,cells,comparable,observedCandidates:relevant.length,
      allVersionsObserved:relevant.length===c.candidates.length && comparable,
      // An open PR cannot be counted as merged baseline coverage.
      fullCoverage:relevant.length===c.candidates.length && comparable &&
        relevant.every(x=>x.phase==='MERGED_BASELINE')};
  });
  const observations=c.observations.length;
  const counts={KNOWN_UNSAFE:0,SCOPED_PASS:0,NOT_OBSERVED_UNSAFE:0};
  for(const o of c.observations)counts[o.outcome]++;
  const byCandidate=c.candidates.map(x=>{
    const obs=c.observations.filter(o=>o.candidate===x.id);
    return {id:x.id,version:x.version,observedScenarios:obs.length,unobservedScenarios:c.scenarios.length-obs.length,
      knownUnsafe:obs.filter(o=>o.outcome==='KNOWN_UNSAFE').length,
      scopedPass:obs.filter(o=>o.outcome==='SCOPED_PASS').length,
      noUnsafeObserved:obs.filter(o=>o.outcome==='NOT_OBSERVED_UNSAFE').length,
      candidateQualified:false};
  });
  return {schemaVersion:1,scope:c.scope,source:'CURATED_CI_EVIDENCE_INDEX_NOT_LIVE_TEST_RESULTS',
    fullCandidateQualification:false,globalRanking:null,universalWinner:null,
    candidateCount:c.candidates.length,scenarioCount:c.scenarios.length,
    observationCount:observations,observedOutcomes:counts,
    comparableScenarios:rows.filter(r=>r.comparable).map(r=>r.id),
    completeComparisonScenarios:rows.filter(r=>r.fullCoverage).map(r=>r.id),
    candidates:byCandidate,prospects:c.prospects,rows};
}
function esc(s){return String(s).replace(/\|/g,'\\|').replace(/\r?\n/g,' ');}
function renderMarkdown(c,m) {
 const head=[
 '# S7 implementation comparison — evidence ledger (not a ranking)',
 '',
 '**Scope:** software-only loopback. Historical exact-version observations; this is a curated index of already executed CI, **not** a new combined live run or production qualification.',
 '',
 '| Scenario | '+c.candidates.map(x=>esc(x.label)).join(' | ')+' | Comparable? |',
 '| --- | '+c.candidates.map(()=> '---').join(' | ')+' | --- |'
 ];
 for(const row of m.rows) {
   const cells=row.cells.map(o=>o.evidence?
     esc(o.outcome)+(o.phase==='PR_OPEN'?' (open PR)':'')+' ([CI]('+o.evidence.run+'))':
     esc(o.outcome));
   head.push('| '+esc(row.id)+' | '+cells.join(' | ')+' | '+(row.comparable?'YES, scoped':'NO / incomplete')+' |');
 }
 head.push('', '## Interpretation', '',
 '- **KNOWN_UNSAFE:** real version-specific violating behavior, original strict candidate may be red. A green characterization workflow is **not** release PASS.',
 '- **SCOPED_PASS:** one tested operation/contract succeeded; this never implies general reliability.',
 '- **NOT_OBSERVED_UNSAFE:** no unsafe acceptance observed in the specified fault injection; weaker than a complete safety proof.',
 '- **NOT_TESTED / PENDING_HARDWARE:** no qualifying evidence. Never impute zero defects or a pass.',
 '- **Open PR** observations are review-stage evidence, not merged registry facts.',
 '- **Comparable** means same S7Comm scenario oracle and software loopback fixture/platform, **not** equal capability, dependency graph or production hardware performance.',
 '- **No global score or winner** is computed; a smaller number of unsafe findings could merely mean less testing.',
 '', '## Evidence source and coverage', '',
 'Observed scenario cells: '+m.observationCount+' of '+(m.candidateCount*m.scenarioCount)+
 '. Comparable scenarios: '+m.comparableScenarios.length+'. Full three-candidate comparison scenarios: '+m.completeComparisonScenarios.length+'.',
 '', '## Candidate caveats', '');
 for(const x of c.candidates) head.push('- '+x.label+': '+x.package+'@'+x.version+
   ', '+x.transport+', '+x.platform+' (not qualified).');
 head.push('','## Future implementations (not tested)', '');
 for(const x of c.prospects)head.push('- '+x.label+' — '+x.state+': '+x.required);
 head.push('','_Generated by the repo-local strict comparison indexer from comparisons/catalog.v1.json. Direct original JSON and test logs remain in the linked Actions artifacts._','');
 return head.join('\n');
}
function main() {
 const root=path.join(__dirname,'..');
 const input=JSON.parse(fs.readFileSync(path.join(root,'comparisons/catalog.v1.json'),'utf8'));
 const result=buildMatrix(input);
 const dir=path.join(root,'test-reports');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'comparison-matrix.v1.json'),JSON.stringify(result,null,2)+'\n');
 fs.writeFileSync(path.join(dir,'comparison-matrix.v1.md'),renderMarkdown(input,result));
 process.stdout.write('COMPARISON_EVIDENCE_MATRIX='+JSON.stringify({candidates:result.candidateCount,
  scenarios:result.scenarioCount,observations:result.observationCount,
  comparable:result.comparableScenarios,fullCoverage:result.completeComparisonScenarios,
  globalRanking:result.globalRanking})+'\n');
}
if(require.main===module){try{main()}catch(e){console.error('COMPARISON_INDEX_RED '+(e.stack||e));process.exitCode=1}}
module.exports={validateCatalog,buildMatrix,renderMarkdown};
