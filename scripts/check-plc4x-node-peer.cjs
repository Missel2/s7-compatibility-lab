// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab S7 Compatibility Lab. Strict read/clean-close oracle for the direct Node peer.
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {digest} = require("../fixtures/independent-cotp-s7-server.cjs");

const srcFixture = path.join(__dirname, "../fixtures/independent-cotp-s7-server.cjs");
const knownDriver = "907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7";
const sha = /^[0-9a-f]{40}$/, d64 = /^[0-9a-f]{64}$/;
const expected = {temperature:12.5,counter:-123,writable:3.25};
const oracleId = "healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1";

function verifyCapture(report, raw, stderr, head, mode) {
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
 assert.equal(report.originalStderrSha256,digest(stderr));
 assert.equal(report.sessionCount,1);
 assert.equal(report.serverStopped,true);
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
 assert.equal(s.sawFin,true,"A clean remote TCP FIN is required");
 assert.equal(s.closeHadError,false);
 assert.equal(s.phase,"COTP_DISCONNECTED");
 assert.deepEqual([s.connections,s.setup,s.reads,s.writes,s.disconnects],[1,1,1,0,1],
  "Exactly one real RFC1006 connection, S7 setup, READ_VAR, zero writes and COTP disconnect");
 assert.equal(s.validRead,true);
 assert.deepEqual(s.errors,[],"A failing independent synthetic server is not evidence against PLC4X");
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
 const cc=frame(s.sent[0]), setupAck=frame(s.sent[1]);
 assert.equal(cc[5],0xd0);
 assert.equal(cc.readUInt16BE(6),cr.readUInt16BE(8));
 for (const [request, response] of [[setup,setupAck],[read,reply]]) {
  assert.equal(request.subarray(4,9).toString("hex"),"02f0803201");
  assert.equal(response.subarray(4,9).toString("hex"),"02f0803203");
  assert.equal(response.readUInt16BE(11),request.readUInt16BE(11),"S7 PDU reference mismatch");
  assert.equal(response.readUInt16BE(17),0,"S7 response contains an error");
  assert.equal(request.length,17+request.readUInt16BE(13)+request.readUInt16BE(15));
  assert.equal(response.length,19+response.readUInt16BE(13)+response.readUInt16BE(15));
 }
 assert.equal(setup[17],0xf0);
 assert.equal(setupAck[19],0xf0);
 assert.equal(disconnect[4],6);
 if (mode==="confirm") {
  const dc=frame(s.sent[3]);
  assert.equal(dc.length,10);
  assert.equal(dc[4],5);
  assert.equal(dc[5],0xc0);
  assert.equal(dc.readUInt16BE(6),disconnect.readUInt16BE(8));
  assert.equal(dc.readUInt16BE(8),disconnect.readUInt16BE(6));
 }
 const events=[];
 for (const [i,hex] of s.received.entries()) {
  const request=frame(hex);
  events.push({direction:"client_rx",length:request.length,sha256:digest(request)});
  if (i<s.sent.length) {
   const response=frame(s.sent[i]);
   events.push({direction:"server_tx",length:response.length,sha256:digest(response)});
  }
 }
 assert.deepEqual(s.events,events,"Framed events must preserve direction, order, length and SHA-256");
 assert.equal(report.hardware,"PENDING_HARDWARE");

 if (s.invalidTail===null) return null;
 const tail=s.invalidTail;
 assert.equal(tail.direction,"client-to-server");
 assert.equal(tail.afterCotpDisconnect,true);
 assert.equal(tail.termination,"TCP_FIN");
 assert.equal(tail.complete,true);
 assert.equal(tail.truncated,false);
 assert.match(tail.rawHex,/^(?:[0-9a-f]{2}){1,4096}$/);
 const bytes=Buffer.from(tail.rawHex,"hex");
 assert.equal(tail.bytes,bytes.length);
 assert.equal(tail.totalObserved,bytes.length);
 assert.equal(tail.sha256,digest(bytes));
 assert.equal(tail.prefixHex,bytes.subarray(0,32).toString("hex"));
 assert.equal(tail.allZero,bytes.every(byte=>byte===0));
 assert.notEqual(bytes[0],3,"Unframed trailer must start outside a TPKT");
 return tail;
}

function runStrict(capture, javaStdout, javaStderr, head, mode) {
 const tail = verifyCapture(JSON.parse(capture), javaStdout, javaStderr, head, mode);
 console.log(JSON.stringify({
  schemaVersion:1, sourceCommit:head, disconnectMode:mode,
  captureSha256:digest(capture), javaStdoutSha256:digest(javaStdout),
  javaStderrSha256:digest(javaStderr),
  outcome:tail ? "CANDIDATE_PROTOCOL_FAILURE" : "SCOPED_PASS",
  reason:tail ? "UNFRAMED_CLIENT_BYTES_AFTER_COTP_DR" : "CLEAN_TCP_CLOSE",
  invalidTrailerBytes:tail?.bytes ?? 0, invalidTrailerSha256:tail?.sha256 ?? null,
  candidateQualified:false
 }));
 return tail ? 1 : 0;
}

if (require.main === module) {
 try {
  const [capture, javaStdout, javaStderr, head, mode] = process.argv.slice(2);
  assert.equal(process.argv.length,7,"Expected capture path, Java stdout/stderr paths, source SHA and disconnect mode");
  process.exitCode = runStrict(fs.readFileSync(capture), fs.readFileSync(javaStdout),
   fs.readFileSync(javaStderr), head, mode);
 } catch(error) {
  console.error("INVALID_NODE_PEER_EVIDENCE " + String(error.stack || error));
  process.exitCode = 2;
 }
}

module.exports = {verifyCapture};
