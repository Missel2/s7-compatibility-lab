// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab S7 Compatibility Lab. Read-only PLC4X 0.13.1 close observation.
"use strict";

const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {digest, startIndependentS7Server} = require("../fixtures/independent-cotp-s7-server.cjs");
const {verifyReadReplyDelivery} = require("../lib/verify-split-read-reply.cjs");
const {runJava} = require("./assess-plc4x-java-client.cjs");

const root = path.resolve(__dirname, "..");
const project = path.join(root, "java/plc4x-0.13.1");
const fixture = path.join(root, "fixtures/independent-cotp-s7-server.cjs");
const version = "0.13.1";
const driver = "org.apache.plc4x:plc4j-driver-s7:" + version;
const driverName = "plc4j-driver-s7-0.13.1.jar";
const driverPin = "7be84d58e3f06666df63ed64e55821153bf663c3d4c5855d846a7617b0dcc89a";
const readParameters = "0403120a10080001000184000000120a10050001000184000020120a10080001000184000040";
const readReply = "0403ff04002041480000ff040010ff85ff04002040500000";

function verifyHistoricalCapture(capture, stdout, stderr) {
  assert.match(capture.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(capture.version, version);
  assert.equal(capture.driver, driver);
  assert.equal(capture.driverJarSha256, driverPin);
  assert.equal(capture.fixtureSourceSha256, digest(fs.readFileSync(fixture)));
  assert.equal(capture.java.code, 0);
  assert.equal(capture.java.signal, null);
  assert.equal(capture.java.timedOut, false);
  assert.equal(capture.java.truncated, false);
  assert.equal(capture.java.stdoutSha256, digest(stdout));
  assert.equal(capture.java.stderrSha256, digest(stderr));
  assert.deepEqual(JSON.parse(stdout), {
    version,
    sourceCommit: capture.sourceCommit,
    observed: {real0: 12.5, int4: -123, real8: 3.25},
  });
  assert.equal(capture.sessions.length, 1);
  const [session] = capture.sessions;
  assert.equal(session.phase, "READY");
  assert.deepEqual(session.errors, []);
  assert.equal(session.closed, true);
  assert.equal(session.sawFin, true);
  assert.equal(session.closeHadError, false);
  assert.equal(session.validRead, true);
  assert.equal(session.invalidTail, null);
  assert.deepEqual([session.connections, session.setup, session.reads,
    session.writes, session.disconnects], [1, 1, 1, 0, 0]);
  assert.equal(session.received.length, 3);
  assert.equal(session.sent.length, 3);

  const frames = [];
  const events = [];
  for (let i = 0; i < 3; i++) {
    for (const [direction, hex] of [["client_rx", session.received[i]], ["server_tx", session.sent[i]]]) {
      assert.match(hex, /^(?:[a-f0-9]{2})+$/);
      const packet = Buffer.from(hex, "hex");
      assert.equal(packet.readUInt16BE(0), 0x0300);
      assert.equal(packet.readUInt16BE(2), packet.length);
      frames.push(packet);
      events.push({direction, length: packet.length, sha256: digest(packet)});
    }
  }
  assert.deepEqual(session.events, events);
  const [cr, cc, setup, setupAck, read, ack] = frames;
  assert.equal(cr[5], 0xe0);
  assert.equal(cc[5], 0xd0);
  assert.equal(cc.readUInt16BE(6), cr.readUInt16BE(8));
  for (const [request, reply] of [[setup, setupAck], [read, ack]]) {
    assert.equal(request.subarray(4, 9).toString("hex"), "02f0803201");
    assert.equal(reply.subarray(4, 9).toString("hex"), "02f0803203");
    assert.equal(request.readUInt16BE(11), reply.readUInt16BE(11));
    assert.equal(reply.readUInt16BE(17), 0);
    assert.equal(request.length, 17 + request.readUInt16BE(13) + request.readUInt16BE(15));
    assert.equal(reply.length, 19 + reply.readUInt16BE(13) + reply.readUInt16BE(15));
  }
  assert.equal(setup[17], 0xf0);
  assert.equal(setupAck[19], 0xf0);
  assert.equal(read.subarray(17).toString("hex"), readParameters);
  assert.equal(ack.subarray(19).toString("hex"), readReply);
  const readReplyWriteLengths = verifyReadReplyDelivery(ack, session.readReplyWrites, capture.splitReadReply);
  return {
    sourceCommit: capture.sourceCommit, scope: "SOFTWARE_LOOPBACK_ONLY",
    outcome: "NOT_OBSERVED_UNSAFE", observation: "TCP_FIN_WITHOUT_COTP_DR",
    driver: capture.driver, driverJarSha256: capture.driverJarSha256,
    javaExit: capture.java.code, cotpDisconnectRequests: 0,
    splitReadReply: capture.splitReadReply, readReplyWriteLengths,
    readRequests: 1, writeRequests: 0, unframedTrailerBytes: 0,
    drDcExercised: false, candidateQualified: false, hardware: "PENDING_HARDWARE",
  };
}

async function measure({cp, sourceCommit, driverJarSha256}, out, splitReadReply) {
  const prefix = splitReadReply ? "plc4x-0131-split-" : "plc4x-0131-";
  const save = (suffix, data) => fs.writeFileSync(path.join(out, prefix + suffix), data);
  const server = await startIndependentS7Server({splitReadReply});
  let java;
  try {
    java = await runJava(cp, server.port, sourceCommit, path.join(project, "Plc4xHistoricalRead.java"));
  } finally {
    await server.stop();
  }
  const {stdout, stderr, ...processResult} = java;
  const capture = {
    version, sourceCommit, splitReadReply,
    driver,
    driverJarSha256, fixtureSourceSha256: digest(fs.readFileSync(fixture)),
    java: {...processResult, stdoutSha256: digest(stdout), stderrSha256: digest(stderr)},
    sessions: server.sessions,
  };
  const bytes = Buffer.from(JSON.stringify(capture, null, 2) + "\n");
  save("java-stdout.json", stdout);
  save("java-stderr.log", stderr);
  save("capture.json", bytes);
  const verdict = {...verifyHistoricalCapture(capture, stdout, stderr), captureSha256: digest(bytes)};
  save("assessment.json", JSON.stringify(verdict, null, 2) + "\n");
  console.log("PLC4X_HISTORICAL_CLOSE=" + JSON.stringify(verdict));
}

async function main() {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {cwd: root, encoding: "utf8"}).trim();
  const expected = process.env.S7_LAB_EXPECTED_SHA ?? process.env.GITHUB_SHA;
  if (expected) assert.equal(sourceCommit, expected);
  const javacVersion = execFileSync("javac", ["-version"], {encoding: "utf8"}).trim();
  assert.match(javacVersion, /^javac 21(?:\.|$)/);
  const cp = fs.readFileSync(path.join(project, "target/classpath.txt"), "utf8").trim();
  const jars = cp.split(path.delimiter).filter(jar => path.basename(jar).startsWith("plc4j-driver-s7-"));
  assert.equal(jars.length, 1);
  assert.equal(path.basename(jars[0]), driverName);
  const driverJarSha256 = digest(fs.readFileSync(jars[0]));
  assert.equal(driverJarSha256, driverPin);

  const out = path.join(root, "test-reports");
  fs.mkdirSync(out, {recursive: true});
  for (const name of fs.readdirSync(out)) {
    if (/^plc4x-0131-(?:split-)?(?:assessment|capture|java-stdout)\.json$|^plc4x-0131-(?:split-)?java-stderr\.log$/.test(name)) {
      fs.rmSync(path.join(out, name));
    }
  }
  const candidate = {cp, sourceCommit, driverJarSha256};
  await measure(candidate, out, false);
  await measure(candidate, out, true);
}

if (require.main === module) {
  main().catch(error => {
    console.error("PLC4X_HISTORICAL_CLOSE_FAILED", error);
    process.exitCode = 1;
  });
}

module.exports = {verifyHistoricalCapture};
