// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {validateCapabilities}=require("../scripts/validate-candidate-capabilities.cjs");
const root=path.join(__dirname,"..");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"comparisons/candidate-capabilities.v1.json")));
const catalog=JSON.parse(fs.readFileSync(path.join(root,"comparisons/catalog.v1.json")));
const pinned=fs.readFileSync(path.join(root,"requirements/python-snap7.txt"),"utf8");
const mutate=fn=>{const c=structuredClone(manifest);fn(c);return c;};

test("five versioned exact client identities and all 70 scenario declarations are explicit",()=>{
 const r=validateCapabilities(manifest,catalog,pinned);
 assert.equal(r.candidateCount,5);
 assert.equal(r.counts.total,70);
 assert.equal(r.counts.observed,15);
 assert.equal(r.counts.pendingHardware,5);
 assert.equal(r.counts.untested,50);
 assert.equal(r.globalRanking,null);
 assert.equal(r.fullCandidateQualification,false);
});
test("Python is a real separate-process read candidate but not a three-item multiwrite winner",()=>{
 const r=validateCapabilities(manifest,catalog,pinned);
 const find=id=>r.rows.find(x=>x.candidate==="python-snap7-3_3_1"&&x.scenario===id);
 assert.equal(find("READ_HEALTHY_DB1").outcome,"SCOPED_PASS");
 assert.equal(find("READ_HEALTHY_DB1").phase,"MERGED_BASELINE");
 assert.equal(find("WRITE_THREE_DISJOINT_BYTES").state,"NOT_TESTED");
 assert.equal(find("S7ANY_ADDRESS_24BIT_BOUND").state,"NOT_TESTED");
 assert.equal(find("HARDWARE_COVERAGE").state,"PENDING_HARDWARE");
});
test("Java is actually observed unsafe on teardown; every unexecuted function remains NOT_TESTED",()=>{
 const r=validateCapabilities(manifest,catalog,pinned);
 const cell=id=>r.rows.find(x=>x.candidate==="apache-plc4x-java-1_0_0"&&x.scenario===id);
 assert.equal(cell("READ_HEALTHY_DB1").outcome,"KNOWN_UNSAFE");
 assert.equal(cell("READ_HEALTHY_DB1").phase,"PR_OPEN");
 assert.equal(cell("WRITE_THREE_DISJOINT_BYTES").state,"NOT_TESTED");
 assert.equal(cell("S7ANY_ADDRESS_24BIT_BOUND").state,"NOT_TESTED");
 assert.equal(cell("HARDWARE_COVERAGE").state,"PENDING_HARDWARE");
});
test("fake PASS, missing scenario, unsupported stack, wrong version, fabricated qualification or source are rejected",()=>{
 const edits=[
  m=>{m.candidates.pop();},
  m=>{m.candidates.push(structuredClone(m.candidates[0]));},
  m=>{m.candidates[3].version="3.4.0";},
  m=>{m.candidates[3].package="fake-snap7";},
  m=>{m.candidates[3].sourceProof="../../remote.json";},
  m=>{m.candidates[3].releaseSource="NO_PIN";},
  m=>{m.candidates[3].execution="PUBLISHED_NODE_RED_PROCESS";},
  m=>{m.candidates[3].protocolCapabilities.S7COMMPLUS="SUPPORTED";},
  m=>{m.candidates[3].protocolCapabilities.S7COMM_CLASSIC="CERTIFIED";},
  m=>{m.candidates[3].scenarios.READ_HEALTHY_DB1.state="NOT_TESTED";},
  m=>{m.candidates[3].scenarios.WRITE_THREE_DISJOINT_BYTES.state="OBSERVED_SCOPED";},
  m=>{m.candidates[3].scenarios.WRITE_THREE_DISJOINT_BYTES.state="PASS";},
  m=>{m.candidates[3].scenarios.WRITE_THREE_DISJOINT_BYTES.reason="CERTIFIED and totally SAFE DRIVER";},
  m=>{m.candidates[3].scenarios.READ_HEALTHY_DB1.reason="No source shown";},
  m=>{m.candidates[0].scenarios.HARDWARE_COVERAGE.state="OBSERVED_SCOPED";},
  m=>{delete m.candidates[2].scenarios.READ_SHORT_REPLY;},
  m=>{m.candidates[0].scenarios.FORGED_NEW_SCENARIO={state:"OBSERVED_SCOPED",reason:"Not actually executed"};},
  m=>{m.candidates[0].id="unregistered-driver";},
  m=>{m.candidates[4].version="0.9.0";},
  m=>{m.candidates[4].releaseSource="NPM_REGISTRY_SRI_RECORDED_IN_CI";},
  m=>{m.candidates[4].execution="PUBLISHED_NODE_RED_PROCESS";},
  m=>{m.candidates[4].scenarios.READ_HEALTHY_DB1.state="NOT_TESTED";},
 ];
 for(const fn of edits)assert.throws(()=>validateCapabilities(mutate(fn),catalog,pinned),String(fn));
});
test("wheel hash and original catalog observation provenance cannot be omitted",()=>{
 assert.throws(()=>validateCapabilities(manifest,catalog,"python-snap7==3.3.1\n"));
 assert.throws(()=>validateCapabilities(manifest,catalog,"python-snap7==3.3.1 --hash=sha256:"+ "g".repeat(64)));
 const changed=structuredClone(catalog);
 changed.observations=changed.observations.filter(x=>x.candidate!=="python-snap7-3_3_1");
 assert.throws(()=>validateCapabilities(manifest,changed,pinned));
});
