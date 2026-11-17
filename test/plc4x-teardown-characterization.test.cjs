// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {verifyKnownPlc4xAnomaly}=require("../scripts/characterize-plc4x-java-disconnect.cjs");
const {fixture,head,sha}=require("./helpers/plc4x-known-unsafe-fixture.cjs");

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
  x=>x.r.invalidTpkt[0].truncated=true,
  x=>x.r.invalidTpkt[0].termination="TIME_LIMIT",
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
