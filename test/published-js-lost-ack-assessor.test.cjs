// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyAckLoss}=require('../scripts/assess-published-js-lost-write-ack.cjs');
const commit='a'.repeat(40);
const hash='b'.repeat(64);
const real=Buffer.alloc(12);
real.writeFloatBE(12.5,0);real.writeInt16BE(-123,4);real.writeFloatBE(-8.5,8);
const witness={
 schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',
 reader:'python-snap7@3.3.1',readonly:true,
 db:1,address:8,byteCount:12,expected:-8.5,observed:-8.5,
 rawReal8Hex:real.subarray(8).toString('hex'),
 rawDb1Sha256:crypto.createHash('sha256').update(real).digest('hex'),
 unchanged:{REAL0:12.5,INT4:-123}
};
function specimen(writes=1) {
 const duplicated=writes>1;
 return {
  schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',sourceCommit:commit,
  candidate:'@oriolrius/node-red-contrib-s7@4.4.1',
  transport:'@oriolrius/nodes7@1.1.5',packageVersion:'4.4.1',nodeRed:'5.0.9',
  fixture:'python-snap7@3.3.1 DB1 64 synthetic bytes',hardware:'PENDING_HARDWARE',
  candidatePass:false,fullCandidateQualification:false,
  status:duplicated?'failed':'passed',
  classification:duplicated?'DUPLICATE_WRITE_KNOWN_UNSAFE':'NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED',
  ...(duplicated?{strictError:'AssertionError: strict original safety assertion: duplicate WRITE_VAR after applied and lost ACK'}:{}),
  relayErrors:[],scenarios:{
   acknowledged_write:{status:'passed',positiveReal8:19.75,wireWrites:1,readback:19.75},
   lost_write_ack:{
    status:duplicated?'failed':'passed',expectedValue:-8.5,
    observedWireWrites:writes,duplicateWireWrites:writes-1,fixtureApplied:true,
    droppedAckCount:1,peerDroppedAckProof:{fixtureAcknowledged:true,reference:123},
    callbackErrors:[],observationMs:11400,
    externalVerified:true,externalReadback:structuredClone(witness),
    wireEvidence:{eventCount:8,chainSha256:hash,events:[
     {direction:'client_rx',frameSha256:hash},
     {direction:'fixture_ack_dropped',frameSha256:hash}
    ]}
   }
  }
 };
}
function mutate(fn,writes=1){const d=specimen(writes);fn(d);return d}
test('real applied write with one S7 WRITE_VAR is narrow no-replay observation only',()=>{
 const v=verifyAckLoss(specimen(),commit);
 assert.equal(v.classification,'NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED');
 assert.equal(v.originalExit,0);
 assert.equal(v.fixtureApplied,true);
 assert.equal(v.externalVerified,true);
 assert.equal(v.replayCount,0);
});
test('real two wire writes force KNOWN_UNSAFE and strict original candidate exit 1',()=>{
 const v=verifyAckLoss(specimen(2),commit);
 assert.equal(v.classification,'DUPLICATE_WRITE_KNOWN_UNSAFE');
 assert.equal(v.originalExit,1);
 assert.equal(v.wireWrites,2);
 assert.equal(v.replayCount,1);
});
test('adversarial negative controls reject absent ACK, wrong DB, faulty observer and fake success',()=>{
 const edits=[
  x=>x.sourceCommit='c'.repeat(40),
  x=>x.candidate='@missel2/node-red-contrib-s7@0.1.0-alpha.2',
  x=>x.transport='@oriolrius/nodes7@0.1.0',
  x=>x.nodeRed='5.0.8',
  x=>x.candidatePass=true,
  x=>x.fatal='fixture crashed',
  x=>x.cleanupError='Node-RED flow unload failed',
  x=>x.relayErrors.push('socket crashed'),
  x=>x.scenarios.acknowledged_write.readback=3.25,
  x=>x.scenarios.acknowledged_write.wireWrites=2,
  x=>x.scenarios.lost_write_ack.fixtureApplied=false,
  x=>x.scenarios.lost_write_ack.droppedAckCount=0,
  x=>x.scenarios.lost_write_ack.peerDroppedAckProof.fixtureAcknowledged=false,
  x=>x.scenarios.lost_write_ack.observedWireWrites=0,
  x=>x.scenarios.lost_write_ack.duplicateWireWrites=3,
  x=>x.scenarios.lost_write_ack.externalVerified=false,
  x=>x.scenarios.lost_write_ack.externalReadback.observed=19.75,
  x=>x.scenarios.lost_write_ack.externalReadback.rawReal8Hex='00000000',
  x=>x.scenarios.lost_write_ack.externalReadback.rawDb1Sha256=hash,
  x=>x.scenarios.lost_write_ack.externalReadback.unchanged.REAL0=99,
  x=>x.scenarios.lost_write_ack.wireEvidence.eventCount=0,
  x=>x.scenarios.lost_write_ack.wireEvidence.chainSha256='x',
  x=>x.scenarios.lost_write_ack.wireEvidence.events.pop(),
  x=>x.scenarios.lost_write_ack.observationMs=100,
  x=>x.classification='COMPLETE_WRITE_OBSERVED',
  x=>x.status='failed'
 ];
 for(const edit of edits) assert.throws(()=>verifyAckLoss(mutate(edit),commit),String(edit));
});
test('unsafe duplicated write may not be converted into false no-replay pass',()=>{
 const edits=[
  x=>x.classification='NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED',
  x=>x.status='passed',
  x=>x.strictError=undefined,
  x=>x.scenarios.lost_write_ack.status='passed',
  x=>x.scenarios.lost_write_ack.duplicateWireWrites=0
 ];
 for(const f of edits) assert.throws(()=>verifyAckLoss(mutate(f,2),commit),String(f));
});
