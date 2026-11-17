// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyWrite}=require('../scripts/assess-published-js-write.cjs');
const SHA='e'.repeat(40);
const ORACLE='byte-write-1801-1803-1805-15-29-43-v1';
function rust(readback=[15,29,43],verdict='passed',wireWrites=1){
 const good=readback.every((x,i)=>x===[15,29,43][i]);
 return {schemaVersion:1,selectedEngine:'rust',oracleId:ORACLE,
  sourceCommit:SHA,jsVersion:'4.4.1',rustVersion:'1.4.0',
  nodeRed:'5.0.9',hardware:'PENDING_HARDWARE',candidatePass:false,
  classification:'UNASSESSED_NOT_QUALIFIED',relayErrors:[],
  results:{rust:{multi_write_padding:{node:'rust',case:'multi_write_padding',
   verdict,positiveSingleByteWrite:true,positiveSingleWriteRequests:1,
   expectedBytes:[15,29,43],actualReadback:readback,
   multiWriteRequests:wireWrites,readbackComplete:good,nodeErrors:[],
   wireEvidence:{eventCount:3,chainSha256:'b'.repeat(64),
    events:[{direction:'client_rx',frameSha256:'a'.repeat(64)}]},
   ...(verdict==='failed'?{error:'AssertionError: all 3 dispersed 1-byte writes must be applied'}:{})
  }}}};
}
test('one oracle truly assesses the real native Rust engine rather than JS',()=>{
 const result=verifyWrite(rust(),SHA,'rust');
 assert.equal(result.classification,'COMPLETE_WRITE_OBSERVED');
 assert.deepEqual(result.readback,[15,29,43]);
 assert.equal(result.appliedBytes,3);
 assert.equal(result.candidateExit,0);
});
test('partial Rust write stays unsafe and never becomes a false PASS',()=>{
 const result=verifyWrite(rust([15,11,13],'failed'),SHA,'rust');
 assert.equal(result.classification,'PARTIAL_WRITE_KNOWN_UNSAFE');
 assert.equal(result.appliedBytes,1);
 assert.equal(result.candidateExit,1);
});
test('a rejected Rust write without applied bytes is not classified as partial',()=>{
 const result=verifyWrite(rust([99,11,13],'failed',0),SHA,'rust');
 assert.equal(result.classification,'NO_WRITE_APPLIED_OR_REJECTED');
 assert.equal(result.candidateExit,1);
});
test('engine mismatch, missing original TCP hashes, forged version, stale CI and wrong control must be red',()=>{
 const changes=[
  d=>d.selectedEngine='js',
  d=>d.oracleId='forged',
  d=>d.sourceCommit='a'.repeat(40),
  d=>d.rustVersion='9.9.9',
  d=>d.results.rust.multi_write_padding.node='js',
  d=>d.results.rust.multi_write_padding.positiveSingleByteWrite=false,
  d=>d.results.rust.multi_write_padding.positiveSingleWriteRequests=0,
  d=>d.results.rust.multi_write_padding.wireEvidence=null,
  d=>d.results.rust.multi_write_padding.readbackComplete=false,
  d=>d.results.rust.multi_write_padding.actualReadback=[15,29,null],
  d=>d.results.rust.multi_write_padding.multiWriteRequests=0,
  d=>d.relayErrors=['socket failed'],
  d=>d.candidatePass=true
 ];
 for(const modify of changes){
  const d=rust();modify(d);
  assert.throws(()=>verifyWrite(d,SHA,'rust'),String(modify));
 }
});
