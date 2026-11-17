// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {verifyIndependentReport}=require("../scripts/assess-plc4x-independent-node-peer.cjs");
const {digest}=require("../fixtures/independent-cotp-s7-server.cjs");
const head="a".repeat(40);
const fixtureSource=path.resolve(__dirname,"../fixtures/independent-cotp-s7-server.cjs");
const driverSha="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const knownTailSha=digest(Buffer.alloc(21));
const received=[
 "0300001611e00000000f00c1020311c2020101c0010d",
 "0300001902f08032010000000a00080000f000000800080400",
 "0300001f02f08032010000000b000e00000401120a1002000c000184000000",
 "0300000b06800000000100"
];
const sent=[
 "0300001611d0000f000100c1020311c2020101c0010d",
 "0300001b02f08032030000000a000800000000f0000008000801e0",
 "0300002502f08032030000000b0002001000000401ff04006041480000ff85060740500000"
];
function specimen(mode="silence",withTrailer=true){
 const original=Buffer.from(JSON.stringify({
  schemaVersion:1,sourceCommit:head,candidate:"apache-plc4x-java",version:"1.0.0",
  scope:"SOFTWARE_LOOPBACK_ONLY",protocol:"S7COMM_CLASSIC",
  oracleId:"healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1",
  host:"127.0.0.1",db:1,status:"passed",clientCloseInvoked:true,
  candidateQualified:false,observed:{temperature:12.5,counter:-123,writable:3.25}
 })+"\n");
 const out=sent.concat(mode==="confirm"?["0300000a05c000010000"]:[]);
 const events=[];
 for(let i=0;i<received.length;i++){
  const r=Buffer.from(received[i],"hex");
  events.push({direction:"client_rx",length:r.length,sha256:digest(r)});
  if(i<out.length){
   const w=Buffer.from(out[i],"hex");
   events.push({direction:"server_tx",length:w.length,sha256:digest(w)});
  }
 }
 const session={session:1,phase:"COTP_DISCONNECTED",closed:true,
  received:[...received],sent:[...out],events,
  connections:1,setup:1,reads:1,writes:0,disconnects:1,validRead:true,errors:[],
  invalidTail:withTrailer?{direction:"client-to-server",afterCotpDisconnect:true,bytes:21,
   totalObserved:21,sha256:knownTailSha,allZero:true,prefixHex:"00".repeat(21),
   complete:true,truncated:false,termination:"TCP_FIN"}:null};
 const report={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  serverImplementation:"INDEPENDENT_NODE_COTP_S7COMM",serverDependency:"NODE_BUILTINS_ONLY",
  serverSourceSha256:digest(fs.readFileSync(fixtureSource)),disconnectMode:mode,
  candidate:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:driverSha,javaMajor:21,candidateQualified:false,
  originalJavaExit:0,originalSignal:null,originalTimedOut:false,originalTruncated:false,
  originalSha256:digest(original),classification:withTrailer?"KNOWN_UNSAFE":"SCOPED_PASS",
  originalStrictCandidateExit:withTrailer?1:0,hardware:"PENDING_HARDWARE",session};
 return {report,original};
}
test("exact original negative recognized with independently reconstructed raw TCP packet hashes",()=>{
 for(const mode of ["silence","confirm"]){
  const {report,original}=specimen(mode);
  const out=verifyIndependentReport(report,original,head,mode);
  assert.equal(out.classification,"KNOWN_UNSAFE");
  assert.equal(out.invalidTrailerBytes,21);
  assert.equal(out.originalStrictCandidateExit,1);
  assert.equal(out.candidateQualified,false);
 }
});
test("a genuinely clean independent read is only a narrow scoped PASS, never qualification",()=>{
 const {report,original}=specimen("confirm",false);
 const out=verifyIndependentReport(report,original,head,"confirm");
 assert.equal(out.classification,"SCOPED_PASS");
 assert.equal(out.candidateQualified,false);
 assert.equal(out.invalidTrailerBytes,0);
});
test("reject modified original bytes, unpinned Java, false oracle, forged fixture, write, misframed S7 or missing COTP",()=>{
 const edits=[
  r=>{r.report.sourceCommit="b".repeat(40)},
  r=>{r.report.driverJarSha256="b".repeat(64)},
  r=>{r.report.serverSourceSha256="b".repeat(64)},
  r=>{r.report.originalJavaExit=1},
  r=>{r.report.originalStrictCandidateExit=0},
  r=>{r.report.classification="SCOPED_PASS"},
  r=>{r.report.candidateQualified=true},
  r=>{r.report.session.phase="READY"},
  r=>{r.report.session.closed=false},
  r=>{r.report.session.reads=0},
  r=>{r.report.session.writes=1},
  r=>{r.report.session.disconnects=0},
  r=>{r.report.session.errors=["fake"]},
  r=>{r.report.session.received.pop()},
  r=>{r.report.session.received[2]=r.report.session.received[2].replace("000c","000a")},
  r=>{r.report.session.sent[2]=r.report.session.sent[2].replace("ff040060","ff040020")},
  r=>{r.report.session.events[2].sha256="1".repeat(64)},
  r=>{r.report.session.invalidTail.bytes=4},
  r=>{r.report.session.invalidTail.totalObserved=4},
  r=>{r.report.session.invalidTail.afterCotpDisconnect=false},
  r=>{r.report.session.invalidTail.sha256="0".repeat(64)},
  r=>{r.report.session.invalidTail.truncated=true},
  r=>{r.report.session.invalidTail.termination="TIME_LIMIT"},
  r=>{r.report.session.invalidTail.allZero=false},
  r=>{r.report.originalSha256="notsha"},
  r=>{r.original=Buffer.from(JSON.stringify({status:"forged"}))},
 ];
 for(const mutate of edits){
  const r=specimen("silence");
  mutate(r);
  assert.throws(()=>verifyIndependentReport(r.report,r.original,head,"silence"),String(mutate));
 }
});
test("confirm-mode response is required, rather than silently accepting missing COTP DC",()=>{
 const r=specimen("confirm");
 r.report.session.sent.pop();
 assert.throws(()=>verifyIndependentReport(r.report,r.original,head,"confirm"));
});
