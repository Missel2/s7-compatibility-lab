# SPDX-License-Identifier: GPL-3.0-or-later
"""Real released python-snap7 3.3.1 client, *not* the fixture server.

Read-only: destination is hard-coded to IPv4 loopback and DB1, no target
hostname/IP, write method, arbitrary byte offset, or remote PLC configuration.
"""
import argparse
import hashlib
import json
import os
import re
import struct
from importlib.metadata import version

from snap7.client import Client

ORACLE = "healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1"
FIXTURE = "snap7-3.3.1-DB1-2048"
EXPECTED_HEX = "41480000ff85060740500000"


def main():
    parser = argparse.ArgumentParser(description="Read-only synthetic S7Comm DB1 loopback client")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if args.port < 1024 or args.port > 65535:
        parser.error("Only an ephemeral, unprivileged local S7 fixture port is allowed")

    commit = os.environ.get("S7_LAB_SOURCE_SHA", "")
    if not re.fullmatch("[0-9a-f]{40}", commit):
        raise AssertionError("The checked-out source SHA must be pinned")
    installed = version("python-snap7")
    if installed != "3.3.1":
        raise AssertionError("Unexpected actual installed python-snap7 distribution")

    client = Client()
    connected = False
    try:
        client.connect("127.0.0.1", 0, 1, args.port)
        connected = True
        payload = bytes(client.db_read(1, 0, 12))
        if payload.hex() != EXPECTED_HEX:
            raise AssertionError("Real candidate returned wrong synthetic DB1 bytes")
        readings = {
            "temperature": struct.unpack_from(">f", payload, 0)[0],
            "counter": struct.unpack_from(">h", payload, 4)[0],
            "writable": struct.unpack_from(">f", payload, 8)[0],
        }
        if readings != {"temperature": 12.5, "counter": -123, "writable": 3.25}:
            raise AssertionError("Decoded S7Comm fields disagree with independent byte oracle")
    finally:
        if connected:
            client.disconnect()

    # Original candidate's direct stdout, not the assessor's invented response.
    print(json.dumps({
        "schemaVersion": 1,
        "sourceCommit": commit,
        "candidate": "python-snap7-client",
        "version": installed,
        "scope": "SOFTWARE_LOOPBACK_ONLY",
        "oracleId": ORACLE,
        "fixture": FIXTURE,
        "protocol": "S7COMM_CLASSIC",
        "status": "passed",
        "host": "127.0.0.1",
        "db": 1,
        "start": 0,
        "readLength": len(payload),
        "rawHex": payload.hex(),
        "rawSha256": hashlib.sha256(payload).hexdigest(),
        "observed": readings,
        "clientDisconnectInvoked": True,
        "candidateQualified": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
