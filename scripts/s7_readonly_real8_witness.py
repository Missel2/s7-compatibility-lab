# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent READ-ONLY DB1 witness for a disposable loopback S7Comm fixture.

No caller-supplied IP/host, only an ephemeral unprivileged local port. This
script never writes PLC memory and must never be used against real hardware.
"""
import argparse
import hashlib
import json
import struct
from importlib.metadata import version

from snap7.client import Client


def main():
    parser = argparse.ArgumentParser(description="Synthetic localhost DB1 READ only")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--expected-real", type=float, required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Only ephemeral unprivileged 127.0.0.1 ports allowed")
    if args.expected_real not in (3.25, 19.75, -8.5):
        parser.error("Only three predeclared synthetic test values allowed")
    if version("python-snap7") != "3.3.1":
        raise AssertionError("Unexpected synthetic witness package version")

    client = Client()
    try:
        # Hardcode ALL physical selectors: no remote network/PLC path.
        client.connect("127.0.0.1", 0, 1, args.port)
        raw = bytes(client.db_read(1, 0, 12))
        if len(raw) != 12:
            raise AssertionError("Short synthetic DB1 snapshot")
        first_real = struct.unpack_from(">f", raw, 0)[0]
        counter = struct.unpack_from(">h", raw, 4)[0]
        observed = struct.unpack_from(">f", raw, 8)[0]
        if (first_real, counter) != (12.5, -123):
            raise AssertionError("Unrelated synthetic DB1 sentinels changed")
        if observed != args.expected_real:
            raise AssertionError(f"Unexpected real DB1: {observed!r}")
        print(json.dumps({
            "schemaVersion": 1,
            "scope": "SOFTWARE_LOOPBACK_ONLY",
            "reader": "python-snap7@3.3.1",
            "readonly": True,
            "db": 1,
            "address": 8,
            "expected": args.expected_real,
            "observed": observed,
            "byteCount": len(raw),
            "rawDb1Sha256": hashlib.sha256(raw).hexdigest(),
            "rawReal8Hex": raw[8:12].hex(),
            "unchanged": {"REAL0": first_real, "INT4": counter}
        }, sort_keys=True), flush=True)
    finally:
        client.disconnect()


if __name__ == "__main__":
    main()
