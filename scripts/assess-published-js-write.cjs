// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Evidence-only assessor: exit 0 is NOT full candidate qualification.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const REPORT=path.join(root,'test-reports/published-js-three-byte-write.json');
const OUT=path.join(root,'test-reports/published-js-three-byte-assessment.json');
const SHA=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const intended=[15,29,43];
const offsets=[1801,1803,1805];
function verifyWrite(report,commit,engine='js'){
 assert.equal(report.schemaVersion,1);
 assert.ok(['js','rust'].includes(engine));
 assert.equal(report.selectedEngine,engine);
 assert.equal(report.oracleId,'byte-write-1801-1803-1805-15-29-43-v1');
 assert.equal(report.sourceCommit,commit);
 assert.equal(report.jsVersion,'4.4.1');
 assert.equal(report.nodeRed,'5.0.9');
 assert.equal(report.rustVersion,'1.4.0');
 assert.equal(report.hardware,'PENDING_HARDWARE');
 assert.equal(report.candidatePass,false);
 assert.equal(report.classification,'UNASSESSED_NOT_QUALIFIED');
 for(const field of ['fatal','stopError','proxyError','fixtureError'])
   assert.equal(report[field],undefined,field+' indicates harness failure');
 assert.deepEqual(report.relayErrors,[]);
 const check=report.results?.[engine]?.multi_write_padding;
 assert.ok(check,'Missing real JS write result');
 assert.equal(check.case,'multi_write_padding');
 assert.equal(check.node,engine);
 assert.equal(check.positiveSingleByteWrite,true);
 assert.equal(check.positiveSingleWriteRequests,1);
 assert.deepEqual(check.expectedBytes,intended);
 assert.ok(Number.isSafeInteger(check.multiWriteRequests) && check.multiWriteRequests>=0);
 assert.ok(Array.isArray(check.actualReadback) && check.actualReadback.length===3,
   'No independent readback from synthetic DB1');
 assert.ok(check.actualReadback.every(x=>Number.isInteger(x)&&x>=0&&x<=255),
   'Readback must contain three real byte values');
 assert.ok(Array.isArray(check.nodeErrors));
 assert.ok(check.wireEvidence?.eventCount>0,'Require real original frame measurements');
 assert.ok(check.wireEvidence?.events?.some(e=>e.direction==='client_rx' && /^[a-f0-9]{64}$/.test(e.frameSha256)));
 assert.match(check.wireEvidence.chainSha256,/^[a-f0-9]{64}$/);
 const applied=check.actualReadback.map((x,i)=>x===intended[i]);
 const count=applied.filter(Boolean).length;
 const all=count===3;
 if(all){
  assert.equal(check.verdict,'passed');
  assert.equal(check.readbackComplete,true);
  assert.ok(check.multiWriteRequests>=1,'No real wire write');
  assert.equal(check.error,undefined);
  return {classification:'COMPLETE_WRITE_OBSERVED',candidateExit:0,appliedBytes:3,
    observedWrites:check.multiWriteRequests,readback:check.actualReadback};
 }
 assert.equal(check.verdict,'failed');
 assert.equal(check.readbackComplete,false);
 assert.match(check.error||'',/all 3 dispersed 1-byte writes must be applied/);
 // Only SOME applied bytes is a partial write; zero applied could be a
 // legitimate complete rejection or an unsupported API. Never conflate.
 const classification=count>0?'PARTIAL_WRITE_KNOWN_UNSAFE':'NO_WRITE_APPLIED_OR_REJECTED';
 if(count>0)assert.ok(check.multiWriteRequests>=1,'Partial application requires real wire write');
 return {classification,candidateExit:1,appliedBytes:count,
   observedWrites:check.multiWriteRequests,readback:check.actualReadback};
}
function main(){
 fs.mkdirSync(path.dirname(REPORT),{recursive:true});
 fs.rmSync(REPORT,{force:true});
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.equal(process.env.GITHUB_SHA,commit);
 const summary={schemaVersion:1,sourceCommit:commit,scope:'SOFTWARE_LOOPBACK_ONLY',
  package:'@oriolrius/node-red-contrib-s7',version:'4.4.1',
  historicalAlpha:'@missel2/node-red-contrib-s7@0.1.0-alpha.2',
  oracleId:'byte-write-1801-1803-1805-15-29-43-v1',
  status:'NOT_QUALIFIED',candidatePass:false,fullCandidateQualification:false};
 try{
  const proc=spawnSync(process.execPath,['test/candidates/published-js-three-byte-write.cjs',path.join(root,'.candidate-consumer')],{
   cwd:root,env:{...process.env},encoding:'utf8',timeout:110000,killSignal:'SIGKILL',maxBuffer:8*1024*1024});
  if(proc.error||proc.signal||![0,1].includes(proc.status))
   throw Error('Candidate harness failed exit='+proc.status+' signal='+proc.signal+' '+String(proc.error)+'\n'+String(proc.stderr).slice(-1800));
  assert.ok(fs.existsSync(REPORT),'Real candidate report absent');
  const bytes=fs.readFileSync(REPORT);
  const d=JSON.parse(bytes);
  const v=verifyWrite(d,commit);
  assert.equal(proc.status,v.candidateExit,'Original strict candidate exit and assessment mismatch');
  Object.assign(summary,v,{report:'published-js-three-byte-write.json',reportSha256:SHA(bytes),instrumentControlsValid:true});
  console.log('PUBLISHED_JS_THREE_BYTE_WRITE='+JSON.stringify(v));
 }catch(error){
  summary.instrumentControlsValid=false;
  summary.error=String(error?.stack||error).slice(0,5000);
  console.error('PUBLISHED_JS_WRITE_ASSESSMENT_RED '+summary.error);
  process.exitCode=1;
 }finally{
  fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+'\n');
 }
}
if(require.main===module)main();
module.exports={verifyWrite};
