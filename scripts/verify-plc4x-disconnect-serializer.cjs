// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Independently execute generated COTP packet serialization from the published
// Apache PLC4X 1.0.0 Maven JAR. This does not patch or replace the driver.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {execFileSync}=require("node:child_process");
const {javaClasspath}=require("./assess-plc4x-java-client.cjs");
const root=path.resolve(__dirname,".."),output=path.join(root,"test-reports");
const sha256=b=>crypto.createHash("sha256").update(b).digest("hex");
const sha=/^[a-f0-9]{40}$/;
const manifestPath=path.join(root,"comparisons/plc4x-1.0.0-disconnect-source-finding.v1.json");
const expectedReleaseCommit="ea229918f5d07700e04d7d69ab1645da679cb700";
const expectedSourceBlob="63b501c8cdfb8216e3fd0707d61681991d74e1d6";
const expectedDriverSha="907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const expectedExtraSha="c90232586b801f9558a76f2f963eccd831d9fe6775e4c8f1446b2331aa2132f2";
function verifySerializerEvidence(e,m,head,driverSha){
 assert.match(head,sha);
 assert.equal(m.schemaVersion,1);
 assert.equal(m.purpose,"PINNED_UPSTREAM_RELEASE_SOURCE_FORENSICS_NOT_PATCHED_DRIVER_QUALIFICATION");
 assert.equal(m.sourceCommit,expectedReleaseCommit);
 assert.equal(m.sourceBlobSha1,expectedSourceBlob);
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
function main(){
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
 assert.match(head,sha);
 if(process.env.GITHUB_SHA)assert.equal(head,process.env.GITHUB_SHA);
 assert.equal(process.platform,"linux");assert.equal(process.arch,"x64");
 const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
 const c=javaClasspath();
 const classname="org.rischlab.s7lab.Plc4xDisconnectSerializerProof";
 const result=execFileSync("java",["-Xms32m","-Xmx128m","-cp",c.cp,classname],{
  cwd:root,env:{...process.env,S7_LAB_SOURCE_SHA:head},encoding:"utf8",
  timeout:12000,maxBuffer:16384});
 assert.equal(result.trim().split(/\r?\n/).length,1,"Original serialized proof must emit one JSON line");
 const original=JSON.parse(result);
 const assessment=verifySerializerEvidence(original,m,head,c.driverJarSha256);
 const bytes=Buffer.from(result,"utf8");
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,"plc4x-disconnect-serializer-original.json"),bytes);
 assessment.originalReportSha256=sha256(bytes);
 assessment.sourceFindingFile="comparisons/plc4x-1.0.0-disconnect-source-finding.v1.json";
 assessment.sourceFindingSha256=sha256(fs.readFileSync(manifestPath));
 fs.writeFileSync(path.join(output,"plc4x-disconnect-serializer-assessment.json"),
  JSON.stringify(assessment,null,2)+"\n");
 console.log("PLC4X_PUBLISHED_SERIALIZER_ROOT_CAUSE="+JSON.stringify(assessment));
}
if(require.main===module){try{main()}catch(e){console.error("PLC4X_PUBLISHED_SERIALIZER_PROOF_RED "+String(e?.stack||e));process.exitCode=1;}}
module.exports={verifySerializerEvidence};
