// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {characterize,runStrictProcess}=require("../scripts/assess-plc4x-independent-node-peer.cjs");
const {verifyWireMatch}=require("../scripts/verify-plc4x-disconnect-serializer.cjs");
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
 const session={session:1,phase:"COTP_DISCONNECTED",closed:true,sawFin:true,closeHadError:false,
  received:[...received],sent:[...out],events,
  connections:1,setup:1,reads:1,writes:0,disconnects:1,validRead:true,errors:[],
  invalidTail:withTrailer?{direction:"client-to-server",afterCotpDisconnect:true,bytes:21,
   totalObserved:21,sha256:knownTailSha,allZero:true,rawHex:"00".repeat(21),prefixHex:"00".repeat(21),
   complete:true,truncated:false,termination:"TCP_FIN"}:null};
 const stderr=Buffer.from("Original Java diagnostic\n");
 const report={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  serverImplementation:"INDEPENDENT_NODE_COTP_S7COMM",serverDependency:"NODE_BUILTINS_ONLY",
  serverSourceSha256:digest(fs.readFileSync(fixtureSource)),disconnectMode:mode,
  candidate:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:driverSha,javaMajor:21,candidateQualified:false,
  originalJavaExit:0,originalSignal:null,originalTimedOut:false,originalTruncated:false,
  originalSha256:digest(original),originalStderrSha256:digest(stderr),
  hardware:"PENDING_HARDWARE",captureId:"01234567-890a-4bcd-8ef0-123456789abc",
  sessionCount:1,serverStopped:true,session};
 return {report,original,stderr};
}

function execute(t, {report, original, stderr}, mode="silence") {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"s7-strict-test-"));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const capture=Buffer.from(JSON.stringify(report));
 const inputs=[capture,original,stderr].map((bytes,i)=>{
  const file=path.join(dir,String(i));
  fs.writeFileSync(file,bytes);
  return file;
 });
 return {capture,strict:runStrictProcess(...inputs,head,mode)};
}

function check({capture,strict}, {original,stderr}, mode="silence") {
 return characterize(capture,original,stderr,strict,head,mode);
}

test("strict CLI exits 1 for the measured violation and the characterization retains it",t=>{
 for (const mode of ["silence","confirm"]) {
  const data=specimen(mode);
  const execution=execute(t,data,mode);
  assert.equal(execution.strict.status,1);
  assert.equal(JSON.parse(execution.strict.stdout).outcome,"CANDIDATE_PROTOCOL_FAILURE");
  const out=check(execution,data,mode);
  assert.equal(out.classification,"KNOWN_UNSAFE");
  assert.equal(out.invalidTrailerBytes,21);
  assert.equal(out.originalStrictCandidateExit,1);
  assert.equal(out.candidateQualified,false);
 }
});

test("clean strict exit 0 cannot satisfy the historical negative characterization",t=>{
 const data=specimen("confirm",false);
 const execution=execute(t,data,"confirm");
 assert.equal(execution.strict.status,0);
 assert.equal(JSON.parse(execution.strict.stdout).outcome,"SCOPED_PASS");
 assert.throws(()=>check(execution,data,"confirm"));
 // Changing the numeric status alone cannot turn a clean run into a measured failure.
 execution.strict.status=1;
 assert.throws(()=>check(execution,data,"confirm"));
});

test("missing, fake, stale, wrong-mode and unrelated red exits fail characterization",t=>{
 const data=specimen();
 const execution=execute(t,data);
 const rehash=edit=>{
  const report=JSON.parse(execution.strict.stdout);
  edit(report);
  return Buffer.from(JSON.stringify(report));
 };
 for (const change of [
  {status:2}, {status:null,signal:"SIGTERM"}, {status:1,error:"ETIMEDOUT"},
  {stdout:Buffer.alloc(0)}, {stderr:Buffer.from("Harness exception")},
  {stdout:rehash(r=>{r.captureSha256="a".repeat(64)})},
  {stdout:rehash(r=>{r.javaStderrSha256="a".repeat(64)})},
  {stdout:rehash(r=>{r.disconnectMode="confirm"})},
  {stdout:rehash(r=>{r.reason="UNRELATED_SOCKET_FAILURE"})}
 ]) {
  assert.throws(()=>check({...execution,strict:{...execution.strict,...change}},data));
 }
});

test("strict CLI distinguishes invalid evidence from a genuine protocol violation",t=>{
 const edits=[
  r=>{r.report.sourceCommit="b".repeat(40)},
  r=>{r.report.driverJarSha256="b".repeat(64)},
  r=>{r.report.serverSourceSha256="b".repeat(64)},
  r=>{r.report.originalJavaExit=1},
  r=>{r.report.candidateQualified=true},
  r=>{r.report.serverStopped=false},
  r=>{r.report.sessionCount=2},
  r=>{r.report.session.phase="READY"},
  r=>{r.report.session.closed=false},
  r=>{r.report.session.sawFin=false},
  r=>{r.report.session.closeHadError=true},
  r=>{r.report.session.reads=0},
  r=>{r.report.session.writes=1},
  r=>{r.report.session.disconnects=0},
  r=>{r.report.session.errors=["fake"]},
  r=>{r.report.session.received.pop()},
  r=>{r.report.session.received[2]=r.report.session.received[2].replace("000c","000a")},
  r=>{r.report.session.sent[2]=r.report.session.sent[2].replace("ff040060","ff040020")},
  r=>{r.report.session.events[2].sha256="1".repeat(64)},
  r=>{r.report.session.events[2].direction="server_tx"},
  r=>{r.report.session.events.reverse()},
  r=>{r.report.session.invalidTail.direction="server-to-client"},
  r=>{r.report.session.invalidTail.bytes=4},
  r=>{r.report.session.invalidTail.totalObserved=4},
  r=>{r.report.session.invalidTail.afterCotpDisconnect=false},
  r=>{r.report.session.invalidTail.sha256="0".repeat(64)},
  r=>{r.report.session.invalidTail.rawHex="ff"+"00".repeat(20)},
  r=>{r.report.session.invalidTail.truncated=true},
  r=>{r.report.session.invalidTail.termination="TIME_LIMIT"},
  r=>{r.report.session.invalidTail.allZero=false},
  r=>{r.report.originalSha256="notsha"},
  r=>{r.original=Buffer.from(JSON.stringify({status:"forged"}))},
  r=>{r.stderr=Buffer.from("tampered stderr")}
 ];
 for (const mutate of edits) {
  const data=specimen();
  mutate(data);
  const {strict}=execute(t,data);
  assert.equal(strict.status,2,String(mutate));
  assert.equal(strict.stdout.length,0);
  assert.match(strict.stderr.toString(),/INVALID_NODE_PEER_EVIDENCE/);
 }
});

test("a different real trailer is strict red without matching the known 21-byte signature",t=>{
 const data=specimen();
 const raw=Buffer.concat([Buffer.alloc(20),Buffer.from([1])]);
 Object.assign(data.report.session.invalidTail,{
  rawHex:raw.toString("hex"),prefixHex:raw.toString("hex"),sha256:digest(raw),allZero:false
 });
 const execution=execute(t,data);
 assert.equal(execution.strict.status,1);
 assert.throws(()=>check(execution,data),/exact released 1.0.0 trailer/);
});

test("confirm mode requires a correctly referenced COTP DC",t=>{
 const data=specimen("confirm");
 data.report.session.sent[3]="0300000a05c000020000";
 const bytes=Buffer.from(data.report.session.sent[3],"hex");
 data.report.session.events[7].sha256=digest(bytes);
 assert.equal(execute(t,data,"confirm").strict.status,2);
 data.report.session.sent.pop();
 assert.equal(execute(t,data,"confirm").strict.status,2);
});

test("serializer proof must reproduce the original DR and tail from the same strict run",t=>{
 const data=specimen("confirm");
 const {capture,strict}=execute(t,data,"confirm");
 const expected={
  exactWireHex:received.at(-1),
  originalWireHex:received.at(-1)+"00".repeat(21)
 };
 const verify=serializer=>verifyWireMatch(serializer,capture,data.original,data.stderr,
  strict,head,"confirm");
 assert.equal(verify(expected).captureSha256,digest(capture));
 assert.throws(()=>verify({...expected,originalWireHex:expected.originalWireHex.slice(0,-2)}),
  /byte for byte/);
 assert.throws(()=>verify({...expected,exactWireHex:"0300000b06800000000200"}),
  /retain the captured DR/);
});
