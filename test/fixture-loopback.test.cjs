"use strict";
// Harness proof only: real TCP/COTP/S7Comm and a disposable Python Snap7 DB1.
const assert = require("node:assert/strict");
const test = require("node:test");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const fs = require("node:fs");
const { createWirePeer } = require("../lib/wire-peer.cjs");

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, "..");
const python = process.env.S7_FIXTURE_PYTHON || "python";
function bounded(promise, ms, description) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("HARNESS_TIMEOUT " + description)), ms);
  })]).finally(() => clearTimeout(timer));
}
async function startFixture() {
  const child = spawn(python, ["-u", "fixtures/s7_server.py"], {
    cwd: root,
    env: { ...process.env, S7_FIXTURE_PORT: "0", S7_FIXTURE_DB_BYTES: "2048", PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (data) => { stderr = (stderr + data.toString()).slice(-2500); });
  try {
    const port = await bounded(new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => reject(new Error("Fixture exited before ready: " + code + "/" + signal + " " + stderr)));
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
        const match = /^S7_WIRE_FIXTURE_READY (\d+) 3\.3\.1$/m.exec(stdout);
        if (match) resolve(Number(match[1]));
      });
    }), 12000, "starting disposable Snap7 server");
    assert.ok(port > 1023 && port < 65536);
    return { port, async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exiting = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      try { await bounded(exiting, 5000, "stopping fixture"); }
      catch (error) { child.kill("SIGKILL"); throw error; }
    }};
  } catch (error) { child.kill("SIGKILL"); throw error; }
}

test("installed Python S7 client reads and writes ONLY disposable loopback DB1 through observing relay", { timeout: 30000 }, async (t) => {
  const fixture = await startFixture();
  let peer;
  t.after(async () => {
    if (peer) await peer.close();
    await fixture.stop();
  });
  peer = await createWirePeer(fixture.port);
  const { stdout, stderr } = await execFileAsync(python, ["scripts/s7_probe.py", "--port", String(peer.port)], {
    cwd: root, timeout: 12000, maxBuffer: 128 * 1024,
  });
  const probe = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(probe.status, "passed", stderr);
  assert.deepEqual({ real: probe.firstReal, int: probe.counter, before: probe.before, after: probe.after },
    { real: 12.5, int: -123, before: 3.25, after: 19.75 });
  assert.ok(peer.cotpRequests >= 1, "Real COTP connection request must traverse the relay");
  assert.ok(peer.reads.length >= 2, "Two real READ_VAR requests must be observed");
  assert.equal(peer.writes.length, 1, "One explicit synthetic write must cause exactly one wire WRITE_VAR");
  assert.equal(peer.droppedWrites.length, 0, "Baseline must not silently inject a write ACK failure");
  assert.deepEqual(peer.errors, [], "The observer must have no socket/parser errors");
  const transcript = peer.getWireEvidence();
  assert.ok(transcript.eventCount >= 8, "Real TPKT frames must have byte-level hashes");
  assert.match(transcript.chainSha256, /^[0-9a-f]{64}$/);
  assert.ok(transcript.events.some(x => x.direction === "fixture_tx"));
  assert.ok(transcript.events.some(x => x.direction === "fixture_rx"));
  const report = { schemaVersion: 1, status: "passed", category: "harness_positive_control",
    hardware: "NOT_TESTED", fixture: "python-snap7==3.3.1",
    wireEvidence: transcript,
    measured: { cotpRequests: peer.cotpRequests, readRequests: peer.reads.length,
      writeRequests: peer.writes.length, probe } };
  fs.mkdirSync(path.join(root, "test-reports"), { recursive: true });
  fs.writeFileSync(path.join(root, "test-reports/harness-wire-baseline.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("S7_HARNESS_LOOPBACK_PROOF=" + JSON.stringify(report.measured));
});
