// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A scoped positive Rust write is not a Rust release qualification.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const {verifyWrite}=require('./assess-published-js-write.cjs');
const root=path.join(__dirname,'..');
const reports=path.join(root,'test-reports');
const target='published-rust-three-byte-write.json';
const summaryName='published-rust-three-byte-assessment.json';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function main(){
 fs.mkdirSync(reports,{recursive:true});
 fs.rmSync(path.join(reports,target),{force:true});
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(process.env.GITHUB_SHA,sourceCommit,'Must use the exact checked-out CI commit');
 const summary={schemaVersion:1,sourceCommit,scope:'SOFTWARE_LOOPBACK_ONLY',
  package:'node-red-contrib-s7-rust',version:'1.4.0',
  oracleId:'byte-write-1801-1803-1805-15-29-43-v1',
  status:'NOT_QUALIFIED',candidatePass:false,fullCandidateQualification:false};
 try{
  const p=spawnSync(process.execPath,
   ['test/candidates/published-js-three-byte-write.cjs',path.join(root,'.candidate-consumer')],{
    cwd:root,env:{...process.env,S7_WRITE_ENGINE:'rust'},
    timeout:110000,killSignal:'SIGKILL',encoding:'utf8',maxBuffer:8*1024*1024
   });
  if(p.error||p.signal||![0,1].includes(p.status))
   throw Error('Native Rust candidate crashed, timed out or exited unexpectedly: '+p.status+
    ' signal='+p.signal+' error='+String(p.error)+
    '\\n'+String(p.stderr).slice(-2200)+'\\n'+String(p.stdout).slice(-1200));
  const filepath=path.join(reports,target);
  assert.ok(fs.existsSync(filepath),'Missing strict native Rust original report');
  const bytes=fs.readFileSync(filepath);
  const raw=JSON.parse(bytes);
  const v=verifyWrite(raw,sourceCommit,'rust');
  assert.equal(p.status,v.candidateExit,'Original strict native Rust write exit and independently assessed outcome disagree');
  assert.equal(v.classification,'COMPLETE_WRITE_OBSERVED',
   'Published Rust 1.4.0 does not correctly apply all 3 dispersed BYTE values');
  assert.deepEqual(v.readback,[15,29,43]);
  assert.ok(v.observedWrites>=1,'No actual WRITE_VAR measured');
  Object.assign(summary,v,{report:target,reportSha256:hash(bytes),
    instrumentControlsValid:true,originalStrictExit:p.status});
  console.log('PUBLISHED_RUST_THREE_BYTE_WRITE='+JSON.stringify(v));
 }catch(error){
  summary.instrumentControlsValid=false;
  summary.error=String(error?.stack||error).slice(0,5500);
  console.error('RUST_THREE_BYTE_ASSESSMENT_RED '+summary.error);
  process.exitCode=1;
 }finally{
  fs.writeFileSync(path.join(reports,summaryName),JSON.stringify(summary,null,2)+'\n');
 }
}
if(require.main===module)main();
module.exports={main};
