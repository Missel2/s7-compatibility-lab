// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../contracts/registry.json');
const {verifyQualification} = require('../lib/qualification-gate.cjs');
const hash = 'a'.repeat(64);
function result() {
  return {
    schema_version:1,scope:'SOFTWARE_LOOPBACK_ONLY',
    candidate:{package:'unreleased-example',version:'0.0.0-test',artifact_sha256:hash},
    fixture:{loopback:true,revision:'fixture-test',observer_sha256:hash},
    contracts:[
      {id:'S7-ERR-003',outcome:'PASS',evidence:{capture_sha256:hash,observed_requests:2,assertions:1,independent_observer:true}},
      {id:'S7-ERR-004',outcome:'PASS',evidence:{capture_sha256:hash,observed_requests:1,assertions:1,independent_observer:true}}
    ]
  };
}
const required = ['S7-ERR-003','S7-ERR-004'];
test('explicit limited scope passes schema guard but never produces full qualification', () => {
  const summary=verifyQualification(registry,result(),required);
  assert.equal(summary.classification,'SCOPED_CONTRACTS_PASS');
  assert.equal(summary.full_candidate_qualification,false);
  assert.deepEqual(summary.qualified_scope,required);
});
test('no empty required list, unknown contracts or pending risk family', () => {
  assert.throws(()=>verifyQualification(registry,result(),[]));
  assert.throws(()=>verifyQualification(registry,result(),['S7-ERR-999']));
  assert.throws(()=>verifyQualification(registry,result(),['S7-RISK-006']));
  assert.throws(()=>verifyQualification(registry,result(),[required[0],required[0]]));
});
test('missing, duplicate and extra results fail closed', () => {
  const missing=result(); missing.contracts.pop();
  assert.throws(()=>verifyQualification(registry,missing,required),/Missing required/);
  const duplicate=result(); duplicate.contracts.push(duplicate.contracts[0]);
  assert.throws(()=>verifyQualification(registry,duplicate,required),/Duplicate reported/);
  const extra=result(); extra.contracts.push({...extra.contracts[0],id:'S7-ERR-005'});
  assert.throws(()=>verifyQualification(registry,extra,required),/Unrequested/);
});
test('fail, skip, pending and known-unsafe outcomes never pass', () => {
  for (const outcome of ['FAIL','SKIP','PENDING','KNOWN_UNSAFE','NOT_APPLICABLE',null]) {
    const r=result();r.contracts[0].outcome=outcome;
    assert.throws(()=>verifyQualification(registry,r,required),/not PASS/);
  }
});
test('incomplete or fake-observer metadata fails closed', () => {
  for (const mutation of [
    r=>{delete r.candidate.artifact_sha256},
    r=>{r.fixture.loopback=false},
    r=>{r.fixture.observer_sha256='not-a-hash'},
    r=>{r.contracts[0].evidence.observed_requests=0},
    r=>{r.contracts[0].evidence.assertions=0},
    r=>{r.contracts[0].evidence.independent_observer=false},
    r=>{r.contracts[0].evidence.capture_sha256='invalid'}
  ]) { const r=result();mutation(r);assert.throws(()=>verifyQualification(registry,r,required)); }
});
test('unsupported schema, invalid body and omitted result collection fail',()=>{
  const r=result();r.schema_version=2;assert.throws(()=>verifyQualification(registry,r,required));
  assert.throws(()=>verifyQualification(registry,null,required));
  const omitted=result();delete omitted.contracts;assert.throws(()=>verifyQualification(registry,omitted,required));
});

test('arrays, wrappers and numeric digest values cannot pass evidence shape validation', () => {
  for (const mutate of [
    r => { r.candidate.artifact_sha256 = [hash]; },
    r => { r.fixture.observer_sha256 = [hash]; },
    r => { r.contracts[0].evidence.capture_sha256 = [hash]; },
    r => { r.candidate.artifact_sha256 = {toString: () => hash}; },
    r => { r.contracts[0].evidence.capture_sha256 = 123; }
  ]) {
    const r = result();
    mutate(r);
    assert.throws(() => verifyQualification(registry, r, required));
  }
});
