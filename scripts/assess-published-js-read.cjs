// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// A green DISCOVERY workflow is not a green candidate qualification.
const assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const reportDir=path.join(root,'test-reports');
const faults=['inconsistent_data_length','wrong_pdu_reference','short_s7_reply'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verifyFault(d,fault,commit){
  assert.equal(d.schemaVersion,1);
  assert.equal(d.engine,'js');
  assert.equal(d.pkg,'4.4.1');
  assert.equal(d.nodeRed,'5.0.9');
  assert.equal(d.sourceCommit,commit);
  assert.equal(d.fault,fault);
  assert.equal(d.server,'python-snap7==3.3.1, 2KiB disposable DB1');
  assert.equal(d.hardware,'PENDING_HARDWARE');
  assert.equal(d.candidatePass,false);
  assert.equal(d.classification,'UNASSESSED_NOT_QUALIFIED');
  assert.equal(d.mutation?.requestObserved,true);
  assert.equal(d.mutation?.mutation,fault);
  assert.ok(Number.isInteger(d.mutation?.originalBytes)&&d.mutation.originalBytes>22);
  assert.ok(Number.isInteger(d.mutation?.deliveredBytes)&&d.mutation.deliveredBytes>=12);
  assert.ok(Number.isInteger(d.readRequests)&&d.readRequests>=1);
  assert.equal(d.injectedCount,1);
  assert.deepEqual(d.proxyErrors,[]);
  assert.deepEqual(d.proxyDiagnostics?.errors,[]);
  assert.equal(d.proxyDiagnostics?.mutationStillArmed,null);
  for(const key of ['unloadError','stopError','proxyStopError','fixtureStopError'])
    assert.equal(d[key],undefined,key+' indicates harness failure');
  if(fault==='inconsistent_data_length'){
    assert.equal(d.mutation.deliveredDataLength,32767);
    assert.ok(d.mutation.originalDataLength<d.mutation.deliveredDataLength);
    assert.equal(d.mutation.originalBytes,d.mutation.deliveredBytes);
  } else if(fault==='wrong_pdu_reference'){
    assert.ok(d.mutation.originalPduRef!==d.mutation.deliveredPduRef);
    assert.equal(d.mutation.originalBytes,d.mutation.deliveredBytes);
  } else {
    assert.equal(d.mutation.deliveredBytes,12);
    assert.ok(d.mutation.originalBytes>d.mutation.deliveredBytes);
  }
  // Failures are acceptable ONLY when the original strict candidate test
  // actually rejected an observed unsafe fresh value, not on crash/timeout.
  if(d.verdict==='failed'){
    assert.equal(d.unverifiedFreshValues,true);
    assert.equal(d.readFaultClassification,'KNOWN_UNSAFE');
    assert.equal(d.readRequests,1);
    assert.ok(d.correctReadbacks>=1);
    assert.match(d.error||'',/cannot accept corrupted single READ_VAR reply as valid fresh data/);
    return {classification:'KNOWN_UNSAFE',candidateExit:1};
  }
  assert.equal(d.verdict,'passed');
  assert.equal(d.unverifiedFreshValues,false);
  assert.equal(d.readFaultClassification,'NO_INVALID_FRESH_OBSERVED');
  assert.equal(d.error,undefined);
  return {classification:'NO_INVALID_FRESH_OBSERVED',candidateExit:0};
}
function verifyPositive(p,commit){
  assert.equal(p.schemaVersion,1);
  assert.equal(p.status,'passed');
  assert.equal(p.sourceCommit,commit);
  assert.equal(p.packageIds?.js,'4.4.1');
  assert.equal(p.packageIds?.rust,'1.4.0');
  assert.equal(p.candidates?.js?.status,'passed');
  assert.equal(p.candidates?.js?.readVerified,true);
  assert.equal(p.candidates?.js?.closeVerified,true);
}
function executeFault(fault,commit){
  const file='published-js-malformed-read-js-'+fault+'.json';
  const full=path.join(reportDir,file);
  fs.rmSync(full,{force:true});
  const p=spawnSync(process.execPath,['test/candidates/published-js-malformed-read.cjs',path.join(root,'.candidate-consumer')],{
    cwd:root,env:{...process.env,S7_READ_FAULT_ENGINE:'js',S7_READ_FAULT_CASE:fault},
    encoding:'utf8',timeout:125000,killSignal:'SIGKILL',maxBuffer:8*1024*1024
  });
  if(p.error||p.signal||![0,1].includes(p.status))
    throw Error('Unsafe/invalid probe process '+fault+' status='+p.status+' signal='+p.signal+' '+String(p.error)+
      '\n'+String(p.stdout).slice(-1300)+'\n'+String(p.stderr).slice(-1300));
  assert.ok(fs.existsSync(full),'Missing real candidate report '+file);
  const bytes=fs.readFileSync(full);
  const raw=JSON.parse(bytes);
  const checked=verifyFault(raw,fault,commit);
  assert.equal(p.status,checked.candidateExit,'Must preserve actual strict candidate exit');
  return {fault,report:file,reportSha256:hash(bytes),classification:checked.classification,
    strictCandidateExit:p.status,readRequests:raw.readRequests,mutation:raw.mutation,
    sourceCommit:commit};
}
function main(){
  fs.mkdirSync(reportDir,{recursive:true});
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  assert.equal(process.env.GITHUB_SHA,commit);
  const registry=require('../contracts/registry.json');
  const contract=registry.contracts.find(c=>c.id==='S7-ERR-006');
  assert.equal(contract?.status,'MERGED_BASELINE_UNSAFE');
  assert.equal(contract?.package,'@oriolrius/node-red-contrib-s7');
  assert.equal(contract?.version,'4.4.1');
  const output={schemaVersion:1,scope:'SOFTWARE_LOOPBACK_ONLY',
    package:'@oriolrius/node-red-contrib-s7',version:'4.4.1',sourceCommit:commit,
    historicalAlphaVersion:'0.1.0-alpha.2',candidatePass:false,fullCandidateQualification:false,
    classification:'NOT_QUALIFIED',results:[]};
  try{
    const p=JSON.parse(fs.readFileSync(path.join(reportDir,'common-s7-compare.json')));
    verifyPositive(p,commit);
    output.positiveControl={file:'common-s7-compare.json',reportSha256:hash(fs.readFileSync(path.join(reportDir,'common-s7-compare.json'))),
      readVerified:true,closeVerified:true};
    for(const fault of faults)output.results.push(executeFault(fault,commit));
    const badLength=output.results.find(x=>x.fault==='inconsistent_data_length');
    assert.equal(badLength?.classification,'KNOWN_UNSAFE','Exact published JS 4.4.1 known-unsafe length baseline must reproduce');
    assert.equal(badLength.strictCandidateExit,1);
    output.contracts=[{id:'S7-ERR-006',classification:'KNOWN_UNSAFE',candidatePass:false,
      report:badLength.report,reportSha256:badLength.reportSha256,sourceCommit:commit}];
    output.classification='KNOWN_UNSAFE';
    output.instrumentControlsValid=true;
    console.log('PUBLISHED_JS_READ_CHARACTERIZATION='+JSON.stringify({
      classification:output.classification,
      cases:output.results.map(x=>({fault:x.fault,classification:x.classification,exit:x.strictCandidateExit}))
    }));
  }catch(error){
    output.instrumentControlsValid=false;
    output.error=String(error?.stack||error).slice(0,5000);
    console.error('JS_CHARACTERIZATION_RED '+output.error);
    process.exitCode=1;
  }finally{
    fs.writeFileSync(path.join(reportDir,'published-js-read-characterization.json'),JSON.stringify(output,null,2)+'\n');
  }
}
if(require.main===module) main();
module.exports={verifyFault,verifyPositive};
