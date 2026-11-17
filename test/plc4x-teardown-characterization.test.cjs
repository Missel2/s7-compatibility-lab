// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyKnownPlc4xAnomaly}=require("../scripts/characterize-plc4x-java-disconnect.cjs");
const head="a".repeat(40),sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function fixture(){
 const original={schemaVersion:1,sourceCommit:head,candidate:"apache-plc4x-java",version:"1.0.0",
  scope:"SOFTWARE_LOOPBACK_ONLY",protocol:"S7COMM_CLASSIC",
  oracleId:"healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1",host:"127.0.0.1",
  db:1,status:"passed",clientCloseInvoked:true,candidateQualified:false,
  observed:{temperature:12.5,counter:-123,writable:3.25}};
 const bytes=Buffer.from(JSON.stringify(original)+"\n");
 const wireEvents=Array.from({length:14},(_,i)=>({
  direction:i%2===0?"client_rx":"fixture_rx",length:i===12?11:25,frameSha256:"b".repeat(64)
 }));
 const r={schemaVersion:1,sourceCommit:head,driver:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:"907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7",
  javaMajor:21,scope:"SOFTWARE_LOOPBACK_ONLY",status:"NOT_QUALIFIED",
  classification:"CANDIDATE_POST_DISCONNECT_NON_TPKT_UNQUALIFIED",candidateQualified:false,
  instrumentControlsValid:true,originalExit:0,originalSignal:null,
  originalTimedOut:false,originalTruncated:false,originalReport:"plc4x-java-original.json",
  originalReportSha256:sha(bytes),originalStderrSha256:"c".repeat(64),
  originalStrictExit:0,strictAssessorExit:1,errorOrigin:"REAL_PLC4X_CLIENT_WIRE",
  cleanClose:false,readRequests:1,writeRequests:0,cotpRequests:1,cotpDisconnectRequests:1,
  activeSessions:0,closedSessions:1,
  relayErrors:["Expected TPKT v3; actual leading bytes="+"00".repeat(21)],
  invalidTpkt:[{direction:"client-to-fixture",session:1,byteCount:21,allZero:true,
   afterCotpDisconnect:true,sha256:sha(Buffer.alloc(21)),prefixHex:"00".repeat(21)}],
  wireEvidence:{schemaVersion:1,scope:"SOFTWARE_LOOPBACK_ONLY",
   evidenceType:"COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP",eventCount:14,
   chainSha256:"d".repeat(64),events:wireEvents}};
 return {r,original,bytes};
}
test("real original strict assessor remains red, but exact known-unsafe fingerprint is independently verifiable",()=>{
 const {r,bytes}=fixture();const x=verifyKnownPlc4xAnomaly(r,bytes,head);
 assert.equal(x.classification,"KNOWN_UNSAFE");
 assert.equal(x.invalidTpktBytes,21);
 assert.equal(x.originalStrictAssessorExit,1);
 assert.equal(x.candidateQualified,false);
});
test("no blanket expected-red allowance: altered error, source, wire, readback, SHA or time must fail characterization",()=>{
 const mutations=[
  x=>x.r.driverJarSha256="0".repeat(64),
  x=>x.r.originalExit=1,
  x=>x.r.originalTimedOut=true,
  x=>x.r.originalReportSha256="1".repeat(64),
  x=>x.r.strictAssessorExit=0,
  x=>x.r.classification="SCOPED_PASS",
  x=>x.r.instrumentControlsValid=false,
  x=>x.r.readRequests=0,
  x=>x.r.writeRequests=1,
  x=>x.r.cotpDisconnectRequests=0,
  x=>x.r.cleanClose=true,
  x=>x.r.relayErrors=[],
  x=>x.r.invalidTpkt[0].afterCotpDisconnect=false,
  x=>x.r.invalidTpkt[0].byteCount=20,
  x=>x.r.invalidTpkt[0].allZero=false,
  x=>x.r.invalidTpkt[0].prefixHex="deadcafe",
  x=>x.r.invalidTpkt[0].sha256="0".repeat(64),
  x=>x.r.invalidTpkt[0].direction="fixture-to-client",
  x=>x.r.wireEvidence.events=[],
  x=>x.original.observed.temperature=99,
  x=>x.original.clientCloseInvoked=false,
 ];
 for(const mutate of mutations){const s=fixture();mutate(s);
  s.bytes=Buffer.from(JSON.stringify(s.original)+"\n");
  if(s.r.originalReportSha256===sha(fixture().bytes))s.r.originalReportSha256=sha(s.bytes);
  assert.throws(()=>verifyKnownPlc4xAnomaly(s.r,s.bytes,head),String(mutate));
 }
});
