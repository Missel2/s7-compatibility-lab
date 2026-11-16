// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const sha256 = /^[a-f0-9]{64}$/;
const contractId = /^S7-(?:ERR|RISK)-[0-9]{3}$/;
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(name + ' must be an object');
}
function verifyQualification(registry, result, requiredIds) {
  assertObject(registry, 'registry');
  assertObject(result, 'result');
  if (registry.schema_version !== 1 || registry.qualification_policy !== 'FAIL_CLOSED') throw new Error('Unsupported registry policy');
  if (result.schema_version !== 1) throw new Error('Unsupported result schema');
  if (result.scope !== 'SOFTWARE_LOOPBACK_ONLY') throw new Error('Only software loopback evidence is accepted');
  if (!Array.isArray(requiredIds) || requiredIds.length === 0) throw new Error('Explicit nonempty required contract list needed');
  if (!Array.isArray(result.contracts)) throw new Error('Result contracts must be an array');
  assertObject(result.candidate, 'candidate');
  assertObject(result.fixture, 'fixture');
  if (!nonempty(result.candidate.package) || !nonempty(result.candidate.version) ||
      !sha256.test(result.candidate.artifact_sha256)) throw new Error('Exact candidate identity and digest required');
  if (result.fixture.loopback !== true || !nonempty(result.fixture.revision) ||
      !sha256.test(result.fixture.observer_sha256)) throw new Error('Independent loopback fixture identity required');

  const known = new Map(registry.contracts.map(c => [c.id, c]));
  const required = new Set();
  for (const id of requiredIds) {
    if (typeof id !== 'string' || !contractId.test(id) || !known.has(id)) throw new Error('Unknown required contract: ' + id);
    if (required.has(id)) throw new Error('Duplicate required contract: ' + id);
    if (known.get(id).kind !== 'REPORTED_REGRESSION') throw new Error('Contract is not yet executable/qualified in registry: ' + id);
    required.add(id);
  }
  const reported = new Set();
  for (const item of result.contracts) {
    assertObject(item, 'contract result');
    if (typeof item.id !== 'string' || !known.has(item.id)) throw new Error('Unknown reported contract');
    if (reported.has(item.id)) throw new Error('Duplicate reported contract: ' + item.id);
    reported.add(item.id);
    if (!required.has(item.id)) throw new Error('Unrequested contract: ' + item.id);
    if (item.outcome !== 'PASS') throw new Error('Contract not PASS: ' + item.id);
    assertObject(item.evidence, 'evidence for ' + item.id);
    if (!sha256.test(item.evidence.capture_sha256) ||
        !Number.isSafeInteger(item.evidence.observed_requests) || item.evidence.observed_requests < 1 ||
        !Number.isSafeInteger(item.evidence.assertions) || item.evidence.assertions < 1 ||
        item.evidence.independent_observer !== true) {
      throw new Error('Missing independently observed wire evidence: ' + item.id);
    }
  }
  for (const id of required) if (!reported.has(id)) throw new Error('Missing required contract result: ' + id);
  return Object.freeze({classification:'SCOPED_CONTRACTS_PASS', qualified_scope:[...required].sort(), full_candidate_qualification:false});
}
function main(argv) {
  if (argv.length !== 2) throw new Error('Usage: node lib/qualification-gate.cjs <result.json> <comma-separated-required-contract-ids>');
  const [inputFile, ids] = argv;
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'registry.json'), 'utf8'));
  const result = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const summary = verifyQualification(registry, result, ids.split(','));
  process.stdout.write(JSON.stringify(summary) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (err) { process.stderr.write('QUALIFICATION_GATE_RED: ' + err.message + '\n'); process.exitCode = 1; }
}
module.exports = {verifyQualification};
