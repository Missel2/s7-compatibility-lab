// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validateCatalog,buildMatrix,renderMarkdown}=require('../scripts/build-comparison-matrix.cjs');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'../comparisons/catalog.v1.json'),'utf8'));
const mutate=fn=>{const v=structuredClone(baseline);fn(v);return v;};
test('three actual version identities, all evidence links and schema validate',()=>{
  assert.doesNotThrow(()=>validateCatalog(baseline));
  const m=buildMatrix(baseline);
  assert.equal(m.candidateCount,3);
  assert.equal(m.observationCount,baseline.observations.length);
  assert.equal(m.fullCandidateQualification,false);
  assert.equal(m.globalRanking,null);
  assert.equal(m.universalWinner,null);
  assert.equal(m.observedOutcomes.KNOWN_UNSAFE,5);
  assert.ok(m.comparableScenarios.includes('WRITE_THREE_DISJOINT_BYTES'));
  assert.ok(m.comparableScenarios.includes('READ_WRONG_PDU_REFERENCE'));
  assert.ok(m.comparableScenarios.includes('READ_IMPOSSIBLE_ACK_LENGTH'));
  assert.ok(!m.comparableScenarios.includes('WRITE_ACK_LOST_AFTER_APPLY'));
  assert.equal(m.completeComparisonScenarios.length,0);
});
test('historical unsafe JS and newer published JS positive must not cancel each other',()=>{
  const w=buildMatrix(baseline).rows.find(x=>x.id==='WRITE_THREE_DISJOINT_BYTES');
  assert.equal(w.comparable,true);
  assert.equal(w.cells.find(c=>c.candidate==='missel-js-alpha2').outcome,'KNOWN_UNSAFE');
  assert.equal(w.cells.find(c=>c.candidate==='missel-js-alpha2').phase,'PR_OPEN');
  assert.equal(w.cells.find(c=>c.candidate==='oriolrius-js-4_4_1').outcome,'SCOPED_PASS');
  assert.equal(w.cells.find(c=>c.candidate==='rust-1_4_0').outcome,'SCOPED_PASS');
  assert.equal(w.cells.find(c=>c.candidate==='rust-1_4_0').phase,'PR_OPEN');
  assert.equal(w.observedCandidates,3);
  assert.equal(w.allVersionsObserved,true);
  assert.equal(w.fullCoverage,false,'An observed but unmerged PR cannot be complete merged coverage');
});
test('wrong PDU and impossible length show opposing version-specific behavior',()=>{
  const rows=buildMatrix(baseline).rows;
  const cell=(id,who)=>rows.find(r=>r.id===id).cells.find(c=>c.candidate===who).outcome;
  assert.equal(cell('READ_IMPOSSIBLE_ACK_LENGTH','oriolrius-js-4_4_1'),'KNOWN_UNSAFE');
  assert.equal(cell('READ_IMPOSSIBLE_ACK_LENGTH','rust-1_4_0'),'SCOPED_PASS');
  assert.equal(cell('READ_WRONG_PDU_REFERENCE','oriolrius-js-4_4_1'),'NOT_OBSERVED_UNSAFE');
  assert.equal(cell('READ_WRONG_PDU_REFERENCE','rust-1_4_0'),'KNOWN_UNSAFE');
});
test('no future/hardware/unimplemented case gains artificial PASS',()=>{
  const m=buildMatrix(baseline);
  const hil=m.rows.find(x=>x.id==='HARDWARE_COVERAGE');
  assert.ok(hil.cells.every(x=>x.outcome==='PENDING_HARDWARE' && x.evidence===null));
  for(const s of m.rows.filter(x=>x.oracle==='UNDEFINED' && x.protocol!=='HARDWARE'))
    assert.ok(s.cells.every(x=>x.outcome==='NOT_TESTED' && x.evidence===null),s.id);
  assert.ok(m.prospects.every(x=>!m.candidates.some(c=>c.id===x.id)));
});
test('rendered report is explicit evidence, not a single overall winner',()=>{
  const md=renderMarkdown(baseline,buildMatrix(baseline));
  assert.match(md,/not a ranking/i);
  assert.match(md,/NOT_TESTED/);
  assert.match(md,/PENDING_HARDWARE/);
  assert.match(md,/open PR/i);
  assert.match(md,/No global score or winner/);
  assert.match(md,/https:\/\/github\.com\/Missel2\/s7-compatibility-lab\/actions\/runs\/43959620837/);
});
test('fail closed on unknown outcomes, duplicate observations, misidentified candidate or forged URLs',()=>{
  const edits=[
    x=>x.observations[0].outcome='PASS',
    x=>x.observations.push(structuredClone(x.observations[0])),
    x=>x.observations[0].candidate='invented-s7',
    x=>x.observations[0].scenario='HARDWARE_COVERAGE',
    x=>x.observations[0].evidence.run='https://example.com/runs/1',
    x=>x.observations[0].evidence.commit='main',
    x=>x.observations[0].evidence.artifact='../traversal.json',
    x=>x.observations[0].evidence.assertion='',
    x=>x.observations[0].candidatePass=true,
    x=>x.observations[0].limitations=[],
    x=>x.candidates[0].version='',
    x=>x.scenarios[1].oracle='UNDEFINED',
    x=>x.candidates[0].platform='windows-unknown',
    x=>x.prospects[0].id='rust-1_4_0'
  ];
  for(const fn of edits) assert.throws(()=>buildMatrix(mutate(fn)),String(fn));
});
test('failure modes cannot be disguised by missing tests or revision mismatches',()=>{
  const s=mutate(x=>x.observations=x.observations.filter(o=>o.outcome!=='KNOWN_UNSAFE'));
  const m=buildMatrix(s);
  assert.equal(m.observedOutcomes.KNOWN_UNSAFE,0);
  assert.ok(m.rows.some(r=>r.cells.some(c=>c.outcome==='NOT_TESTED')));
  assert.equal(m.fullCandidateQualification,false);
  assert.equal(m.globalRanking,null);
  assert.throws(()=>buildMatrix(mutate(x=>x.observations[0].evidence.commit='1234'))); 
});
