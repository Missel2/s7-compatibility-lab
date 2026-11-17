// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Green means a strictly pinned *unsafe* original Java disconnect was actually
// reproduced, never a full client PASS. The original strict assessor must exit 1.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const path=require("node:path");
const {verifyPlc4xEvidence}=require("./assess-plc4x-java-client.cjs");
const root=path.join(__dirname,".."),rdir=path.join(root,"test-reports");
const SHA=/^[a-f0-9]{40}$/,DIGEST=/^[a-f0-9]{64}$/;
const knownDriver="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const anomalyRaw=Buffer.alloc(21);
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
function verifyKnownPlc4xAnomaly(r,originalBytes,head) {
 assert.match(head,SHA);
 assert.equal(r.sourceCommit,head);
 assert.equal(r.driver,"org.apache.plc4x:plc4j-driver-s7:1.0.0");
 assert.equal(r.driverJarSha256,knownDriver);
 assert.equal(r.javaMajor,21);
 assert.equal(r.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(r.status,"NOT_QUALIFIED");
 assert.equal(r.candidateQualified,false);
 assert.equal(r.originalExit,0);
 assert.equal(r.originalSignal,null);
 assert.equal(r.originalTimedOut,false);
 assert.equal(r.originalTruncated,false);
 assert.equal(r.originalReport,"plc4x-java-original.json");
 assert.equal(r.originalReportSha256,digest(originalBytes));
 assert.match(r.originalStderrSha256,DIGEST);
 assert.equal(r.strictAssessorExit,1,"Unsafe strict original observer MUST stay red");
 assert.equal(r.classification,"CANDIDATE_POST_DISCONNECT_NON_TPKT_UNQUALIFIED");
 assert.equal(r.errorOrigin,"REAL_PLC4X_CLIENT_WIRE");
 assert.equal(r.instrumentControlsValid,true);
 assert.equal(r.cleanClose,false,"Cannot call a malformed COTP shutdown clean");
 assert.equal(r.readRequests,1);
 assert.equal(r.writeRequests,0);
 assert.equal(r.cotpRequests,1);
 assert.equal(r.cotpDisconnectRequests,1);
 assert.equal(r.closedSessions,1);
 assert.equal(r.activeSessions,0);
 assert.deepEqual(r.relayErrors.length,1);
 assert.match(r.relayErrors[0],/^Expected TPKT v3; actual leading bytes=0+$/);
 assert.ok(Array.isArray(r.invalidTpkt)&&r.invalidTpkt.length===1);
 const a=r.invalidTpkt[0];
 assert.equal(a.direction,"client-to-fixture");
 assert.equal(a.session,1);
 assert.equal(a.byteCount,21);
 assert.equal(a.allZero,true);
 assert.equal(a.afterCotpDisconnect,true);
 assert.equal(a.prefixHex,"00".repeat(21));
 assert.equal(a.sha256,digest(anomalyRaw));
 const w=r.wireEvidence;
 assert.equal(w.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(w.evidenceType,"COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP");
 assert.ok(w.eventCount>=14&&w.eventCount===w.events.length);
 assert.match(w.chainSha256,DIGEST);
 assert.ok(w.events.some(e=>e.direction==="client_rx"&&e.length===11&&DIGEST.test(e.frameSha256)),
  "The actual COTP Disconnect Request must be present in original TPKT wire history");
 assert.ok(w.events.some(e=>e.direction==="fixture_rx"&&DIGEST.test(e.frameSha256)));
 assert.ok(w.events.some(e=>e.direction==="client_rx"&&DIGEST.test(e.frameSha256)));
 // Reuse strict positive data and source/real process validator while
 // preserving the actual negative packet evidence in the original report.
 const scopeOnly={...r,classification:"SCOPED_PASS",cleanClose:true,relayErrors:[],invalidTpkt:[]};
 verifyPlc4xEvidence(scopeOnly,head,originalBytes);
 return {schemaVersion:1,source:"REAL_RELEASED_PLC4X_CANDIDATE_AND_INDEPENDENT_WIRE_OBSERVER",
  sourceCommit:head,candidate:"apache-plc4x-java",version:"1.0.0",
  classification:"KNOWN_UNSAFE",oracle:"READ_HEALTHY_DB1",
  actualReadValuesCorrect:true,invalidTpktAfterDisconnect:true,
  invalidTpktSha256:a.sha256,invalidTpktBytes:a.byteCount,
  originalJavaExit:0,originalStrictAssessorExit:1,originalReportSha256:r.originalReportSha256,
  originalAssessmentSha256:null,candidateQualified:false,hardware:"PENDING_HARDWARE"};
}
function main(){
 const head=process.env.GITHUB_SHA;
 const orig=fs.readFileSync(path.join(rdir,"plc4x-java-original.json"));
 const a=fs.readFileSync(path.join(rdir,"plc4x-java-assessment.json"));
 const report=JSON.parse(a);
 const x=verifyKnownPlc4xAnomaly(report,orig,head);
 x.originalAssessmentSha256=digest(a);
 fs.writeFileSync(path.join(rdir,"plc4x-java-unsafe-characterization.json"),JSON.stringify(x,null,2)+"\n");
 console.log("PLC4X_JAVA_KNOWN_UNSAFE_VERIFIED="+JSON.stringify(x));
}
if(require.main===module){try{main()}catch(e){console.error("PLC4X_UNSAFE_CHARACTERIZATION_RED "+String(e?.stack||e));process.exitCode=1}}
module.exports={verifyKnownPlc4xAnomaly};
