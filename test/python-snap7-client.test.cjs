// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {verifyPythonEvidence} = require("../scripts/assess-python-snap7-client.cjs");
const sha = "e".repeat(40);
const rawHex = "41480000ff85060740500000";
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
function specimen() {
  const original = {
    schemaVersion: 1, sourceCommit: sha, candidate: "python-snap7-client",
    version: "3.3.1", scope: "SOFTWARE_LOOPBACK_ONLY",
    oracleId: "healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1",
    fixture: "snap7-3.3.1-DB1-2048", protocol: "S7COMM_CLASSIC",
    status: "passed", host: "127.0.0.1", db: 1, start: 0,
    readLength: 12, rawHex, rawSha256: hash(Buffer.from(rawHex, "hex")),
    observed: {temperature: 12.5, counter: -123, writable: 3.25},
    clientDisconnectInvoked: true, candidateQualified: false,
  };
  const bytes = Buffer.from(JSON.stringify(original) + "\n");
  const wire = {schemaVersion: 1, scope: "SOFTWARE_LOOPBACK_ONLY",
    evidenceType: "COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP",
    eventCount: 4, chainSha256: "a".repeat(64),
    events: [
      {direction: "client_rx", frameSha256: "b".repeat(64)},
      {direction: "fixture_tx", frameSha256: "c".repeat(64)},
      {direction: "fixture_rx", frameSha256: "d".repeat(64)},
      {direction: "client_tx", frameSha256: "e".repeat(64)},
    ],
  };
  const report = {
    schemaVersion: 1, sourceCommit: sha, candidate: "python-snap7-client",
    version: "3.3.1", scope: "SOFTWARE_LOOPBACK_ONLY",
    oracleId: original.oracleId, fixture: original.fixture,
    status: "NOT_QUALIFIED", classification: "SCOPED_PASS",
    candidateQualified: false, instrumentControlsValid: true,
    originalStrictExit: 0, originalReport: "python-snap7-client-original.json",
    originalSha256: hash(bytes), readback: original.observed,
    rawHex, cleanClose: true, readRequests: 1, writeRequests: 0,
    cotpRequests: 1, closedSessions: 1, activeSessions: 0,
    relayErrors: [], wireEvidence: wire,
  };
  return {report, original, bytes};
}
test("separate real Python candidate with exact DB1 byte oracle is scoped, never qualified", () => {
  const s = specimen();
  const r = verifyPythonEvidence(s.report, sha, s.bytes);
  assert.equal(r.outcome, "SCOPED_PASS");
  assert.equal(r.candidateQualified, false);
  assert.equal(r.originalSha256, hash(s.bytes));
});
test("forged original fields and bytes are rejected even when summary claims PASS", () => {
  const mutate = [
    x => {x.original.sourceCommit = "0".repeat(40);},
    x => {x.original.rawHex = "41480000ff85000040500000";},
    x => {x.original.rawSha256 = "0".repeat(64);},
    x => {x.original.host = "10.0.0.1";},
    x => {x.original.candidateQualified = true;},
    x => {x.original.version = "3.4.0";},
    x => {x.original.clientDisconnectInvoked = false;},
    x => {x.original.observed.writable = 19.75;},
    x => {x.original.status = "failed";},
    x => {x.original.protocol = "S7COMMPLUS";},
    x => {x.original.extra = "unreviewed";},
  ];
  for (const change of mutate) {
    const s = specimen();
    change(s);
    s.bytes = Buffer.from(JSON.stringify(s.original)+"\n");
    s.report.originalSha256 = hash(s.bytes);
    assert.throws(() => verifyPythonEvidence(s.report, sha, s.bytes), String(change));
  }
});
test("original byte-level tampering after assessment is rejected", () => {
  const s = specimen();
  s.bytes = Buffer.concat([s.bytes, Buffer.from("\n")]);
  assert.throws(() => verifyPythonEvidence(s.report, sha, s.bytes), /modified/);
});
test("false wire, spoofed process exit, cleanup, unauthorized write and stale head fail closed", () => {
  const changes = [
    s => {s.report.originalStrictExit = 1;},
    s => {s.report.instrumentControlsValid = false;},
    s => {s.report.readRequests = 0;},
    s => {s.report.writeRequests = 1;},
    s => {s.report.cotpRequests = 0;},
    s => {s.report.closedSessions = 0;},
    s => {s.report.activeSessions = 1;},
    s => {s.report.cleanClose = false;},
    s => {s.report.relayErrors = ["socket timeout"];},
    s => {s.report.wireEvidence.events = [];},
    s => {s.report.wireEvidence.events[0].frameSha256 = "not-hashed";},
    s => {s.report.wireEvidence.events[0].direction = "simulated";},
    s => {s.report.wireEvidence.chainSha256 = "not-a-digest";},
    s => {s.report.sourceCommit = "0".repeat(40);},
    s => {s.report.candidateQualified = true;},
    s => {s.report.classification = "CANDIDATE_QUALIFIED";},
    s => {s.report.rawHex = "000000000000000000000000";},
    s => {s.report.readback.counter = 0;},
  ];
  for (const change of changes) {
    const s = specimen();
    change(s);
    assert.throws(() => verifyPythonEvidence(s.report, sha, s.bytes), String(change));
  }
});
test("original report must contain valid JSON in expected exact source format", () => {
  const s = specimen();
  assert.throws(() => verifyPythonEvidence(s.report, sha, Buffer.from("{}")));
  assert.throws(() => verifyPythonEvidence(s.report, sha, Buffer.from("{bad")));
  assert.throws(() => verifyPythonEvidence(s.report, "wrong-head", s.bytes));
});
