// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyWrite}=require('../scripts/assess-published-js-write.cjs');
const commit='e'.repeat(40);
function specimen(readback=[15,29,43],writes=1,verdict='passed'){
 const completed=readback.every((v,i)=>v===[15,29,43][i]);
 const span=Buffer.from([readback[0],10,readback[1],12,readback[2]]);
 return {schemaVersion:1,selectedEngine:'js',oracleId:'byte-write-1801-1803-1805-15-29-43-v1',
  sourceCommit:commit,jsVersion:'4.4.1',nodeRed:'5.0.9',
  rustVersion:'1.4.0',hardware:'PENDING_HARDWARE',candidatePass:false,
  classification:'UNASSESSED_NOT_QUALIFIED',relayErrors:[],results:{js:{multi_write_padding:{
   case:'multi_write_padding',node:'js',positiveSingleByteWrite:true,positiveSingleWriteRequests:1,
   expectedBytes:[15,29,43],actualReadback:readback,multiWriteRequests:writes,
   verdict,readbackComplete:completed,nodeErrors:[],
   externalReadback:readback,externalUntouched:[10,12],
   externalWitness:'python-snap7==3.3.1 external S7Comm client',
   externalSpanHex:span.toString('hex'),
   externalSpanSha256:crypto.createHash('sha256').update(span).digest('hex'),
   wireEvidence:{eventCount:4,chainSha256:'f'.repeat(64),
    events:[{direction:'client_rx',frameSha256:'a'.repeat(64)}]},
   ...(verdict==='failed'?{error:'AssertionError: all 3 dispersed 1-byte writes must be applied'}:{})
  }}}};
}
test('all bytes applied is scope observation not a release certificate',()=>{
 const r=verifyWrite(specimen(),commit);
 assert.equal(r.classification,'COMPLETE_WRITE_OBSERVED');
 assert.equal(r.candidateExit,0);
});
test('one byte only requires confirmed actual partial write',()=>{
 const r=verifyWrite(specimen([15,11,13],1,'failed'),commit);
 assert.equal(r.classification,'PARTIAL_WRITE_KNOWN_UNSAFE');
 assert.equal(r.appliedBytes,1);
});
test('zero bytes applied is not automatically unsafe: full rejection may be correct',()=>{
 const r=verifyWrite(specimen([99,11,13],0,'failed'),commit);
 assert.equal(r.classification,'NO_WRITE_APPLIED_OR_REJECTED');
 assert.equal(r.appliedBytes,0);
});
test('no positive control, missing bytes, missing real wire, crash or wrong report fails',()=>{
 const baseline=specimen([15,11,13],1,'failed');
 const changes=[
  r=>r.results.js.multi_write_padding.positiveSingleByteWrite=false,
  r=>r.results.js.multi_write_padding.actualReadback=null,
  r=>r.results.js.multi_write_padding.wireEvidence=null,
  r=>r.results.js.multi_write_padding.externalReadback=[15,99,43],
  r=>r.results.js.multi_write_padding.externalUntouched=[0,0],
  r=>r.results.js.multi_write_padding.externalSpanSha256='f'.repeat(64),
  r=>r.results.js.multi_write_padding.externalSpanHex='ffffffffffff',
  r=>r.results.js.multi_write_padding.externalWitness='in-process-cache',
  r=>r.results.js.multi_write_padding.externalReadbackError='external disconnected',
  r=>r.results.js.multi_write_padding.error='HARNESS_TIMEOUT',
  r=>r.relayErrors.push('socket error'),
  r=>r.sourceCommit='0'.repeat(40),
  r=>r.selectedEngine='rust',
  r=>r.oracleId='wrong-other-scenario',
  r=>r.candidatePass=true,
  r=>r.results.js.multi_write_padding.multiWriteRequests=0,
  r=>r.results.js.multi_write_padding.verdict='passed'
 ];
 for(const fn of changes){const r=structuredClone(baseline);fn(r);assert.throws(()=>verifyWrite(r,commit));}
});
