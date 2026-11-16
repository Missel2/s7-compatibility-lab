"use strict";
// Internal instrument validation only: these handcrafted frames are NOT a
// Siemens CPU/emulator compatibility proof. No real PLC or nonloopback I/O.
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { once } = require("node:events");
const { setTimeout: sleep } = require("node:timers/promises");
const { createWirePeer } = require("../lib/wire-peer.cjs");

const HOST = "127.0.0.1";
const REF = 0x1234;

function packet(bytes) {
  const frame = Buffer.from(bytes);
  frame.writeUInt16BE(frame.length, 2);
  return frame;
}
const cotpRequest = packet([3, 0, 0, 0, 6, 0xe0, 0, 0, 0, 0, 0]);
const writeRequest = packet([
  3, 0, 0, 0, 2, 0xf0, 0x80, 0x32, 1,
  0, 0, 0x12, 0x34, 0, 1, 0, 0, 5,
]);
const writeAck = packet([
  3, 0, 0, 0, 2, 0xf0, 0x80, 0x32, 3,
  0, 0, 0x12, 0x34, 0, 1, 0, 1, 0, 0, 5, 0xff,
]);
const readRequest = packet([
  3, 0, 0, 0, 2, 0xf0, 0x80, 0x32, 1,
  0, 0, 0x12, 0x34, 0, 2, 0, 0, 4, 3,
]);
const readAck = packet([
  3, 0, 0, 0, 2, 0xf0, 0x80, 0x32, 3,
  0, 0, 0x12, 0x34, 0, 2, 0, 4, 0, 0,
  4, 3, 0xff, 4, 0, 8,
]);

async function boundUntil(predicate, label, ms = 1500) {
  for (let i = 0; i < ms / 10; i++) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("Observer self-test timed out: " + label);
}
async function setup(t, respond) {
  const sockets = new Set();
  const received = [];
  const upstream = net.createServer(socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", bytes => {
      received.push(Buffer.from(bytes));
      const response = respond?.(bytes);
      if (response) socket.write(response);
    });
  });
  upstream.listen(0, HOST);
  await once(upstream, "listening");
  const relay = await createWirePeer(upstream.address().port);
  const client = net.createConnection(relay.port, HOST);
  client.on("error", () => {});
  await once(client, "connect");
  t.after(async () => {
    client.destroy();
    await relay.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => upstream.close(err => err ? reject(err) : resolve()));
  });
  return { relay, client, received };
}

test("observer preserves a fragmented TPKT frame and sees one actual COTP request", { timeout: 5000 }, async t => {
  const ctx = await setup(t, frame => frame);
  let echoed = Buffer.alloc(0);
  ctx.client.on("data", part => { echoed = Buffer.concat([echoed, part]); });
  ctx.client.write(cotpRequest.subarray(0, 3));
  ctx.client.write(cotpRequest.subarray(3, 7));
  ctx.client.write(cotpRequest.subarray(7));
  await boundUntil(() => echoed.length === cotpRequest.length, "unaltered COTP response");
  assert.deepEqual(echoed, cotpRequest);
  assert.deepEqual(Buffer.concat(ctx.received), cotpRequest);
  assert.equal(ctx.relay.cotpRequests, 1);
  assert.equal(ctx.relay.blackholedRequests, 0);
  assert.deepEqual(ctx.relay.errors, []);
});

test("lost-write-ACK injection proves the reply was dropped AFTER a positive ACK", { timeout: 5000 }, async t => {
  const ctx = await setup(t, bytes => bytes[17] === 5 ? writeAck : null);
  let delivered = 0;
  ctx.client.on("data", chunk => { delivered += chunk.length; });
  ctx.relay.dropWriteAck = true;
  ctx.client.write(writeRequest);
  await boundUntil(() => ctx.relay.droppedWrites.length === 1, "one real upstream ACK dropped");
  assert.equal(ctx.relay.writes.length, 1);
  assert.equal(ctx.relay.droppedWrites[0].fixtureAcknowledged, true);
  assert.equal(ctx.relay.droppedWrites[0].reference, REF);
  assert.equal(ctx.relay.dropWriteAck, false, "fault is single-use");
  await sleep(50);
  assert.equal(delivered, 0, "positive ACK must never reach the client");
  assert.deepEqual(ctx.relay.errors, []);
});

test("mismatched-PDU-ref mutation is delivered, logged, and armed only once", { timeout: 5000 }, async t => {
  const ctx = await setup(t, bytes => bytes[17] === 4 ? readAck : null);
  let received = Buffer.alloc(0);
  ctx.client.on("data", part => { received = Buffer.concat([received, part]); });
  ctx.relay.readReplyMutation = "wrong_pdu_reference";
  ctx.client.write(readRequest);
  await boundUntil(() => received.length === readAck.length, "mutated read ACK delivered");
  assert.equal(ctx.relay.reads.length, 1);
  assert.equal(ctx.relay.mutatedReadReplies.length, 1);
  const observed = ctx.relay.mutatedReadReplies[0];
  assert.equal(observed.originalPduRef, REF);
  assert.equal(observed.deliveredPduRef, REF + 1);
  assert.equal(received.readUInt16BE(11), REF + 1);
  assert.equal(ctx.relay.readReplyMutation, null, "one-shot mutation discharged");
  assert.deepEqual(ctx.relay.errors, []);
});

test("truncated-S7-reply injection cannot crash the wire observer", { timeout: 5000 }, async t => {
  const ctx = await setup(t, bytes => bytes[17] === 4 ? readAck : null);
  let received = Buffer.alloc(0);
  ctx.client.on("data", part => { received = Buffer.concat([received, part]); });
  ctx.relay.readReplyMutation = "short_s7_reply";
  ctx.client.write(readRequest);
  await boundUntil(() => received.length >= 12 || ctx.relay.errors.length, "truncated reply");
  assert.equal(ctx.relay.mutatedReadReplies.length, 1, "real mutation observed");
  assert.equal(received.length, 12);
  assert.equal(ctx.relay.mutatedReadReplies[0].deliveredPduRef, null);
  assert.deepEqual(ctx.relay.errors, []);
});

test("TCP FIN after a complete COTP request still drains the upstream response", { timeout: 5000 }, async t => {
  const ctx = await setup(t, frame => frame);
  let echoed = Buffer.alloc(0);
  ctx.client.on("data", chunk => { echoed = Buffer.concat([echoed, chunk]); });
  ctx.client.end(cotpRequest);
  await boundUntil(() => echoed.length === cotpRequest.length, "reply after client FIN");
  assert.deepEqual(echoed, cotpRequest);
  await boundUntil(() => ctx.relay.active.size === 0, "FIN closes relay session");
  assert.equal(ctx.relay.cotpRequests, 1);
  assert.deepEqual(ctx.relay.errors, []);
});
