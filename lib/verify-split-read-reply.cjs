// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab S7 Compatibility Lab. Verify the measured writes against the full response.
"use strict";

const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");

function verifyReadReplyDelivery(packet, writes, split) {
  assert.equal(typeof split, "boolean");
  if (!split) {
    assert.deepEqual(writes, []);
    return [];
  }
  assert.equal(writes.length, 3);
  const offsets = [0, 2, 26, packet.length];
  const lengths = [];
  for (const [index, write] of writes.entries()) {
    const expected = packet.subarray(offsets[index], offsets[index + 1]);
    assert.ok(expected.length > 0);
    assert.equal(write.offset, offsets[index]);
    assert.equal(write.hex, expected.toString("hex"));
    assert.equal(write.sha256, createHash("sha256").update(expected).digest("hex"));
    assert.ok(Number.isSafeInteger(write.elapsedUs) && write.elapsedUs >= 0);
    if (index > 0) {
      assert.ok(write.elapsedUs - writes[index - 1].elapsedUs >= 20_000,
        "Split response writes must have a measured delay");
    }
    lengths.push(expected.length);
  }
  return lengths;
}

module.exports = {verifyReadReplyDelivery};
