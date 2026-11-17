"use strict";
// A green *characterization* run is NOT a green candidate qualification.
// It proves one exact published bad baseline still exhibits known unsafe behavior.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "test-reports");
const expectedEngine = "node-red-contrib-s7-rust@1.4.0";

function verifyGoodRead(d) {
  assert.equal(d.engine, "rust");
  assert.equal(d.pkg, "1.4.0");
  assert.equal(d.nodeRed, "5.0.9");
  assert.equal(d.fault, "inconsistent_data_length");
  assert.equal(d.verdict, "passed", "good control must reject invalid S7 header");
  assert.equal(d.unverifiedFreshValues, false);
  assert.equal(d.mutation?.requestObserved, true);
  assert.equal(d.mutation?.deliveredDataLength, 32767);
  assert.ok(d.mutation.originalDataLength < d.mutation.deliveredDataLength);
  assert.ok(d.readRequests >= 2, "correct control must not take first corrupted response");
  assert.ok(d.correctReadbacks >= 1, "good response must be readable");
  assert.deepEqual(d.proxyErrors, []);
  return { outcome: "SAFE_ON_THIS_CASE", observedRequests: d.readRequests };
}
function verifyWrongPdu(d) {
  assert.equal(d.engine, "rust");
  assert.equal(d.pkg, "1.4.0");
  assert.equal(d.nodeRed, "5.0.9");
  assert.equal(d.fault, "wrong_pdu_reference");
  assert.equal(d.verdict, "failed", "original must fail actual read safety assertion");
  assert.equal(d.mutation?.requestObserved, true, "must observe the real READ_VAR ACK");
  assert.ok(d.mutation?.originalPduRef !== d.mutation?.deliveredPduRef);
  assert.equal(d.mutation?.originalBytes, d.mutation?.deliveredBytes);
  assert.equal(d.unverifiedFreshValues, true, "candidate must emit data from invalid PDU ref");
  assert.equal(d.readRequests, 1, "must NOT have obtained fresh data from a legitimate retry");
  assert.equal(d.correctReadbacks, 1);
  assert.match(d.error || "", /cannot accept corrupted single READ_VAR reply/);
  assert.deepEqual(d.proxyErrors, []);
  return { outcome: "KNOWN_UNSAFE", originalRef: d.mutation.originalPduRef,
    deliveredRef: d.mutation.deliveredPduRef, observedRequests: d.readRequests };
}
function verifyWriteAndLifecycle(d) {
  assert.equal(d.implementation, expectedEngine);
  assert.equal(d.nodeRed, "5.0.9");
  assert.equal(d.caseMode, "full");
  assert.equal(d.result, "failed", "original has known P0 regressions");
  for(const positive of ["healthy_read","invalid_write","acknowledged_write","pending_read_on_unload"])
    assert.equal(d.scenarios?.[positive]?.result, "passed", positive + " positive control");
  const write=d.scenarios.lost_write_ack;
  assert.equal(write.result, "failed", "must not silently label uncertain WRITE_VAR as safe");
  assert.equal(write.fixtureApplied, true, "must independently verify applied write");
  assert.equal(write.ackDropsObserved, 1, "exactly one applied-then-lost ACK");
  assert.equal(write.observedOutcome, "unexpected_success", "Rust 1.4.0 falsely acknowledged the write");
  assert.ok(write.totalWireWritesForAttempt >= 2, "second physical write request was observed");
  assert.ok(write.replayedWriteCount >= 1, "unsafe duplicate write");
  const blackhole=d.scenarios.blackhole_and_explicit_removal;
  assert.equal(blackhole.result, "failed");
  assert.equal(blackhole.cotpObserved, true);
  assert.ok(blackhole.reconnectAttemptsAfterRemoval >= 1, "COTP retry after explicit unload");
  assert.equal(blackhole.socketsAfterRemoval, 0, "not just a still-open socket");
  assert.equal(d.failed, undefined, "instrument itself must not have crashed");
  for(const key of ["cleanupError","stopError","proxyStopError","fixtureStopError"])
    assert.equal(d[key],undefined,key);
  return { outcome:"KNOWN_UNSAFE", appliedWrites:write.totalWireWritesForAttempt,
    retryWrites:write.replayedWriteCount, lateCotpAttempts:blackhole.reconnectAttemptsAfterRemoval };
}
function execute(name, env, command, script, reportName, verifier, expectedExit) {
  const filepath=path.join(reportDir,reportName);
  fs.rmSync(filepath, { force: true });
  const child=spawnSync(command,[script,path.join(root,".candidate-consumer")], {
    cwd:root,env:{...process.env,...env},encoding:"utf8",
    timeout:150000,killSignal:"SIGKILL",maxBuffer:8*1024*1024,
  });
  const transcript=(child.stdout||"")+"\n"+(child.stderr||"");
  if(child.error||child.signal||child.status!==expectedExit)
    throw new Error(name+" failed to produce expected exit="+expectedExit+
      "; actual="+child.status+" signal="+child.signal+" error="+child.error+
      "\n"+transcript.slice(-3000));
  assert.ok(fs.existsSync(filepath),name+" must create machine-readable report");
  // Hash the exact original bytes assessed, not a JSON serialization.
  // The downstream same-run collator rejects any replacement after assessment.
  const originalBytes=fs.readFileSync(filepath);
  const raw=JSON.parse(originalBytes);
  const assessment=verifier(raw);
  const reportSha256=crypto.createHash("sha256").update(originalBytes).digest("hex");
  process.stdout.write("CHARACTERIZED_"+name+"="+JSON.stringify(assessment)+"\n");
  return { name,exitCode:child.status,report:reportName,reportSha256,...assessment };
}
function main() {
  fs.mkdirSync(reportDir,{recursive:true});
  const baseline={schemaVersion:1,candidate:expectedEngine,
    classification:"NOT_QUALIFIED",behavioralSafety:"KNOWN_UNSAFE",
    hardware:"PENDING_HARDWARE",sourceCommit:process.env.GITHUB_SHA||"local",
    outputs:[],candidatePass:false};
  try {
    const cases=[
      ["correct_header_rejection", {S7_READ_FAULT_ENGINE:"rust",S7_READ_FAULT_CASE:"inconsistent_data_length"},
        "test/candidates/rust-malformed-read.cjs","malformed-read-rust-inconsistent_data_length.json",verifyGoodRead,0],
      ["wrong_pdu_reference", {S7_READ_FAULT_ENGINE:"rust",S7_READ_FAULT_CASE:"wrong_pdu_reference"},
        "test/candidates/rust-malformed-read.cjs","malformed-read-rust-wrong_pdu_reference.json",verifyWrongPdu,1],
      ["lost_write_ack_and_teardown", {S7_RUST_PARITY_CASE:"full"},
        "test/candidates/rust-fault-parity.cjs","rust-s7-ci-parity.json",verifyWriteAndLifecycle,1],
    ];
    for(const [name,env,script,reportName,verify,expectedExit] of cases)
      baseline.outputs.push(execute(name,env,process.execPath,script,reportName,verify,expectedExit));
    baseline.instrumentControlsValid=true;
    baseline.originalDefectsReproduced=true;
    process.stdout.write("KNOWN_UNSAFE_RUST_1_4_0_BASELINE=CONFIRMED\n");
  } catch(error) {
    baseline.instrumentControlsValid=false;
    baseline.originalDefectsReproduced=false;
    baseline.error=String(error?.stack||error).slice(0,4500);
    process.exitCode=1;
    console.error(baseline.error);
  } finally {
    fs.writeFileSync(path.join(reportDir,"rust-1.4.0-baseline-assessment.json"),
      JSON.stringify(baseline,null,2)+"\n");
  }
}
if(require.main===module)main();
module.exports={verifyGoodRead,verifyWrongPdu,verifyWriteAndLifecycle};
