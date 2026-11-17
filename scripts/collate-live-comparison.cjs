// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Same-commit executed-candidate report collation; this script does NOT execute
// the probes itself. CI MUST run all strict original candidate probes first.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const outcomes=new Set(['KNOWN_UNSAFE','SCOPED_PASS','NOT_OBSERVED_UNSAFE']);
function digest(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}
function collate(inputs, head) {
 assert.match(head,SHA);
 const {positive,write,rustWrite,read,rust,lockBytes}=inputs;
 for(const [name,d] of Object.entries({positive,write,rustWrite,read,rust})){
  assert.ok(d && typeof d==='object' && !Array.isArray(d),name+' report must be actual JSON object');
  assert.equal(d.sourceCommit,head,name+' must come from the exact current CI source commit');
 }
 assert.equal(positive.status,'passed');
 assert.equal(positive.nodeRed,'5.0.9');
 assert.equal(positive.packageIds?.js,'4.4.1');
 assert.equal(positive.packageIds?.rust,'1.4.0');
 for(const engine of ['js','rust']){
  assert.equal(positive.candidates?.[engine]?.status,'passed',engine+' healthy control');
  assert.equal(positive.candidates[engine].readVerified,true,engine+' genuine S7 read');
  assert.equal(positive.candidates[engine].closeVerified,true,engine+' actual client teardown');
 }
 assert.equal(write.scope===undefined||write.scope==='SOFTWARE_LOOPBACK_ONLY',true);
 assert.equal(write.status,'NOT_QUALIFIED');
 assert.equal(write.candidatePass,false);
 assert.equal(write.instrumentControlsValid,true);
 assert.equal(write.oracleId,'byte-write-1801-1803-1805-15-29-43-v1');
 assert.equal(write.package,'@oriolrius/node-red-contrib-s7');
 assert.equal(write.version,'4.4.1');
 assert.equal(write.classification,'COMPLETE_WRITE_OBSERVED');
 assert.equal(write.appliedBytes,3);
 assert.equal(write.externalVerified,true,'JS requires independent external DB1 readback');
 assert.deepEqual(write.readback,[15,29,43]);
 assert.equal(write.observedWrites,1);
 assert.match(write.reportSha256,HEX);
 assert.equal(rustWrite.status,'NOT_QUALIFIED');
 assert.equal(rustWrite.candidatePass,false);
 assert.equal(rustWrite.instrumentControlsValid,true);
 assert.equal(rustWrite.package,'node-red-contrib-s7-rust');
 assert.equal(rustWrite.version,'1.4.0');
 assert.equal(rustWrite.oracleId,write.oracleId,'Must execute the exact same three-byte scenario oracle');
 assert.equal(rustWrite.classification,'COMPLETE_WRITE_OBSERVED');
 assert.equal(rustWrite.appliedBytes,3);
 assert.equal(rustWrite.externalVerified,true,'Native Rust requires independent external DB1 readback');
 assert.deepEqual(rustWrite.readback,[15,29,43],'Native Rust must actually read back all three DB1 bytes');
 assert.ok(Number.isSafeInteger(rustWrite.observedWrites)&&rustWrite.observedWrites>=1);
 assert.equal(rustWrite.originalStrictExit,0,'Original native strict probe must really pass');
 assert.match(rustWrite.reportSha256,HEX);
 assert.equal(read.scope,'SOFTWARE_LOOPBACK_ONLY');
 assert.equal(read.candidatePass,false);
 assert.equal(read.instrumentControlsValid,true);
 assert.equal(read.package,'@oriolrius/node-red-contrib-s7');
 assert.equal(read.version,'4.4.1');
 assert.equal(read.classification,'KNOWN_UNSAFE');
 assert.ok(Array.isArray(read.results) && read.results.length===3);
 const expectedFaults=new Map([
  ['inconsistent_data_length','KNOWN_UNSAFE'],
  ['wrong_pdu_reference','NO_INVALID_FRESH_OBSERVED'],
  ['short_s7_reply','NO_INVALID_FRESH_OBSERVED']
 ]);
 const faults=new Map();
 for(const x of read.results){
  assert.ok(expectedFaults.has(x.fault),'Unexpected JS fault');
  assert.ok(!faults.has(x.fault),'Duplicate JS fault');
  assert.equal(x.classification,expectedFaults.get(x.fault),'JS original strict classification changed');
  assert.equal(x.strictCandidateExit,x.classification==='KNOWN_UNSAFE'?1:0);
  assert.equal(x.sourceCommit,head);
  assert.match(x.reportSha256,HEX);
  faults.set(x.fault,x);
 }
 assert.equal(faults.size,expectedFaults.size);
 assert.equal(rust.schemaVersion,1);
 assert.equal(rust.candidate,'node-red-contrib-s7-rust@1.4.0');
 assert.equal(rust.classification,'NOT_QUALIFIED');
 assert.equal(rust.behavioralSafety,'KNOWN_UNSAFE');
 assert.equal(rust.instrumentControlsValid,true);
 assert.equal(rust.originalDefectsReproduced,true);
 assert.equal(rust.candidatePass,false);
 assert.ok(Array.isArray(rust.outputs) && rust.outputs.length===3);
 const rustOutputs=new Map(rust.outputs.map(x=>[x.name,x]));
 assert.equal(rustOutputs.size,3);
 for(const [name,outcome,exit] of [
   ['correct_header_rejection','SAFE_ON_THIS_CASE',0],
   ['wrong_pdu_reference','KNOWN_UNSAFE',1],
   ['lost_write_ack_and_teardown','KNOWN_UNSAFE',1]
 ]){
  const x=rustOutputs.get(name);
  assert.ok(x,'Missing real Rust report '+name);
  assert.equal(x.outcome,outcome);
  assert.equal(x.exitCode,exit);
  assert.ok(typeof x.report==='string' && x.report.endsWith('.json'));
 }
 assert.ok(Buffer.isBuffer(lockBytes),'Input exact npm lock bytes required');
 const lock=JSON.parse(lockBytes);
 for(const [pkg,version] of [
  ['node-red','5.0.9'],
  ['node-red-node-test-helper','0.3.6'],
  ['@oriolrius/node-red-contrib-s7','4.4.1'],
  ['node-red-contrib-s7-rust','1.4.0']
 ]){
  const p=lock.packages?.['node_modules/'+pkg];
  assert.equal(p?.version,version,pkg+' original published version');
  assert.ok(typeof p.integrity==='string' && p.integrity.startsWith('sha512-'),pkg+' actual SRI');
  assert.ok(p.resolved?.startsWith('https://registry.npmjs.org/'),pkg+' published npm source');
 }
 const transport=lock.packages?.['node_modules/@oriolrius/nodes7'];
 assert.ok(transport?.integrity?.startsWith('sha512-'),'Missing JS transport exact SRI');
 assert.equal(transport.version,'1.1.5');
 const cells=[];
 function add(candidate,scenario,outcome,report) {
  assert.ok(outcomes.has(outcome));
  cells.push({candidate,scenario,outcome,report,sourceCommit:head});
 }
 for(const x of ['js','rust'])add(x,'READ_HEALTHY_DB1','SCOPED_PASS','common-s7-compare.json');
 add('js','WRITE_THREE_DISJOINT_BYTES','SCOPED_PASS','published-js-three-byte-assessment.json');
 add('rust','WRITE_THREE_DISJOINT_BYTES','SCOPED_PASS','published-rust-three-byte-assessment.json');
 add('js','READ_IMPOSSIBLE_ACK_LENGTH','KNOWN_UNSAFE','published-js-read-characterization.json');
 add('js','READ_WRONG_PDU_REFERENCE','NOT_OBSERVED_UNSAFE','published-js-read-characterization.json');
 add('js','READ_SHORT_REPLY','NOT_OBSERVED_UNSAFE','published-js-read-characterization.json');
 add('rust','READ_IMPOSSIBLE_ACK_LENGTH','SCOPED_PASS','rust-1.4.0-baseline-assessment.json');
 add('rust','READ_WRONG_PDU_REFERENCE','KNOWN_UNSAFE','rust-1.4.0-baseline-assessment.json');
 add('rust','WRITE_ACK_LOST_AFTER_APPLY','KNOWN_UNSAFE','rust-1.4.0-baseline-assessment.json');
 add('rust','COTP_AFTER_EXPLICIT_UNLOAD','KNOWN_UNSAFE','rust-1.4.0-baseline-assessment.json');
 const ids=new Set();
 for(const cell of cells){
  const k=cell.candidate+':'+cell.scenario;
  if(ids.has(k))throw Error('Duplicate report cell '+k);
  ids.add(k);
 }
 return {schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',sourceCommit:head,
  source:'SAME_CI_RUN_ACTUAL_CANDIDATE_PROCESSES',candidateQualified:false,
  fullCandidateQualification:false,globalRanking:null,
  packageLockSha256:digest(lockBytes),
  versions:{js:'@oriolrius/node-red-contrib-s7@4.4.1',jsTransport:'@oriolrius/nodes7@1.1.5',
   rust:'node-red-contrib-s7-rust@1.4.0',nodeRed:'5.0.9'},
  strictCandidateFailuresPreserved:true,independentInstrumentControlsPassed:true,cells};
}
// Bind summaries to the actual original report bytes in THIS run. The original
// candidate safety assertions are still authoritative and have already run.
function verifyRawLinks(inputs, reportDir, head){
 const expected=new Map();
 function add(file,claimedDigest=null) {
  assert.match(file,/^[a-zA-Z0-9_.-]+\.json$/,'Unsafe or missing original filename');
  if(expected.has(file)){
   if(claimedDigest!==null)assert.equal(expected.get(file),claimedDigest);
   return;
  }
  expected.set(file,claimedDigest);
 }
 add('common-s7-compare.json',inputs.read.positiveControl?.reportSha256);
 add('published-js-three-byte-write.json',inputs.write.reportSha256);
 add('published-rust-three-byte-write.json',inputs.rustWrite.reportSha256);
 for(const r of inputs.read.results)add(r.report,r.reportSha256);
 const rustMap={
  correct_header_rejection:'malformed-read-rust-inconsistent_data_length.json',
  wrong_pdu_reference:'malformed-read-rust-wrong_pdu_reference.json',
  lost_write_ack_and_teardown:'rust-s7-ci-parity.json'
 };
 for(const r of inputs.rust.outputs){
  assert.equal(r.report,rustMap[r.name],'Original Rust report misassociated with a behavior');
  add(r.report);
 }
 assert.equal(expected.size,9,'Exactly 9 actual positive/strict candidate report files required');
 const result={};
 for(const [name,claimed] of expected){
  const raw=fs.readFileSync(path.join(reportDir,name));
  const record=JSON.parse(raw);
  assert.ok(record && typeof record==='object' && !Array.isArray(record),'Malformed original JSON '+name);
  if(record.sourceCommit!==undefined)assert.equal(record.sourceCommit,head,name+' stale original report');
  const actual=digest(raw);
  if(claimed!==null)assert.equal(claimed,actual,'Summary digest does not match original JSON bytes: '+name);
  result[name]=actual;
 }
 return result;
}

function main(){
 const head=process.env.GITHUB_SHA;
 assert.match(head||'',SHA,'GITHUB_SHA must pin an actual CI run');
 const dir=path.join(root,'test-reports');
 const names=['common-s7-compare.json','published-js-three-byte-assessment.json',
  'published-rust-three-byte-assessment.json','published-js-read-characterization.json',
  'rust-1.4.0-baseline-assessment.json'];
 const bytes=names.map(n=>fs.readFileSync(path.join(dir,n)));
 const inputs={positive:JSON.parse(bytes[0]),write:JSON.parse(bytes[1]),rustWrite:JSON.parse(bytes[2]),
  read:JSON.parse(bytes[3]),rust:JSON.parse(bytes[4]),
  lockBytes:fs.readFileSync(path.join(root,'.candidate-consumer/package-lock.json'))};
 const result=collate(inputs,head);
 result.originalStrictReportHashes=verifyRawLinks(inputs,dir,head);
 result.inputReports=Object.fromEntries(names.map((n,i)=>[n,digest(bytes[i])]));
 result.ciRun=process.env.GITHUB_RUN_ID||null;
 result.candidateOutputsNotQualified=true;
 fs.writeFileSync(path.join(dir,'live-comparison-v1.json'),JSON.stringify(result,null,2)+'\n');
 console.log('LIVE_SAME_RUN_S7_COMPARISON='+JSON.stringify({commit:head,cells:result.cells.length,
  knownUnsafe:result.cells.filter(x=>x.outcome==='KNOWN_UNSAFE').length,candidateQualified:false}));
}
if(require.main===module){try{main()}catch(e){console.error('LIVE_COMPARISON_RED '+String(e.stack||e));process.exitCode=1}}
module.exports={collate,verifyRawLinks};
