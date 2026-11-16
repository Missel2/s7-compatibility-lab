// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'registry.json'), 'utf8'));
const allowed = new Set(['HISTORICAL_ONLY', 'PR_OPEN_UNQUALIFIED', 'PENDING_IMPLEMENTATION', 'PENDING_HARDWARE']);
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
  assert.deepEqual(new Set(registry.contracts.filter(c => c.kind === 'REPORTED_REGRESSION').map(c => c.id)), historical);
  for (const c of registry.contracts.filter(c => historical.has(c.id))) {
    assert.match(c.source_issue, /^https:\/\/github\.com\//);
    assert.match(c.historical_evidence, /^https:\/\/github\.com\//);
    assert.ok(c.version, c.id);
    assert.ok(['JS', 'RUST'].includes(c.engine), c.id);
    assert.ok(['HISTORICAL_ONLY','PR_OPEN_UNQUALIFIED'].includes(c.status), c.id);
    assert.equal(Boolean(c.lab_evidence), c.status === 'PR_OPEN_UNQUALIFIED', c.id);
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
