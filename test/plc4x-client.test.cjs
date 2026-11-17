// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const {verifyPlc4xEvidence}=require("../scripts/assess-plc4x-java-client.cjs");
const head="a".repeat(40),hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function specimen(){
 const original={schemaVersion:1,sourceCommit:head,candidate:"apache-plc4x-java",version:"1.0.0",
  scope:"SOFTWARE_LOOPBACK_ONLY",protocol:"S7COMM_CLASSIC",
  oracleId:"healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1",
  host:"127.0.0.1",db:1,status:"passed",clientCloseInvoked:true,candidateQualified:false,
  observed:{temperature:12.5,counter:-123,writable:3.25}};
 const bytes=Buffer.from(JSON.stringify(original)+"\n");
 const report={schemaVersion:1,sourceCommit:head,driver:"org.apache.plc4x:plc4j-driver-s7:1.0.0",
  driverJarSha256:"b".repeat(64),javaMajor:21,scope:"SOFTWARE_LOOPBACK_ONLY",
  status:"NOT_QUALIFIED",classification:"SCOPED_PASS",candidateQualified:false,instrumentControlsValid:true,
  originalExit:0,originalSignal:null,originalReport:"plc4x-java-original.json",originalReportSha256:hash(bytes),
  readRequests:1,writeRequests:0,cotpRequests:1,activeSessions:0,closedSessions:1,
  cleanClose:true,relayErrors:[],wireEvidence:{schemaVersion:1,scope:"SOFTWARE_LOOPBACK_ONLY",
   evidenceType:"COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP",chainSha256:"c".repeat(64),
   eventCount:4,events:[{direction:"client_rx",frameSha256:"d".repeat(64)},
    {direction:"fixture_tx",frameSha256:"e".repeat(64)},
    {direction:"fixture_rx",frameSha256:"f".repeat(64)},
    {direction:"client_tx",frameSha256:"b".repeat(64)}]}};
 return {report,original,bytes};
}
test("scoped real Java candidate evidence only; no hardware or driver qualification",()=>{
 const {report,bytes}=specimen();const out=verifyPlc4xEvidence(report,head,bytes);
 assert.equal(out.outcome,"SCOPED_PASS");assert.equal(out.candidateQualified,false);
});
test("rejects forged original Java version, host, read bytes and false close",()=>{
 const mutate=[
  x=>x.original.sourceCommit="0".repeat(40),
  x=>x.original.candidate="fake-plc4x",
  x=>x.original.version="2.0.0",
  x=>x.original.protocol="S7COMMPLUS",
  x=>x.original.host="192.168.1.42",
  x=>x.original.db=2,
  x=>x.original.clientCloseInvoked=false,
  x=>x.original.status="failed",
  x=>x.original.candidateQualified=true,
  x=>x.original.observed.temperature=99,
  x=>x.original.observed.counter=42,
  x=>x.original.additional="unknown field"
 ];
 for(const f of mutate){const s=specimen();f(s);s.bytes=Buffer.from(JSON.stringify(s.original)+"\n");
  s.report.originalReportSha256=hash(s.bytes);assert.throws(()=>verifyPlc4xEvidence(s.report,head,s.bytes),String(f));}
});
test("rejects absent wire, forbidden WRITE_VAR, open sockets, tampered raw original, stale SHA and client failure",()=>{
 const edits=[
  x=>x.report.sourceCommit="0".repeat(40),
  x=>x.report.status="CANDIDATE_QUALIFIED",
  x=>x.report.candidateQualified=true,
  x=>x.report.classification="SAFE_DRIVER",
  x=>x.report.instrumentControlsValid=false,
  x=>x.report.driver="other:driver:1.0.0",
  x=>x.report.driverJarSha256="not-a-digest",
  x=>x.report.javaMajor=17,
  x=>x.report.originalExit=1,
  x=>x.report.originalSignal="SIGKILL",
  x=>x.report.originalReportSha256="f".repeat(64),
  x=>x.report.readRequests=0,
  x=>x.report.writeRequests=1,
  x=>x.report.cotpRequests=0,
  x=>x.report.activeSessions=1,
  x=>x.report.closedSessions=0,
  x=>x.report.cleanClose=false,
  x=>x.report.relayErrors=["connection reset"],
  x=>x.report.wireEvidence.eventCount=0,
  x=>x.report.wireEvidence.chainSha256="missing",
  x=>x.report.wireEvidence.events[0].direction="simulated",
  x=>x.report.wireEvidence.events[0].frameSha256="notsha",
 ];
 for(const f of edits){const s=specimen();f(s);assert.throws(()=>verifyPlc4xEvidence(s.report,head,s.bytes),String(f));}
});
test("report is cryptographically bound to original read bytes instead of assessor claims",()=>{
 const s=specimen();s.bytes=Buffer.concat([s.bytes,Buffer.from("\n")]);
 assert.throws(()=>verifyPlc4xEvidence(s.report,head,s.bytes),/originalReportSha256|Expected values/);
 assert.throws(()=>verifyPlc4xEvidence(s.report,"not-a-sha",specimen().bytes));
});
