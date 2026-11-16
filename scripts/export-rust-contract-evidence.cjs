// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Characterization index ONLY. This is not the corrected-candidate qualification gate.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {verifyGoodRead,verifyWrongPdu,verifyWriteAndLifecycle}=require('./assess-rust-v1.4.0.cjs');
const root=path.resolve(__dirname,'..');
const specs=[
  {name:'correct_header_rejection',contract:null,file:'malformed-read-rust-inconsistent_data_length.json',exit:0,verify:verifyGoodRead,expected:'SAFE_ON_THIS_CASE'},
  {name:'wrong_pdu_reference',contract:'S7-ERR-004',file:'malformed-read-rust-wrong_pdu_reference.json',exit:1,verify:verifyWrongPdu,expected:'KNOWN_UNSAFE'},
  {name:'lost_write_ack_and_teardown',contract:['S7-ERR-003','S7-ERR-005'],file:'rust-s7-ci-parity.json',exit:1,verify:verifyWriteAndLifecycle,expected:'KNOWN_UNSAFE'}
];
function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function buildIndex(baseline, reportBytes, commit, registry){
  assert.equal(baseline.schemaVersion,1);
  assert.equal(baseline.candidate,'node-red-contrib-s7-rust@1.4.0');
  assert.equal(baseline.classification,'NOT_QUALIFIED');
  assert.equal(baseline.behavioralSafety,'KNOWN_UNSAFE');
  assert.equal(baseline.instrumentControlsValid,true);
  assert.equal(baseline.originalDefectsReproduced,true);
  assert.equal(baseline.candidatePass,false);
  assert.equal(baseline.sourceCommit,commit);
  assert.match(commit,/^[0-9a-f]{40}$/);
  assert.equal(baseline.outputs?.length,3);
  assert.ok(registry && registry.schema_version===1 && registry.qualification_policy==='FAIL_CLOSED');
  const known=new Map(registry.contracts.map(x=>[x.id,x]));
  const results=[], controls=[];
  for(let i=0;i<specs.length;i++){
    const spec=specs[i], entry=baseline.outputs[i];
    assert.equal(entry.name,spec.name);
    assert.equal(entry.exitCode,spec.exit);
    assert.equal(entry.report,spec.file);
    const bytes=reportBytes[spec.file];
    assert.ok(Buffer.isBuffer(bytes) && bytes.length>10,'Missing physical report file '+spec.file);
    const report=JSON.parse(bytes.toString('utf8'));
    assert.equal(report.sourceCommit,commit,'Report must come from exact same checkout');
    const checked=spec.verify(report);
    assert.equal(checked.outcome,spec.expected);
    for(const [key,val] of Object.entries(checked)) assert.deepEqual(entry[key],val,'Mismatch between recorded assessor and report');
    const provenance={reportFile:spec.file,reportSha256:sha(bytes),candidateExitCode:spec.exit,sourceCommit:commit,
      evidenceType:'ASSESSED_REPORT_SHA256_NOT_RAW_PACKET_CAPTURE'};
    if(!spec.contract){controls.push({...provenance,control:'malformed_length_rejected',outcome:checked.outcome});continue;}
    for(const id of [].concat(spec.contract)){
      assert.equal(known.get(id)?.kind,'REPORTED_REGRESSION');
      assert.equal(known.get(id)?.status,'PR_OPEN_UNQUALIFIED');
      results.push({id,classification:'KNOWN_UNSAFE',candidatePass:false, ...provenance});
    }
  }
  assert.deepEqual(results.map(x=>x.id).sort(),['S7-ERR-003','S7-ERR-004','S7-ERR-005']);
  return {schemaVersion:1,sourceCommit:commit,candidate:'node-red-contrib-s7-rust@1.4.0',
    classification:'NOT_QUALIFIED',candidatePass:false,fullCandidateQualification:false,
    scope:'SOFTWARE_LOOPBACK_ONLY',contracts:results,positiveControls:controls,
    note:'Hashes represent original assessor JSON report bytes; not raw S7Comm packet capture or hardware proof.'};
}
function main(){
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  assert.equal(process.env.GITHUB_SHA,commit,'Require same-checkout GitHub Actions execution');
  const dir=path.join(root,'test-reports');
  const baseline=JSON.parse(fs.readFileSync(path.join(dir,'rust-1.4.0-baseline-assessment.json'),'utf8'));
  const reports=Object.fromEntries(specs.map(s=>[s.file,fs.readFileSync(path.join(dir,s.file))]));
  const registry=JSON.parse(fs.readFileSync(path.join(root,'contracts/registry.json'),'utf8'));
  const result=buildIndex(baseline,reports,commit,registry);
  fs.writeFileSync(path.join(dir,'rust-known-unsafe-contract-index.json'),JSON.stringify(result,null,2)+'\n');
  console.log('RUST_CONTRACT_INDEX_NOT_QUALIFIED='+result.contracts.map(x=>x.id).join(','));
}
if(require.main===module){try{main();}catch(e){console.error('RUST_CONTRACT_INDEX_RED:',e);process.exitCode=1;}}
module.exports={buildIndex};
