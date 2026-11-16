// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildIndex}=require('../scripts/export-rust-contract-evidence.cjs');
const registry=require('../contracts/registry.json');
const commit='f'.repeat(40);
function fixture(){
 const readGood={engine:'rust',pkg:'1.4.0',nodeRed:'5.0.9',fault:'inconsistent_data_length',verdict:'passed',
  unverifiedFreshValues:false,mutation:{requestObserved:true,originalDataLength:17,deliveredDataLength:32767},
  readRequests:2,correctReadbacks:1,proxyErrors:[],sourceCommit:commit};
 const wrong={engine:'rust',pkg:'1.4.0',nodeRed:'5.0.9',fault:'wrong_pdu_reference',verdict:'failed',
  mutation:{requestObserved:true,originalPduRef:7,deliveredPduRef:8,originalBytes:38,deliveredBytes:38},
  unverifiedFreshValues:true,readRequests:1,correctReadbacks:1,proxyErrors:[],
  error:'cannot accept corrupted single READ_VAR reply',sourceCommit:commit};
 const parity={implementation:'node-red-contrib-s7-rust@1.4.0',nodeRed:'5.0.9',caseMode:'full',result:'failed',
  sourceCommit:commit,scenarios:{healthy_read:{result:'passed'},invalid_write:{result:'passed'},
    acknowledged_write:{result:'passed'},pending_read_on_unload:{result:'passed'},
    lost_write_ack:{result:'failed',fixtureApplied:true,ackDropsObserved:1,
      observedOutcome:'unexpected_success',totalWireWritesForAttempt:2,replayedWriteCount:1},
    blackhole_and_explicit_removal:{result:'failed',cotpObserved:true,reconnectAttemptsAfterRemoval:2,socketsAfterRemoval:0}}};
 const inputs=[readGood,wrong,parity];
 const files=['malformed-read-rust-inconsistent_data_length.json','malformed-read-rust-wrong_pdu_reference.json','rust-s7-ci-parity.json'];
 const reports=Object.fromEntries(files.map((f,i)=>[f,Buffer.from(JSON.stringify(inputs[i]))]));
 const outputs=[
  {name:'correct_header_rejection',exitCode:0,report:files[0],outcome:'SAFE_ON_THIS_CASE',observedRequests:2},
  {name:'wrong_pdu_reference',exitCode:1,report:files[1],outcome:'KNOWN_UNSAFE',originalRef:7,deliveredRef:8,observedRequests:1},
  {name:'lost_write_ack_and_teardown',exitCode:1,report:files[2],outcome:'KNOWN_UNSAFE',appliedWrites:2,retryWrites:1,lateCotpAttempts:2}];
 const baseline={schemaVersion:1,candidate:'node-red-contrib-s7-rust@1.4.0',classification:'NOT_QUALIFIED',
  behavioralSafety:'KNOWN_UNSAFE',instrumentControlsValid:true,originalDefectsReproduced:true,
  candidatePass:false,sourceCommit:commit,outputs};
 return {baseline,reports};
}
test('indexes exact three unsafe contracts without granting qualification',()=>{
 const {baseline,reports}=fixture();
 const result=buildIndex(baseline,reports,commit,registry);
 assert.deepEqual(result.contracts.map(c=>c.id).sort(),['S7-ERR-003','S7-ERR-004','S7-ERR-005']);
 assert.equal(result.candidatePass,false);
 assert.equal(result.fullCandidateQualification,false);
 assert.equal(result.classification,'NOT_QUALIFIED');
 assert.equal(result.positiveControls.length,1);
 assert.match(result.contracts[0].reportSha256,/^[0-9a-f]{64}$/);
 assert.match(result.contracts[0].evidenceType,/NOT_RAW_PACKET_CAPTURE/);
});
test('tampered report, source revision or assessor state fails',()=>{
 const {baseline,reports}=fixture();
 assert.throws(()=>buildIndex({...baseline,sourceCommit:'0'.repeat(40)},reports,commit,registry));
 assert.throws(()=>buildIndex({...baseline,candidatePass:true},reports,commit,registry));
 assert.throws(()=>buildIndex({...baseline,instrumentControlsValid:false},reports,commit,registry));
 const changed={...reports,[Object.keys(reports)[1]]:Buffer.from(JSON.stringify({
   ...JSON.parse(reports['malformed-read-rust-wrong_pdu_reference.json']),unverifiedFreshValues:false}))};
 assert.throws(()=>buildIndex(baseline,changed,commit,registry));
});
test('missing files and altered candidate process exits fail',()=>{
 const {baseline,reports}=fixture();
 const missing={...reports};delete missing['rust-s7-ci-parity.json'];
 assert.throws(()=>buildIndex(baseline,missing,commit,registry));
 const wrong={...baseline,outputs:baseline.outputs.map((x,i)=>i===2?{...x,exitCode:0}:x)};
 assert.throws(()=>buildIndex(wrong,reports,commit,registry));
});
