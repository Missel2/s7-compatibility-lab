// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const crypto=require("node:crypto");
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
module.exports={fixture,head,sha};
