// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Green characterization != driver qualification. Preserve the strict original
// candidate process exit and all independent observed wire/DB1 facts.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const REPORT=path.join(root,'test-reports/published-js-lost-write-ack.json');
const OUT=path.join(root,'test-reports/published-js-lost-write-ack-assessment.json');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const HEX=/^[0-9a-f]{64}$/;

function verifyAckLoss(d,commit) {
 assert.equal(d.schemaVersion,1);
 assert.equal(d.scope,'SOFTWARE_LOOPBACK_ONLY');
 assert.equal(d.sourceCommit,commit);
 assert.equal(d.candidate,'@oriolrius/node-red-contrib-s7@4.4.1');
 assert.equal(d.transport,'@oriolrius/nodes7@1.1.5');
 assert.equal(d.packageVersion,'4.4.1');
 assert.equal(d.nodeRed,'5.0.9');
 assert.equal(d.fixture,'python-snap7@3.3.1 DB1 64 synthetic bytes');
 assert.equal(d.hardware,'PENDING_HARDWARE');
 assert.equal(d.candidatePass,false);
 assert.equal(d.fullCandidateQualification,false);
 for(const key of ['fatal','cleanupError','stopError','proxyError','fixtureError'])
   assert.equal(d[key],undefined,key+' is a harness failure, not a candidate outcome');
 assert.deepEqual(d.relayErrors,[]);
 const positive=d.scenarios?.acknowledged_write;
 assert.equal(positive?.status,'passed');
 assert.equal(positive.wireWrites,1);
 assert.equal(positive.readback,19.75);
 assert.equal(positive.positiveReal8,19.75);
 const x=d.scenarios?.lost_write_ack;
 assert.ok(x,'Actual lost ACK original candidate scenario required');
 assert.equal(x.expectedValue,-8.5);
 assert.equal(x.fixtureApplied,true);
 assert.equal(x.droppedAckCount,1);
 assert.equal(x.peerDroppedAckProof.fixtureAcknowledged,true);
 assert.ok(Number.isSafeInteger(x.observedWireWrites)&&x.observedWireWrites>=1);
 assert.equal(x.duplicateWireWrites,x.observedWireWrites-1);
 assert.ok(x.observationMs>=9000&&x.observationMs<45000,'Bounded post-ACK retry observation');
 assert.ok(Array.isArray(x.callbackErrors)&&x.callbackErrors.every(v=>typeof v==='string'&&v.length<=800));
 assert.equal(x.externalVerified,true);
 const witness=x.externalReadback;
 assert.equal(witness.schemaVersion,1);
 assert.equal(witness.scope,'SOFTWARE_LOOPBACK_ONLY');
 assert.equal(witness.reader,'python-snap7@3.3.1');
 assert.equal(witness.readonly,true);
 assert.equal(witness.db,1);
 assert.equal(witness.address,8);
 assert.equal(witness.byteCount,12);
 assert.equal(witness.expected,-8.5);
 assert.equal(witness.observed,-8.5);
 assert.deepEqual(witness.unchanged,{REAL0:12.5,INT4:-123});
 const raw=Buffer.alloc(12);
 raw.writeFloatBE(12.5,0);
 raw.writeInt16BE(-123,4);
 raw.writeFloatBE(-8.5,8);
 assert.equal(witness.rawReal8Hex,raw.subarray(8).toString('hex'));
 assert.equal(witness.rawDb1Sha256,sha256(raw),'Independent DB1 witness bytes/sentinel hash must match');
 assert.ok(x.wireEvidence?.eventCount>=5);
 assert.match(x.wireEvidence.chainSha256,HEX);
 assert.ok(x.wireEvidence.events?.some(e=>e.direction==='fixture_ack_dropped'&&HEX.test(e.frameSha256)),
   'Require real fixture positive WRITE_VAR ACK and its wire hash');
 assert.ok(x.wireEvidence.events.some(e=>e.direction==='client_rx'&&HEX.test(e.frameSha256)),
   'Require actual client WRITE_VAR frame fingerprint');
 if(x.observedWireWrites>=2){
  assert.equal(d.status,'failed','Duplicate is an original strict-candidate failure');
  assert.equal(x.status,'failed');
  assert.equal(d.classification,'DUPLICATE_WRITE_KNOWN_UNSAFE');
  assert.match(d.strictError||'',/strict original safety assertion: duplicate WRITE_VAR/);
  return {classification:'DUPLICATE_WRITE_KNOWN_UNSAFE',originalExit:1,wireWrites:x.observedWireWrites,
   replayCount:x.duplicateWireWrites,fixtureApplied:true,externalVerified:true,observedErrors:x.callbackErrors.length};
 }
 assert.equal(x.observedWireWrites,1);
 assert.equal(x.status,'passed');
 assert.equal(d.status,'passed');
 assert.equal(d.classification,'NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED');
 assert.equal(d.strictError,undefined);
 return {classification:'NO_REPLAY_OBSERVED_OUTCOME_UNASSESSED',originalExit:0,
  wireWrites:1,replayCount:0,fixtureApplied:true,externalVerified:true,observedErrors:x.callbackErrors.length};
}
function main(){
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(process.env.GITHUB_SHA,commit);
 const summary={schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',sourceCommit:commit,
  candidate:'@oriolrius/node-red-contrib-s7@4.4.1',contract:'WRITE_ACK_LOST_AFTER_APPLY',
  status:'NOT_QUALIFIED',candidatePass:false,fullCandidateQualification:false};
 fs.mkdirSync(path.dirname(REPORT),{recursive:true});
 fs.rmSync(REPORT,{force:true});
 try{
  const p=spawnSync(process.execPath,['test/candidates/published-js-lost-write-ack.cjs',
   path.join(root,'.candidate-consumer')],{
   cwd:root,env:{...process.env},encoding:'utf8',timeout:120000,
   killSignal:'SIGKILL',maxBuffer:8*1024*1024
  });
  if(p.error||p.signal||![0,1].includes(p.status))
   throw Error('Real candidate crashed/stalled status='+p.status+' signal='+p.signal+' error='+p.error+
    '\n'+String(p.stderr).slice(-2000));
  assert.ok(fs.existsSync(REPORT),'Strict original report absent');
  const bytes=fs.readFileSync(REPORT);
  const v=verifyAckLoss(JSON.parse(bytes),commit);
  assert.equal(p.status,v.originalExit,'Strict original candidate exit changed or hidden');
  Object.assign(summary,v,{report:'published-js-lost-write-ack.json',
   reportSha256:sha256(bytes),instrumentControlsValid:true});
  console.log('PUBLISHED_JS_LOST_ACK_CHARACTERIZATION='+JSON.stringify(v));
 }catch(e){
  summary.instrumentControlsValid=false;
  summary.error=String(e?.stack||e).slice(0,4500);
  console.error('PUBLISHED_JS_ACK_LOSS_ASSESSOR_RED '+summary.error);
  process.exitCode=1;
 }finally{
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+'\n');
 }
}
if(require.main===module)main();
module.exports={verifyAckLoss};
