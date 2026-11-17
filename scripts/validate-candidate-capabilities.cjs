// SPDX-License-Identifier: GPL-3.0-or-later
"use strict";
// Declarations are not test execution and MUST NOT imply release qualification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const STATES = new Set(["OBSERVED_SCOPED", "NOT_TESTED", "PENDING_HARDWARE"]);
const MODES = new Set(["SEPARATE_CPYTHON_CLIENT_PROCESS", "SEPARATE_JVM_CLIENT_PROCESS", "SOURCE_PACKED_NODE_RED_PROCESS", "PUBLISHED_NODE_RED_PROCESS"]);
const SHA256 = /^python-snap7==3\.3\.1 --hash=sha256:[a-f0-9]{64}\s*$/;
function validateCapabilities(manifest, catalog, pythonRequirements) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.scope, "SOFTWARE_LOOPBACK_ONLY");
  assert.equal(manifest.policy, "DECLARED_CAPABILITY_NOT_TEST_OUTCOME");
  assert.ok(Array.isArray(manifest.candidates));
  assert.equal(manifest.candidates.length, catalog.candidates.length,
    "Every candidate needs an explicit declaration, including Python and historic Alpha2");
  const seen = new Set();
  let observed = 0, untested = 0, hardware = 0;
  const rows = [];
  const catalogMap = new Map(catalog.candidates.map(x => [x.id, x]));
  const scenarios = new Map(catalog.scenarios.map(x => [x.id, x]));
  const found = new Map(catalog.observations.map(x => [x.candidate + ":" + x.scenario, x]));
  for (const c of manifest.candidates) {
    assert.ok(catalogMap.has(c.id) && !seen.has(c.id), "Unknown/duplicate candidate declaration: " + c.id);
    seen.add(c.id);
    const exact = catalogMap.get(c.id);
    for (const [a,b] of [["package","package"],["version","version"],["transport","transport"],
      ["runtime","host"],["platform","platform"]]) {
      assert.equal(c[a], exact[b], "Candidate manifest drifts from actual pinned evidence: " + c.id + "." + a);
    }
    assert.deepEqual(c.protocols, exact.protocols);
    assert.ok(MODES.has(c.execution), "No unknown candidate runtime");
    assert.equal(c.protocolCapabilities?.S7COMM_CLASSIC, "SCOPED_SOFTWARE_OBSERVATION");
    assert.equal(c.protocolCapabilities?.S7COMMPLUS, "NOT_TESTED_SEPARATE_PROTOCOL");
    assert.equal(Object.keys(c.protocolCapabilities).length, 2);
    assert.ok(typeof c.sourceProof === "string" && !c.sourceProof.includes(".."));
    if (c.id === "python-snap7-3_3_1") {
      assert.equal(c.execution, "SEPARATE_CPYTHON_CLIENT_PROCESS");
      assert.equal(c.releaseSource, "PYPI_WHEEL_SHA256_REQUIRE_HASHES");
      assert.equal(c.sourceProof, "requirements/python-snap7.txt");
      assert.match(pythonRequirements, SHA256, "Python candidate must remain pinned by exact wheel digest");
    } else if (c.id === "apache-plc4x-java-1_0_0") {
      assert.equal(c.execution, "SEPARATE_JVM_CLIENT_PROCESS");
      assert.equal(c.releaseSource, "MAVEN_CENTRAL_JAR_SHA256_PINNED");
      assert.equal(c.sourceProof, "java/plc4x-readonly-client/plc4j-driver-s7-1.0.0.sha256");
      const sha = fs.readFileSync(path.join(root,c.sourceProof),"utf8");
      assert.match(sha,/^907aa658a3040c86ff2fe7b94625d1537084ed3822dc4e9cd7f78dedc5ebe7d7  plc4j-driver-s7-1\.0\.0\.jar\s*$/,
        "Real Apache 1.0.0 Maven driver must stay pinned to known reviewed SHA256");
      assert.equal(exact.status,"KNOWN_UNSAFE","PLC4X 1.0.0 is not a release-safe candidate");
    } else {
      assert.ok(c.execution !== "SEPARATE_CPYTHON_CLIENT_PROCESS" && c.execution !== "SEPARATE_JVM_CLIENT_PROCESS",
        "Cannot impersonate external Python/Java candidate");
      assert.ok(["SOURCE_PACK_SHA256_AND_PUBLISHED_NPM_SRI", "NPM_REGISTRY_SRI_RECORDED_IN_CI"].includes(c.releaseSource));
    }
    assert.ok(c.scenarios && typeof c.scenarios === "object" && !Array.isArray(c.scenarios));
    assert.equal(Object.keys(c.scenarios).length, scenarios.size, "Every scenario must be declared");
    for (const scenario of scenarios.values()) {
      const d = c.scenarios[scenario.id], e = found.get(c.id + ":" + scenario.id);
      assert.ok(d && typeof d === "object" && !Array.isArray(d),
        "Missing explicit case status " + c.id + ":" + scenario.id);
      assert.deepEqual(Object.keys(d).sort(), ["reason", "state"]);
      assert.ok(STATES.has(d.state), "Forbidden invented capability verdict: " + c.id + ":" + scenario.id);
      assert.ok(typeof d.reason === "string" && d.reason.length > 18, "Missing reason for incomplete coverage");
      assert.ok(!/\b(QUALIFIED|CERTIFIED|UNIVERSAL PASS|SAFE DRIVER)\b/i.test(d.reason),
        "A declaration is not an endorsement");
      const expected = e ? "OBSERVED_SCOPED" :
        scenario.protocol === "HARDWARE" ? "PENDING_HARDWARE" : "NOT_TESTED";
      assert.equal(d.state, expected, "Manifest cannot claim evidence that is absent from the catalog: " + c.id + ":" + scenario.id);
      if (e) {
        assert.ok(d.reason.includes(e.outcome) && d.reason.includes(e.phase),
          "Observed state must retain the actual risk outcome and review phase");
        observed++;
      } else if (expected === "NOT_TESTED") {
        assert.ok(!d.reason.includes("SCOPED_PASS"), "Cannot invent PASS under NOT_TESTED");
        untested++;
      } else hardware++;
      rows.push({candidate:c.id,scenario:scenario.id,state:d.state,
        outcome:e?.outcome || null,phase:e?.phase || null,source:e?.evidence?.run || null,
        qualification:false});
    }
    assert.equal(Object.keys(c.scenarios).filter(x=>!scenarios.has(x)).length, 0,
      "Additional unregistered scenario declaration");
  }
  assert.equal(seen.size, catalog.candidates.length);
  const counts = {observed,untested,pendingHardware:hardware,total:rows.length};
  assert.equal(counts.total, catalog.candidates.length * catalog.scenarios.length);
  assert.equal(counts.observed, catalog.observations.length);
  return {schemaVersion:1,scope:manifest.scope,source:"DECLARED_CAPABILITY_MATRIX_TIED_TO_CURATED_EVIDENCE",
    fullCandidateQualification:false,globalRanking:null,candidateCount:seen.size,counts,rows};
}
function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "comparisons/candidate-capabilities.v1.json"), "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "comparisons/catalog.v1.json"), "utf8"));
  const wheel = fs.readFileSync(path.join(root, "requirements/python-snap7.txt"), "utf8");
  const matrix = validateCapabilities(manifest, catalog, wheel);
  const dir = path.join(root,"test-reports");fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,"candidate-capability-matrix.v1.json"), JSON.stringify(matrix,null,2)+"\n");
  console.log("S7_CLIENT_CAPABILITY_MATRIX="+JSON.stringify(matrix.counts));
}
if (require.main === module) {
  try {main();} catch(e) {console.error("S7_CLIENT_CAPABILITY_MATRIX_RED "+String(e.stack || e)); process.exitCode=1;}
}
module.exports = {validateCapabilities};
