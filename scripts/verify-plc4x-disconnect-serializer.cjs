// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab S7 Compatibility Lab.
"use strict";
// Independently execute generated COTP packet serialization from the published
// Apache PLC4X 1.0.0 Maven JAR. This does not patch or replace the driver.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {javaClasspath}=require("./assess-plc4x-java-client.cjs");
const {characterize}=require("./assess-plc4x-independent-node-peer.cjs");
const root=path.resolve(__dirname,".."),output=path.join(root,"test-reports");
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const sha=/^[a-f0-9]{40}$/;
const manifestPath=path.join(root,"comparisons/plc4x-1.0.0-disconnect-source-finding.v1.json");
const expectedReleaseCommit="ea229918f5d07700e04d7d69ab1645da679cb700";
const expectedSourceBlob="63b501c8cdfb8216e3fd0707d61681991d74e1d6";
const expectedTcpSourceBlob="12f9d6285d400c6894256469814d303ea0abc83d";
const expectedDriverSha="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const expectedExtraSha="c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2";
function verifySerializerEvidence(e,m,head,driverSha){
 assert.match(head,sha);
 assert.equal(m.schemaVersion,1);
 assert.equal(m.purpose,"PINNED_UPSTREAM_RELEASE_SOURCE_FORENSICS_NOT_PATCHED_DRIVER_QUALIFICATION");
 assert.equal(m.sourceCommit,expectedReleaseCommit);
 assert.equal(m.sourceBlobSha1,expectedSourceBlob);
 assert.equal(m.tcpSourceBlobSha1,expectedTcpSourceBlob);
 assert.equal(m.publishedDriverJarSha256,expectedDriverSha);
 assert.equal(m.originalAllocatedBufferBytes,32);
 assert.equal(m.actualSerializedTpktBytes,11);
 assert.equal(m.excessBytes,21);
 assert.equal(m.excessBytesSha256,expectedExtraSha);
 assert.equal(m.candidateQualified,false);
 assert.equal(m.hardware,"PENDING_HARDWARE");
 assert.equal(driverSha,expectedDriverSha);
 assert.equal(e.schemaVersion,1);
 assert.equal(e.sourceCommit,head);
 assert.equal(e.publishedVersion,"1.0.0");
 assert.equal(e.releaseSourceCommit,expectedReleaseCommit);
 assert.equal(e.originalBufferBytes,32);
 assert.equal(e.serializedTpktBytes,11);
 assert.equal(e.excessBytes,21);
 assert.equal(e.excessSha256,expectedExtraSha);
 assert.equal(e.exactFixPreservesTpkt,true);
 assert.equal(e.candidateQualified,false);
 assert.match(e.exactWireHex,/^[a-f0-9]{22}$/);
 assert.equal(e.originalWireHex,e.exactWireHex+"00".repeat(21),"Actual generated old close must equal valid 11 bytes and exactly 21 zero surplus bytes");
 const raw=Buffer.from(e.exactWireHex,"hex");
 assert.equal(raw[0],3);assert.equal(raw[1],0);
 assert.equal(raw.readUInt16BE(2),11);
 assert.equal(raw[4],6);assert.equal(raw[5],0x80);
 assert.equal(sha256(Buffer.alloc(21)),expectedExtraSha);
 return {schemaVersion:1,sourceCommit:head,releaseSourceCommit:expectedReleaseCommit,
  publishedDriverJarSha256:driverSha,originalBufferBytes:32,
  correctTpktBytes:11,forbiddenTrailingBytes:21,
  originalWireSha256:sha256(Buffer.from(e.originalWireHex,"hex")),
  correctedWireSha256:sha256(raw),
  observedTrailerSha256:e.excessSha256,originalPacketUnchanged:true,
  testedWithRealReleasedMavenClasses:true,candidateQualified:false,hardware:"PENDING_HARDWARE"};
}

function verifyWireMatch(serializer, capture, javaStdout, javaStderr, strict, head, mode) {
 const measured=characterize(capture,javaStdout,javaStderr,strict,head,mode);
 const report=JSON.parse(capture);
 const disconnect=report.session.received.at(-1);
 assert.equal(disconnect,serializer.exactWireHex,"Exact-size serialization must retain the captured DR");
 assert.equal(disconnect+report.session.invalidTail.rawHex,serializer.originalWireHex,
  "Released serialization must reproduce the entire captured DR and trailer byte for byte");
 return {
  mode,captureId:report.captureId,captureSha256:measured.captureSha256,
  originalStrictCandidateExit:measured.originalStrictCandidateExit,
  originalStrictStdoutSha256:measured.originalStrictStdoutSha256,
  originalStrictStderrSha256:measured.originalStrictStderrSha256
 };
}

function verifyTransportJars(classpath, pins){
 const modules=["plc4j-transports-cotp","plc4j-transports-tcp","plc4j-spi-buffers-byte"];
 assert.deepEqual(Object.keys(pins).sort(),modules.sort());
 for (const moduleName of modules) {
  const candidates=classpath.split(path.delimiter).filter(file=>
   path.basename(file).startsWith(moduleName+"-") && file.endsWith(".jar"));
  assert.equal(candidates.length,1,"Exactly one runtime JAR required for "+moduleName);
  assert.equal(path.basename(candidates[0]),moduleName+"-1.0.0.jar");
  assert.match(pins[moduleName],/^[0-9a-f]{64}$/);
  assert.equal(sha256(fs.readFileSync(candidates[0])),pins[moduleName],moduleName+" JAR SHA-256 mismatch");
 }
}

function main(){
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 assert.match(head,sha);
 const expectedHead=process.env.S7_LAB_EXPECTED_SHA ?? process.env.GITHUB_SHA;
 if(expectedHead)assert.equal(head,expectedHead);
 assert.equal(process.platform,"linux");assert.equal(process.arch,"x64");
 const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 const c=javaClasspath();
 verifyTransportJars(c.cp,m.transportJarSha256);
 const classname="org.rischlab.s7lab.Plc4xDisconnectSerializerProof";
 const result=execFileSync("java",["-Xms32m","-Xmx128m","-cp",c.cp,classname],{
  cwd:root,env:{...process.env,S7_LAB_SOURCE_SHA:head},encoding:"utf8",
  timeout:12000,maxBuffer:16384});
 assert.equal(result.trim().split(/\r?\n/).length,1,"Original serialized proof must emit one JSON line");
 const bytes=Buffer.from(result,"utf8");
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,"plc4x-disconnect-serializer-original.json"),bytes);
 const original=JSON.parse(result);
 const assessment=verifySerializerEvidence(original,m,head,c.driverJarSha256);
 const captures=["silence","confirm"].map(mode=>{
  const read=suffix=>fs.readFileSync(path.join(output,"plc4x-node-peer-"+mode+suffix));
  const measured=JSON.parse(read("-assessment.json"));
  const strict={
   status:measured.originalStrictCandidateExit,signal:measured.originalStrictSignal,
   error:measured.originalStrictProcessError,stdout:read("-strict-stdout.log"),
   stderr:read("-strict-stderr.log")
  };
  const match=verifyWireMatch(original,read("-capture.json"),read("-original.json"),
   read("-stderr.log"),strict,head,mode);
  for (const field of ["captureSha256","originalStrictStdoutSha256","originalStrictStderrSha256"]){
   assert.equal(match[field],measured[field]);
  }
  return match;
 });
 assert.notEqual(captures[0].captureId,captures[1].captureId,"Expected separately captured TCP sessions");
 assessment.captures=captures;
 assessment.transportJarSha256=m.transportJarSha256;
 assessment.originalReportSha256=sha256(bytes);
 assessment.sourceFindingFile="comparisons/plc4x-1.0.0-disconnect-source-finding.v1.json";
 assessment.sourceFindingSha256=sha256(fs.readFileSync(manifestPath));
 fs.writeFileSync(path.join(output,"plc4x-disconnect-serializer-assessment.json"),
  JSON.stringify(assessment,null,2)+"\n");
 console.log("PLC4X_PUBLISHED_SERIALIZER_ROOT_CAUSE="+JSON.stringify(assessment));
}
if(require.main===module){try{main()}catch(e){console.error("PLC4X_PUBLISHED_SERIALIZER_PROOF_RED "+String(e?.stack||e));process.exitCode=1;}}
module.exports={verifyWireMatch};
