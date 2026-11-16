// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'registry.json'), 'utf8'));
const allowed = new Set(['HISTORICAL_ONLY', 'MERGED_BASELINE_UNSAFE', 'PENDING_IMPLEMENTATION', 'PENDING_HARDWARE', 'PR_OPEN_UNQUALIFIED']);
const historical = new Set(['S7-ERR-001', 'S7-ERR-002', 'S7-ERR-003', 'S7-ERR-004', 'S7-ERR-005']);

test('registry identifiers are stable, unique, and have explicit states', () => {
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.scope, 'SOFTWARE_LOOPBACK_ONLY');
  assert.equal(registry.qualification_policy, 'FAIL_CLOSED');
  const ids = registry.contracts.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of registry.contracts) {
    assert.match(c.id, /^S7-(ERR|RISK)-[0-9]{3}$/);
    assert.match(c.slug, /^[a-z0-9_]+$/);
    assert.ok(allowed.has(c.status), c.id);
    assert.equal(c.candidate_qualified, false, c.id);
    assert.ok(c.expected_safe_behavior, c.id);
  }
});

test('five historical regressions retain sources, versions and truthful evidence status', () => {
  assert.deepEqual(new Set(registry.contracts.filter(c => c.kind === 'REPORTED_REGRESSION' && historical.has(c.id)).map(c => c.id)), historical);
  for (const c of registry.contracts.filter(c => historical.has(c.id))) {
    assert.match(c.source_issue, /^https:\/\/github\.com\//);
    assert.match(c.historical_evidence, /^https:\/\/github\.com\//);
    assert.ok(c.version, c.id);
    assert.ok(['JS', 'RUST'].includes(c.engine), c.id);
    assert.ok(['HISTORICAL_ONLY','MERGED_BASELINE_UNSAFE','PR_OPEN_UNQUALIFIED'].includes(c.status), c.id);
    assert.equal(Boolean(c.lab_evidence), c.status !== 'HISTORICAL_ONLY', c.id);
  }
});

test('pending families and hardware cannot masquerade as tested qualifications', () => {
  for (const c of registry.contracts.filter(c => c.kind === 'PROPOSED_RISK')) {
    assert.equal(c.status, 'PENDING_IMPLEMENTATION', c.id);
    assert.equal(c.lab_evidence, null, c.id);
    assert.equal(c.historical_evidence, null, c.id);
  }
  assert.equal(registry.hardware_gates.length, 7);
  for (const gate of registry.hardware_gates) {
    assert.match(gate.id, /^HIL-S7-00[1-7]$/);
    assert.equal(gate.status, 'PENDING_HARDWARE');
    assert.equal(gate.candidate_qualified, false);
  }
});

test('published JS malformed AckData finding is separate from original alpha historical evidence', () => {
  const alpha = registry.contracts.find(c => c.id === 'S7-ERR-002');
  const published = registry.contracts.find(c => c.id === 'S7-ERR-006');
  assert.ok(alpha && published);
  assert.equal(alpha.status, 'HISTORICAL_ONLY');
  assert.equal(alpha.version, '0.1.0-alpha.2');
  assert.equal(published.status, 'PR_OPEN_UNQUALIFIED');
  assert.equal(published.kind, 'REPORTED_REGRESSION');
  assert.equal(published.engine, 'JS');
  assert.equal(published.version, '4.4.1');
  assert.equal(published.transport_dependency, '@oriolrius/nodes7@1.1.5');
  assert.equal(published.historical_evidence, null);
  assert.match(published.lab_evidence, /s7-compatibility-lab\/actions\/runs\/43953604005$/);
  assert.equal(published.candidate_qualified, false);
});

test('real historical alpha2 wire regression is distinct from modern published JS healthy write', () => {
  const historic=registry.contracts.find(c=>c.id==='S7-ERR-001');
  assert.equal(historic.version,'0.1.0-alpha.2');
  assert.equal(historic.status,'PR_OPEN_UNQUALIFIED');
  assert.match(historic.lab_evidence,/\/s7-compatibility-lab\/actions\/runs\/43959037772$/);
  assert.match(historic.notes,/iso-on-tcp 0\.1\.1/);
  assert.match(historic.notes,/\[15,11,13\]/);
  assert.equal(historic.candidate_qualified,false);
  const modern=registry.contracts.find(c=>c.id==='S7-ERR-006');
  assert.equal(modern.version,'4.4.1');
  assert.notEqual(modern.package,historic.package);
});
