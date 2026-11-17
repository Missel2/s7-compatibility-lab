// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Separate, released Python S7 client process via a *real* loopback relay.
// This is candidate characterization, not device or release qualification.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { createWirePeer } = require("../lib/wire-peer.cjs");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "test-reports");
const originalFile = "python-snap7-client-original.json";
const summaryFile = "python-snap7-client-assessment.json";
const oracleId = "healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1";
const sourceVersion = "3.3.1";
const expectedHex = "41480000ff85060740500000";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const isSha = /^[0-9a-f]{40}$/;
const isDigest = /^[0-9a-f]{64}$/;

function verifyPythonEvidence(report, head, originalBytes) {
  assert.match(head, isSha);
  assert.ok(Buffer.isBuffer(originalBytes) && originalBytes.length > 50);
  assert.match(report.sourceCommit, isSha);
  assert.equal(report.sourceCommit, head);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scope, "SOFTWARE_LOOPBACK_ONLY");
  assert.equal(report.candidate, "python-snap7-client");
  assert.equal(report.version, sourceVersion);
  assert.equal(report.oracleId, oracleId);
  assert.equal(report.fixture, "snap7-3.3.1-DB1-2048");
  assert.equal(report.status, "NOT_QUALIFIED");
  assert.equal(report.classification, "SCOPED_PASS");
  assert.equal(report.candidateQualified, false);
  assert.equal(report.instrumentControlsValid, true);
  assert.equal(report.originalStrictExit, 0);
  assert.equal(report.originalReport, originalFile);
  assert.match(report.originalSha256, isDigest);
  assert.equal(report.originalSha256, sha256(originalBytes), "Original client bytes were modified");
  const original = JSON.parse(originalBytes.toString("utf8"));
  assert.deepEqual(Object.keys(original).sort(), [
    "candidate", "candidateQualified", "clientDisconnectInvoked", "db", "fixture",
    "host", "observed", "oracleId", "protocol", "rawHex", "rawSha256",
    "readLength", "schemaVersion", "scope", "sourceCommit", "start",
    "status", "version",
  ].sort());
  assert.equal(original.sourceCommit, head);
  assert.equal(original.status, "passed");
  assert.equal(original.candidate, report.candidate);
  assert.equal(original.version, sourceVersion);
  assert.equal(original.protocol, "S7COMM_CLASSIC");
  assert.equal(original.fixture, report.fixture);
  assert.equal(original.oracleId, oracleId);
  assert.equal(original.scope, "SOFTWARE_LOOPBACK_ONLY");
  assert.equal(original.candidateQualified, false);
  assert.equal(original.host, "127.0.0.1");
  assert.equal(original.db, 1);
  assert.equal(original.start, 0);
  assert.equal(original.readLength, 12);
  assert.equal(original.rawHex, expectedHex, "Exact synthetic 2048-byte DB1 readback mismatch");
  assert.equal(original.rawSha256, sha256(Buffer.from(expectedHex, "hex")));
  assert.deepEqual(original.observed, { temperature: 12.5, counter: -123, writable: 3.25 });
  assert.equal(original.clientDisconnectInvoked, true);
  assert.deepEqual(report.readback, original.observed);
  assert.equal(report.rawHex, expectedHex);
  assert.equal(report.cleanClose, true);
  assert.ok(Number.isSafeInteger(report.readRequests) && report.readRequests >= 1);
  assert.equal(report.writeRequests, 0, "A strictly read-only candidate must not write");
  assert.ok(Number.isSafeInteger(report.cotpRequests) && report.cotpRequests >= 1);
  assert.ok(Number.isSafeInteger(report.closedSessions) && report.closedSessions >= 1);
  assert.equal(report.activeSessions, 0, "S7 candidate left open TCP sessions");
  assert.deepEqual(report.relayErrors, []);
  const wire = report.wireEvidence;
  assert.equal(wire.schemaVersion, 1);
  assert.equal(wire.scope, "SOFTWARE_LOOPBACK_ONLY");
  assert.equal(wire.evidenceType, "COMPLETE_TPKT_FRAME_SHA256_NOT_RAW_PCAP");
  assert.ok(wire.eventCount >= 4 && wire.eventCount === wire.events.length);
  assert.match(wire.chainSha256, isDigest);
  assert.ok(wire.events.some(x => x.direction === "client_rx" && isDigest.test(x.frameSha256)),
    "Missing real client-to-fixture TPKT proof");
  assert.ok(wire.events.some(x => x.direction === "fixture_rx" && isDigest.test(x.frameSha256)),
    "Missing real S7 reply from fixture");
  return {
    candidate: report.candidate, version: report.version, oracleId: report.oracleId,
    sourceCommit: head, outcome: "SCOPED_PASS", originalReport: originalFile,
    originalSha256: report.originalSha256, frameDigest: wire.chainSha256,
    candidateQualified: false,
  };
}

function bounded(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error("HARNESS_TIMEOUT " + what)), ms);
  })]).finally(() => clearTimeout(timer));
}
async function poll(fn, ms, what) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (fn()) return;
    await sleep(40);
  }
  throw Error("HARNESS_TIMEOUT " + what);
}
async function startFixture(python) {
  const child = spawn(python, ["-u", "fixtures/s7_server.py"], {
    cwd: root,
    env: {...process.env, S7_FIXTURE_PORT: "0", S7_FIXTURE_DB_BYTES: "2048", PYTHONUNBUFFERED: "1"},
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = readline.createInterface({input: child.stdout});
  let diagnostic = "";
  child.stderr.on("data", (b) => { diagnostic += String(b).slice(-2000); });
  const closed = once(child, "close");
  try {
    const port = await bounded(new Promise((resolve, reject) => {
      const onLine = (line) => {
        const match = /^S7_WIRE_FIXTURE_READY (\d+) (3\.3\.1)$/.exec(line);
        if (!match) { cleanup(); reject(Error("Unexpected fixture greeting: " + line)); return; }
        cleanup(); resolve(Number(match[1]));
      };
      const onClose = () => { cleanup(); reject(Error("Fixture exited before ready: " + diagnostic)); };
      const cleanup = () => { lines.off("line", onLine); child.off("close", onClose); };
      lines.on("line", onLine);
      child.once("close", onClose);
    }), 14000, "fixture startup");
    assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
    return {port, async stop() {
      lines.close();
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await bounded(closed, 6500, "fixture teardown");
    }};
  } catch (error) {
    child.kill("SIGKILL");
    lines.close();
    throw error;
  }
}
function inspectOriginalProcess({stdout, stderr, code, signal, timedOut=false, truncated=false}) {
  assert.ok(Buffer.isBuffer(stdout) && Buffer.isBuffer(stderr), "Must preserve original process bytes");
  assert.ok(code===null || (Number.isInteger(code) && code>=0 && code<=255));
  assert.ok(signal===null || typeof signal==="string");
  const originalStrictExit=code;
  const originalSignal=signal;
  const originalTimedOut=timedOut;
  const originalStdoutSha256=sha256(stdout);
  const originalStderrSha256=sha256(stderr);
  const originalStderrTail=stderr.toString("utf8").slice(-2500);
  const validSingleLine=stdout.length>0 && stdout.length<10000 &&
    stdout.toString("utf8").trim().split(/\r?\n/).length===1;
  const candidateProcessSucceeded=code===0 && signal===null && !timedOut && !truncated && validSingleLine;
  return {originalStrictExit,originalSignal,originalTimedOut,originalTruncated:truncated,
    originalStdoutSha256,originalStderrSha256,originalStderrTail,
    candidateProcessSucceeded};
}
async function runOriginalClient(python, port, head) {
  const child = spawn(python, ["-u", "scripts/candidates/python-snap7-read.py", "--port", String(port)], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: {...process.env, S7_LAB_SOURCE_SHA: head},
  });
  let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), truncated = false;
  const append=(current, part)=>{
    if(current.length+part.length>65536)truncated=true;
    return Buffer.concat([current,part.subarray(0,Math.max(0,65536-current.length))]);
  };
  child.stdout.on("data", (part) => {stdout=append(stdout,part);});
  child.stderr.on("data", (part) => {stderr=append(stderr,part);});
  const closed=once(child,"close");
  let code=null, signal=null, timedOut=false;
  try {
    try {
      [code,signal]=await bounded(closed,18000,"original Python client");
    } catch(error) {
      if(!String(error.message).startsWith("HARNESS_TIMEOUT original Python client"))throw error;
      timedOut=true;
      child.kill("SIGKILL");
      [code,signal]=await bounded(closed,4500,"killed Python client");
    }
    return {stdout,stderr,code,signal,timedOut,truncated};
  } finally {
    if(child.exitCode===null && child.signalCode===null)child.kill("SIGKILL");
  }
}
async function main() {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {cwd: root, encoding: "utf8"}).trim();
  assert.match(head, isSha);
  if (process.env.GITHUB_SHA) assert.equal(process.env.GITHUB_SHA, head);
  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");
  const python = process.env.S7_FIXTURE_PYTHON || "python";
  fs.mkdirSync(outputDir, {recursive: true});
  fs.rmSync(path.join(outputDir, originalFile), {force: true});
  let fixture, peer, original;
  const report = {
    schemaVersion: 1, sourceCommit: head, candidate: "python-snap7-client",
    version: sourceVersion, fixture: "snap7-3.3.1-DB1-2048",
    oracleId, scope: "SOFTWARE_LOOPBACK_ONLY",
    status: "NOT_QUALIFIED", classification: "UNASSESSED",
    candidateQualified: false, instrumentControlsValid: false,
    originalReport: originalFile,
  };
  try {
    fixture = await startFixture(python);
    peer = await createWirePeer(fixture.port);
    const processResult = await runOriginalClient(python, peer.port, head);
    original = processResult.stdout;
    // Persist actual stdout BEFORE any strict candidate exit or JSON assertion.
    // A failing candidate is not equivalent to a failed fixture/observer.
    fs.writeFileSync(path.join(outputDir, originalFile), original);
    Object.assign(report, inspectOriginalProcess(processResult));
    report.originalSha256 = sha256(original);
    report.originalReportPreserved = true;
    if(!report.candidateProcessSucceeded) {
      const candidateError = Error("Real Python client failed: exit=" + report.originalStrictExit +
        " signal=" + report.originalSignal + " timedOut=" + report.originalTimedOut +
        " stderr=" + report.originalStderrTail);
      candidateError.candidateFailure=true;
      throw candidateError;
    }
    await poll(() => peer.active.size === 0 && peer.closed.length >= 1, 4500, "real TCP close");
    const orig = JSON.parse(original.toString("utf8"));
    Object.assign(report, {
      classification: "SCOPED_PASS", instrumentControlsValid: true,
      originalStrictExit: 0, originalSha256: sha256(original),
      rawHex: orig.rawHex, readback: orig.observed,
      readRequests: peer.reads.length, writeRequests: peer.writes.length,
      cotpRequests: peer.cotpRequests, cleanClose: true,
      activeSessions: peer.active.size, closedSessions: peer.closed.length,
      relayErrors: peer.errors.slice(), wireEvidence: peer.getWireEvidence(),
    });
    verifyPythonEvidence(report, head, original);
    console.log("PYTHON_SNAP7_EXTERNAL_CANDIDATE=" + JSON.stringify({
      head, version: sourceVersion, result: report.classification,
      reads: report.readRequests, writes: report.writeRequests,
      fullTpktFrames: report.wireEvidence.eventCount,
      cleanClose: report.cleanClose, candidateQualified: false,
    }));
  } catch (error) {
    report.classification = error.candidateFailure ? "CANDIDATE_FAILURE" : "INSTRUMENT_OR_CANDIDATE_FAILURE";
    if(!error.candidateFailure) report.instrumentControlsValid = false;
    report.errorOrigin = error.candidateFailure ? "PUBLISHED_CLIENT_PROCESS" : "HARNESS_OR_ASSESSOR";
    report.error = String(error?.stack || error).slice(0, 5000);
    console.error("PYTHON_SNAP7_EXTERNAL_CANDIDATE_RED " + report.error);
    process.exitCode = 1;
  } finally {
    if (peer) {
      try { await bounded(peer.close(), 6000, "relay teardown"); }
      catch (e) { report.peerCleanupError = String(e); process.exitCode = 1; }
    }
    if (fixture) {
      try { await fixture.stop(); }
      catch (e) { report.fixtureCleanupError = String(e); process.exitCode = 1; }
    }
    if (report.peerCleanupError || report.fixtureCleanupError) {
      report.instrumentControlsValid = false;
      report.classification = "INSTRUMENT_OR_CANDIDATE_FAILURE";
      report.errorOrigin = "HARNESS_TEARDOWN";
    }
    fs.writeFileSync(path.join(outputDir, summaryFile), JSON.stringify(report, null, 2) + "\n");
  }
}
if (require.main === module) main().catch((e) => {
  console.error("PYTHON_SNAP7_HARNESS_RED " + String(e.stack || e));
  process.exitCode = 1;
});
module.exports = {verifyPythonEvidence,inspectOriginalProcess};
