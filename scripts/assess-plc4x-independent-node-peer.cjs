// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// A SECOND INDEPENDENT, minimal Node COTP/S7Comm implementation, without
// python-snap7 or the pre-existing relay, against actual published PLC4X.
// No remote IP input, no hardware and no S7Comm writes.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {randomUUID}=require("node:crypto");
const {execFileSync,spawnSync}=require("node:child_process");
const {setTimeout:delay}=require("node:timers/promises");
const {startIndependentS7Server,digest}=require("../fixtures/independent-cotp-s7-server.cjs");
const {javaClasspath,runJava}=require("./assess-plc4x-java-client.cjs");
const root=path.join(__dirname,"..");
const outputDir=path.join(root,"test-reports");
const {verifyCapture}=require("./check-plc4x-node-peer.cjs");
const strictScript=path.join(__dirname,"check-plc4x-node-peer.cjs");
const srcFixture=path.join(root,"fixtures/independent-cotp-s7-server.cjs");
const knownDriver="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const expectedZeroSha=digest(Buffer.alloc(21));
const sha=/^[0-9a-f]{40}$/;

function characterize(capture, javaStdout, javaStderr, strict, head, mode) {
 assert.equal(strict.error, null, "Strict assessment process must run to completion");
 assert.equal(strict.signal, null, "A killed strict process is invalid evidence");
 assert.equal(strict.status, 1, "The strict process must measure a candidate failure");
 assert.equal(strict.stderr.length, 0, "The strict process must report a protocol verdict without harness errors");
 const report=JSON.parse(capture);
 const trailer=verifyCapture(report,javaStdout,javaStderr,head,mode);
 assert.equal(trailer?.rawHex,"00".repeat(21),"Expected the exact released 1.0.0 trailer");
 assert.equal(trailer.sha256,expectedZeroSha);
 assert.deepEqual(JSON.parse(strict.stdout), {
  schemaVersion:1, sourceCommit:head, disconnectMode:mode,
  captureSha256:digest(capture), javaStdoutSha256:digest(javaStdout),
  javaStderrSha256:digest(javaStderr),
  outcome:"CANDIDATE_PROTOCOL_FAILURE", reason:"UNFRAMED_CLIENT_BYTES_AFTER_COTP_DR",
  invalidTrailerBytes:21, invalidTrailerSha256:expectedZeroSha, candidateQualified:false
 });
 return {
  mode,classification:"KNOWN_UNSAFE",readValues:true,readVar:1,writeVar:0,disconnect:1,
  splitReadReply:report.splitReadReply,
  readReplyWriteLengths:report.session.readReplyWrites.map(write=>write.hex.length/2),
  originalJavaExit:report.originalJavaExit,originalStrictCandidateExit:strict.status,
  invalidTrailerBytes:trailer.bytes,invalidTrailerSha256:trailer.sha256,
  captureSha256:digest(capture),originalStrictStdoutSha256:digest(strict.stdout),
  originalStrictStderrSha256:digest(strict.stderr), sourceCommit:head,
  serverSourceSha256:report.serverSourceSha256,candidateQualified:false
 };
}

function runStrictProcess(capturePath, stdoutPath, stderrPath, head, mode) {
 const result=spawnSync(process.execPath,[strictScript,capturePath,stdoutPath,stderrPath,head,mode],
  {cwd:root,timeout:5000,maxBuffer:65536});
 return {
  status:result.status,signal:result.signal,error:result.error?.code ?? null,
  stdout:result.stdout ?? Buffer.alloc(0),stderr:result.stderr ?? Buffer.alloc(0)
 };
}

async function poll(fn,what){
 const until=Date.now()+3500;
 while(Date.now()<until){if(fn())return;await delay(35);}
 throw Error("TIMEOUT "+what);
}

async function one(mode,head,classpath,serverSourceSha256,splitReadReply=false){
 const prefix="plc4x-node-peer-"+mode+(splitReadReply?"-split":"");
 const file=suffix=>path.join(outputDir,prefix+suffix);
 const originalPath=file("-original.json");
 const stderrPath=file("-stderr.log");
 const capturePath=file("-capture.json");
 const report={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  serverImplementation:"INDEPENDENT_NODE_COTP_S7COMM",serverDependency:"NODE_BUILTINS_ONLY",
  serverSourceSha256,disconnectMode:mode,splitReadReply,candidate:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:classpath.driverJarSha256,javaMajor:21,candidateQualified:false,
  hardware:"PENDING_HARDWARE",captureId:randomUUID(),serverStopped:false};
 const assessment={sourceCommit:head,disconnectMode:mode,classification:"UNASSESSED",candidateQualified:false};
 let server;
 try {
  server=await startIndependentS7Server({disconnectMode:mode,splitReadReply});
  const java=await runJava(classpath.cp,server.port,head);
  fs.writeFileSync(originalPath,java.stdout);
  fs.writeFileSync(stderrPath,java.stderr);
  Object.assign(report,{originalJavaExit:java.code,originalSignal:java.signal,
   originalTimedOut:java.timedOut,originalTruncated:java.truncated,
   originalSha256:digest(java.stdout),originalStderrSha256:digest(java.stderr)});
  await poll(()=>server.sessions.length>0 && server.sessions.every(session=>session.closed),
   "actual independent Node TCP close");
  await server.stop();
  report.serverStopped=true;
  report.sessionCount=server.sessions.length;
  report.session=server.sessions[0];

  const capture=Buffer.from(JSON.stringify(report,null,2)+"\n");
  fs.writeFileSync(capturePath,capture);
  const strict=runStrictProcess(capturePath,originalPath,stderrPath,head,mode);
  fs.writeFileSync(file("-strict-stdout.log"),strict.stdout);
  fs.writeFileSync(file("-strict-stderr.log"),strict.stderr);
  Object.assign(assessment,{
   captureSha256:digest(capture),originalStrictCandidateExit:strict.status,
   originalStrictSignal:strict.signal,originalStrictProcessError:strict.error,
   originalStrictStdoutSha256:digest(strict.stdout),originalStrictStderrSha256:digest(strict.stderr)
  });
  const measured=characterize(capture,java.stdout,java.stderr,strict,head,mode);
  Object.assign(assessment,measured);
  console.log("INDEPENDENT_NODE_COTP_REAL_PLC4X="+JSON.stringify(measured));
  return measured;
 } catch(error) {
  assessment.error=String(error.stack || error);
  console.error("INDEPENDENT_NODE_COTP_PLC4X_RED "+assessment.error);
  return null;
 } finally {
  if (server && !report.serverStopped) {
   try {await server.stop();}
   catch(error) {assessment.teardownError=String(error);}
   report.sessionCount=server.sessions.length;
   report.session=server.sessions[0] ?? null;
   fs.writeFileSync(capturePath,JSON.stringify(report,null,2)+"\n");
  }
  fs.writeFileSync(file("-assessment.json"),JSON.stringify(assessment,null,2)+"\n");
 }
}
async function main(){
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 assert.match(head,sha);
 const expectedHead=process.env.S7_LAB_EXPECTED_SHA ?? process.env.GITHUB_SHA;
 if(expectedHead)assert.equal(head,expectedHead);
 assert.equal(process.platform,"linux");assert.equal(process.arch,"x64");
 assert.equal(Number(/^javac (\d+)/.exec(execFileSync("javac",["-version"],{encoding:"utf8"}))?.[1]),21);
 fs.mkdirSync(outputDir,{recursive:true});
 const cp=javaClasspath();
 assert.equal(cp.driverJarSha256,knownDriver);
 const fixtureHash=digest(fs.readFileSync(srcFixture));
 // Remove only this experiment's previous outputs so a failed run cannot
 // accidentally archive evidence carried over from an earlier invocation.
 for (const name of fs.readdirSync(outputDir)) {
  if (/^plc4x-node-peer-.*\.(json|log)$/.test(name)) fs.rmSync(path.join(outputDir,name));
 }
 const results=[];
 for(const mode of ["silence","confirm"]){
  const result=await one(mode,head,cp,fixtureHash);
  if(result)results.push(result);
 }
 if(results.length!==2)throw Error("Both independent Node COTP modes require actual Java exit and evidence; obtained "+results.length);
 const splitRead=await one("silence",head,cp,fixtureHash,true);
 assert.ok(splitRead,"Split READ_VAR reply requires actual Java exit and evidence");
 const output={schemaVersion:1,sourceCommit:head,scope:"SOFTWARE_LOOPBACK_ONLY",
  comparison:"SECOND_INDEPENDENT_COTP_S7_SERVER_NOT_PYTHON_SNAP7",candidateQualified:false,
  fixtureSourceSha256:fixtureHash,modes:results,splitRead};
 fs.writeFileSync(path.join(outputDir,"plc4x-node-peer-comparison.json"),JSON.stringify(output,null,2)+"\n");
 console.log("PLC4X_SECOND_INDEPENDENT_FIXTURE_COMPARISON="+JSON.stringify(output));
}
if(require.main===module)main().catch(e=>{console.error("PLC4X_SECOND_FIXTURE_FAILED "+String(e?.stack||e));process.exitCode=1;});
module.exports={characterize,runStrictProcess};
