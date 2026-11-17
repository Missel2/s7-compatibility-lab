// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// A SECOND INDEPENDENT, minimal Node COTP/S7Comm implementation, without
// python-snap7 or the pre-existing relay, against actual published PLC4X.
// No remote IP input, no hardware and no S7Comm writes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const {startIndependentS7Server,digest}=require("../fixtures/independent-cotp-s7-server.cjs");
const {javaClasspath,runJava}=require("./assess-plc4x-java-client.cjs");
const root=path.join(__dirname,"..");
const outputDir=path.join(root,"test-reports");
const srcFixture=path.join(root,"fixtures/independent-cotp-s7-server.cjs");
const knownDriver="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const expectedZeroSha=digest(Buffer.alloc(21));
const sha=/^[0-9a-f]{40}$/,d64=/^[0-9a-f]{64}$/;
const expected={temperature:12.5,counter:-123,writable:3.25};
const oracleId="healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1";

function verifyIndependentReport(report,raw,head,mode){
 assert.match(head,sha);
 assert.ok(["silence","confirm"].includes(mode));
 assert.equal(report.schemaVersion,1);
 assert.equal(report.sourceCommit,head);
 assert.equal(report.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(report.serverImplementation,"INDEPENDENT_NODE_COTP_S7COMM");
 assert.equal(report.serverDependency,"NODE_BUILTINS_ONLY");
 assert.match(report.serverSourceSha256,d64);
 assert.equal(report.serverSourceSha256,digest(fs.readFileSync(srcFixture)),"Independent server source has drifted since evidence");
 assert.equal(report.disconnectMode,mode);
 assert.equal(report.candidate,"org.apache.plc4x:plc4j-driver-s7:1.0.0");
 assert.equal(report.driverJarSha256,knownDriver);
 assert.equal(report.javaMajor,21);
 assert.equal(report.candidateQualified,false);
 assert.equal(report.originalJavaExit,0);
 assert.equal(report.originalSignal,null);
 assert.equal(report.originalTimedOut,false);
 assert.equal(report.originalTruncated,false);
 assert.equal(report.originalSha256,digest(raw));
 const original=JSON.parse(raw.toString("utf8"));
 assert.deepEqual(Object.keys(original).sort(),[
  "schemaVersion","sourceCommit","candidate","version","scope","protocol",
  "oracleId","host","db","status","clientCloseInvoked","candidateQualified","observed"
 ].sort(),"Original Java result must not contain additional unreviewed fields");
 assert.equal(original.schemaVersion,1);
 assert.equal(original.sourceCommit,head);
 assert.equal(original.candidate,"apache-plc4x-java");
 assert.equal(original.version,"1.0.0");
 assert.equal(original.protocol,"S7COMM_CLASSIC");
 assert.equal(original.scope,"SOFTWARE_LOOPBACK_ONLY");
 assert.equal(original.oracleId,oracleId);
 assert.equal(original.status,"passed");
 assert.equal(original.clientCloseInvoked,true);
 assert.equal(original.host,"127.0.0.1");
 assert.equal(original.db,1);
 assert.equal(original.candidateQualified,false);
 assert.deepEqual(original.observed,expected,"Real PLC4X process must read all three original synthetic bytes");
 const s=report.session;
 assert.ok(s&&typeof s==="object");
 assert.equal(s.session,1);
 assert.equal(s.closed,true,"True TCP close required");
 assert.equal(s.phase,"COTP_DISCONNECTED");
 assert.deepEqual([s.connections,s.setup,s.reads,s.writes,s.disconnects],[1,1,1,0,1],
  "Exactly one real RFC1006 connection, S7 setup, READ_VAR, zero writes and COTP disconnect");
 assert.equal(s.validRead,true);
 assert.deepEqual(s.errors,[],"A failing independent synthetic server is not evidence against PLC4X");
 assert.ok(Array.isArray(s.events)&&s.events.length>=7&&s.events.length<=128);
 for(const frame of s.events){assert.ok(["client_rx","server_tx"].includes(frame.direction));assert.match(frame.sha256,d64);assert.ok(frame.length>=7)}
 assert.equal(s.events[0].direction,"client_rx");
 assert.equal(s.events[0].length>=11,true);
 assert.equal(s.events.some(x=>x.direction==="server_tx"),true);
 assert.equal(s.received.length,4,"Exactly CR/SETUP/READ/DR framed requests");
 assert.equal(s.sent.length,mode==="confirm"?4:3,"Expected real COTP+S7 response count");
 const frame=hex=>{
  assert.match(hex,/^(?:[0-9a-f]{2})+$/);
  const raw=Buffer.from(hex,"hex");
  assert.ok(raw.length>=7);assert.equal(raw[0],3);assert.equal(raw[1],0);
  assert.equal(raw.readUInt16BE(2),raw.length);
  return raw;
 };
 const cr=frame(s.received[0]),setup=frame(s.received[1]);
 const read=frame(s.received[2]),disconnect=frame(s.received[3]);
 assert.equal(cr[5],0xe0);assert.equal(setup[5],0xf0);
 assert.equal(read[5],0xf0);assert.equal(disconnect[5],0x80);
 assert.equal(disconnect.length,11);
 assert.equal(read.subarray(17).toString("hex"),"0401120a1002000c000184000000",
  "Exact published PLC4X one-item contiguous synthetic DB1[0:12] READ_VAR");
 const reply=frame(s.sent[2]);
 assert.equal(reply[8],3);assert.equal(reply[19],4);assert.equal(reply[20],1);
 assert.equal(reply.subarray(21).toString("hex"),"ff04006041480000ff85060740500000",
  "Independent Node response must contain exactly the expected 12 real synthetic bytes");
 const inEvents=s.events.filter(e=>e.direction==="client_rx");
 const outEvents=s.events.filter(e=>e.direction==="server_tx");
 assert.equal(inEvents.length,s.received.length);
 assert.equal(outEvents.length,s.sent.length);
 for(let i=0;i<inEvents.length;i++){
  const raw=frame(s.received[i]);
  assert.equal(inEvents[i].sha256,digest(raw),"Forged client PDU digest");
  assert.equal(inEvents[i].length,raw.length);
 }
 for(let i=0;i<outEvents.length;i++){
  const raw=frame(s.sent[i]);
  assert.equal(outEvents[i].sha256,digest(raw),"Forged server PDU digest");
  assert.equal(outEvents[i].length,raw.length);
 }
 if(mode==="confirm"){
  const dc=frame(s.sent[3]);assert.equal(dc[5],0xc0);
  assert.equal(dc.length,10);
 }
 assert.equal(report.originalStrictCandidateExit,report.classification==="KNOWN_UNSAFE"?1:0);
 const trailer=s.invalidTail;
 if(trailer){
  assert.equal(report.classification,"KNOWN_UNSAFE");
  assert.equal(trailer.direction,"client-to-server");
  assert.equal(trailer.afterCotpDisconnect,true);
  assert.equal(trailer.bytes,21);
  assert.equal(trailer.totalObserved,21);
  assert.equal(trailer.sha256,expectedZeroSha);
  assert.equal(trailer.allZero,true);
  assert.equal(trailer.prefixHex,"00".repeat(21));
  assert.equal(trailer.truncated,false);
  assert.equal(trailer.complete,true);
  assert.ok(["TCP_FIN","TCP_CLOSE"].includes(trailer.termination));
 }else{
  assert.equal(report.classification,"SCOPED_PASS");
  assert.equal(report.originalStrictCandidateExit,0);
 }
 assert.equal(report.hardware,"PENDING_HARDWARE");
 return {mode,classification:report.classification,readValues:true,
  readVar:1,writeVar:0,disconnect:1,
  originalJavaExit:0,originalStrictCandidateExit:report.originalStrictCandidateExit,
  invalidTrailerBytes:trailer?.bytes||0,invalidTrailerSha256:trailer?.sha256||null,
  sourceCommit:head,serverSourceSha256:report.serverSourceSha256,candidateQualified:false};
}
async function poll(fn,what){
 const until=Date.now()+3500;
 while(Date.now()<until){if(fn())return;await delay(35);}
 throw Error("TIMEOUT "+what);
}
async function one(mode,head,classpath,serverSourceSha256){
 const originalFile="plc4x-node-peer-"+mode+"-original.json";
 const assessmentFile="plc4x-node-peer-"+mode+"-assessment.json";
 const report={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  serverImplementation:"INDEPENDENT_NODE_COTP_S7COMM",serverDependency:"NODE_BUILTINS_ONLY",
  serverSourceSha256,disconnectMode:mode,candidate:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:classpath.driverJarSha256,javaMajor:21,candidateQualified:false,
  hardware:"PENDING_HARDWARE",classification:"UNASSESSED",
  originalFile,originalSha256:null};
 let server;
 try{
  server=await startIndependentS7Server({disconnectMode:mode});
  const result=await runJava(classpath.cp,server.port,head);
  const original=result.stdout;
  fs.writeFileSync(path.join(outputDir,originalFile),original);
  Object.assign(report,{originalJavaExit:result.code,originalSignal:result.signal,
   originalTimedOut:result.timedOut,originalTruncated:result.truncated,
   originalSha256:digest(original),originalStderrSha256:digest(result.stderr),
   originalStderrTail:result.stderr.toString("utf8").slice(-2500)});
  await poll(()=>server.sessions.length>0 && server.sessions[0].closed,"actual independent Node TCP close");
  const s=server.sessions[0];
  report.session=structuredClone(s);
  if(result.code!==0||result.signal||result.timedOut||result.truncated){
   report.classification="CLIENT_OR_FIXTURE_INCOMPATIBLE";
   report.errorOrigin="REAL_JAVA_CLIENT_OR_INDEPENDENT_NODE_SERVER";
   throw Error("Published Java process failed original=" + result.code + ",stderr=" + report.originalStderrTail);
  }
  const trailer=s.invalidTail;
  if(trailer && trailer.bytes===21 && trailer.totalObserved===21 &&
      trailer.sha256===expectedZeroSha && trailer.allZero && trailer.afterCotpDisconnect &&
      trailer.complete&&!trailer.truncated) {
   report.classification="KNOWN_UNSAFE";
   report.originalStrictCandidateExit=1;
  }else if(!trailer){
   report.classification="SCOPED_PASS";
   report.originalStrictCandidateExit=0;
  }else{
   report.classification="UNRECOGNIZED_TRANSPORT_VIOLATION";
   report.originalStrictCandidateExit=1;
   throw Error("New unexpected non-TPKT transport bytes; no known-unsafe signature accepted");
  }
  const measured=verifyIndependentReport(report,original,head,mode);
  console.log("INDEPENDENT_NODE_COTP_REAL_PLC4X="+JSON.stringify(measured));
  return measured;
 }catch(error){
  report.error=String(error?.stack||error).slice(0,4500);
  process.exitCode=1;
  console.error("INDEPENDENT_NODE_COTP_PLC4X_RED "+report.error);
  return null;
 }finally{
  if(server){
   try{await server.stop();}
   catch(error){report.teardownError=String(error);process.exitCode=1;}
  }
  fs.writeFileSync(path.join(outputDir,assessmentFile),JSON.stringify(report,null,2)+"\n");
 }
}
async function main(){
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 assert.match(head,sha);
 if(process.env.GITHUB_SHA)assert.equal(process.env.GITHUB_SHA,head);
 assert.equal(process.platform,"linux");assert.equal(process.arch,"x64");
 assert.equal(Number(/^javac (\d+)/.exec(execFileSync("javac",["-version"],{encoding:"utf8"}))?.[1]),21);
 fs.mkdirSync(outputDir,{recursive:true});
 const cp=javaClasspath();
 assert.equal(cp.driverJarSha256,knownDriver);
 const fixtureHash=digest(fs.readFileSync(srcFixture));
 const results=[];
 for(const mode of ["silence","confirm"]){
  const result=await one(mode,head,cp,fixtureHash);
  if(result)results.push(result);
 }
 if(results.length!==2)throw Error("Both independent Node COTP modes require actual Java exit and evidence; obtained "+results.length);
 const output={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  comparison:"SECOND_INDEPENDENT_COTP_S7_SERVER_NOT_PYTHON_SNAP7",candidateQualified:false,
  fixtureSourceSha256:fixtureHash,modes:results};
 fs.writeFileSync(path.join(outputDir,"plc4x-node-peer-comparison.json"),JSON.stringify(output,null,2)+"\n");
 console.log("PLC4X_SECOND_INDEPENDENT_FIXTURE_COMPARISON="+JSON.stringify(output));
}
if(require.main===module)main().catch(e=>{console.error("PLC4X_SECOND_FIXTURE_FAILED "+String(e?.stack||e));process.exitCode=1;});
module.exports={verifyIndependentReport};
