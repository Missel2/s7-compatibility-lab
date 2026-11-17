// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collate,verifyRawLinks}=require('../scripts/collate-live-comparison.cjs');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const sha='a'.repeat(40);
const hash='b'.repeat(64);
const packages=Object.fromEntries([
  ['node-red','5.0.9'],['node-red-node-test-helper','0.3.6'],
  ['@oriolrius/node-red-contrib-s7','4.4.1'],['node-red-contrib-s7-rust','1.4.0'],
  ['@oriolrius/nodes7','1.1.5']
].map(([k,v])=>['node_modules/'+k,{version:v,integrity:'sha512-EXACTFIXTURE',resolved:'https://registry.npmjs.org/'+k}]));
function specimen(){
 return {positive:{sourceCommit:sha,schemaVersion:1,nodeRed:'5.0.9',status:'passed',
   packageIds:{js:'4.4.1',rust:'1.4.0'},candidates:{
    js:{status:'passed',readVerified:true,closeVerified:true},
    rust:{status:'passed',readVerified:true,closeVerified:true}
   }},
  write:{sourceCommit:sha,status:'NOT_QUALIFIED',candidatePass:false,
   instrumentControlsValid:true,package:'@oriolrius/node-red-contrib-s7',version:'4.4.1',
   classification:'COMPLETE_WRITE_OBSERVED',appliedBytes:3,readback:[15,29,43],observedWrites:1,
   reportSha256:hash},
  read:{sourceCommit:sha,scope:'SOFTWARE_LOOPBACK_ONLY',candidatePass:false,
   instrumentControlsValid:true,package:'@oriolrius/node-red-contrib-s7',version:'4.4.1',
   classification:'KNOWN_UNSAFE',
   results:['inconsistent_data_length','wrong_pdu_reference','short_s7_reply'].map((fault,i)=>({
      fault,classification:i===0?'KNOWN_UNSAFE':'NO_INVALID_FRESH_OBSERVED',
      strictCandidateExit:i===0?1:0,reportSha256:hash,sourceCommit:sha
   }))},
  rust:{sourceCommit:sha,schemaVersion:1,candidate:'node-red-contrib-s7-rust@1.4.0',
   classification:'NOT_QUALIFIED',behavioralSafety:'KNOWN_UNSAFE',candidatePass:false,
   instrumentControlsValid:true,originalDefectsReproduced:true,
   outputs:[
     {name:'correct_header_rejection',report:'rust-correct.json',reportSha256:hash,outcome:'SAFE_ON_THIS_CASE',exitCode:0},
     {name:'wrong_pdu_reference',report:'rust-wrong.json',reportSha256:hash,outcome:'KNOWN_UNSAFE',exitCode:1},
     {name:'lost_write_ack_and_teardown',report:'rust-faults.json',reportSha256:hash,outcome:'KNOWN_UNSAFE',exitCode:1}
   ]},
  lockBytes:Buffer.from(JSON.stringify({packages}))
 };
}
function mutated(fn){const d=specimen();fn(d);return d}
test('actual same-run results only yield scoped per-scenario comparison with strict unsafe exits',()=>{
 const c=collate(specimen(),sha);
 assert.equal(c.sourceCommit,sha);
 assert.equal(c.cells.length,10);
 assert.equal(c.cells.filter(x=>x.outcome==='KNOWN_UNSAFE').length,4);
 assert.equal(c.cells.filter(x=>x.outcome==='SCOPED_PASS').length,4);
 assert.equal(c.globalRanking,null);
 assert.equal(c.fullCandidateQualification,false);
 assert.equal(c.strictCandidateFailuresPreserved,true);
 assert.match(c.packageLockSha256,/^[a-f0-9]{64}$/);
});
test('rejects fake or missing original strict candidate failures, same-run SHA or safety controls',()=>{
 const corrupt=[
  x=>x.positive.sourceCommit='c'.repeat(40),
  x=>x.positive.candidates.js.closeVerified=false,
  x=>x.write.readback=[15,11,13],
  x=>x.write.appliedBytes=1,
  x=>x.write.candidatePass=true,
  x=>x.read.results[0].classification='NO_INVALID_FRESH_OBSERVED',
  x=>x.read.results[0].strictCandidateExit=0,
  x=>x.read.results.push({...x.read.results[0]}),
  x=>x.read.results.pop(),
  x=>x.rust.originalDefectsReproduced=false,
  x=>x.rust.outputs[1].exitCode=0,
  x=>x.rust.outputs[1].reportSha256='not-a-valid-sha256',
  x=>{delete x.rust.outputs[0].reportSha256},
  x=>x.rust.outputs[2].outcome='SAFE_ON_THIS_CASE',
  x=>x.rust.outputs[0].outcome='KNOWN_UNSAFE',
  x=>x.rust.instrumentControlsValid=false,
  x=>x.lockBytes=Buffer.from('{}'),
  x=>{const v=JSON.parse(x.lockBytes);delete v.packages['node_modules/@oriolrius/nodes7'];x.lockBytes=Buffer.from(JSON.stringify(v))},
  x=>{const v=JSON.parse(x.lockBytes);v.packages['node_modules/@oriolrius/node-red-contrib-s7'].version='future';x.lockBytes=Buffer.from(JSON.stringify(v))}
 ];
 for(const f of corrupt)assert.throws(()=>collate(mutated(f),sha),String(f));
});
test('false source HEAD, duplicate and invalid candidate identity fail closed',()=>{
 assert.throws(()=>collate(specimen(),'main'));
 assert.throws(()=>collate(mutated(x=>x.rust.outputs.push({...x.rust.outputs[0]})),sha));
 assert.throws(()=>collate(mutated(x=>x.rust.candidate='fake-rust'),sha));
 assert.throws(()=>collate(mutated(x=>x.read.sourceCommit='c'.repeat(40)),sha));
});

test('direct raw evidence hashes bind all eight strict original candidate JSON files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s7-same-run-evidence-'));
 const d=specimen();
 const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
 function write(name){const b=Buffer.from(JSON.stringify({sourceCommit:sha,actual:'real-original-test-report'}));fs.writeFileSync(path.join(dir,name),b);return sha256(b);}
 try {
  d.read.positiveControl={reportSha256:write('common-s7-compare.json')};
  d.write.reportSha256=write('published-js-three-byte-write.json');
  for(const r of d.read.results){r.report='published-js-malformed-read-js-'+r.fault+'.json';r.reportSha256=write(r.report)}
  const rustFiles=['malformed-read-rust-inconsistent_data_length.json','malformed-read-rust-wrong_pdu_reference.json','rust-s7-ci-parity.json'];
  d.rust.outputs.forEach((x,i)=>{x.report=rustFiles[i];x.reportSha256=write(x.report)});
  assert.equal(Object.keys(verifyRawLinks(d,dir,sha)).length,8);
  fs.writeFileSync(path.join(dir,'published-js-three-byte-write.json'),'{"sourceCommit":"'+sha+'","modified":true}');
  assert.throws(()=>verifyRawLinks(d,dir,sha),/Summary digest does not match/);
  d.write.reportSha256=sha256(fs.readFileSync(path.join(dir,'published-js-three-byte-write.json')));
  fs.writeFileSync(path.join(dir,'malformed-read-rust-inconsistent_data_length.json'),'{}');
  assert.throws(()=>verifyRawLinks(d,dir,sha),/Summary digest does not match original JSON bytes/);
  d.rust.outputs[0].reportSha256=sha256(fs.readFileSync(path.join(dir,'malformed-read-rust-inconsistent_data_length.json')));
  fs.rmSync(path.join(dir,'malformed-read-rust-wrong_pdu_reference.json'));
  assert.throws(()=>verifyRawLinks(d,dir,sha),/ENOENT/);
 } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
test('evidence binder refuses source mismatch or directory traversal instead of silently skipping',()=>{
 const d=specimen();d.read.positiveControl={reportSha256:hash};
 d.read.results[0].report='../external.json';
 assert.throws(()=>verifyRawLinks(d,'/tmp/never-create-this',sha));
});
