# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent read-only DB1 witness using a separate real S7Comm client.

The endpoint is unconditionally loopback; this tool cannot contact a PLC.
"""
import argparse
import hashlib
import json

from snap7.client import Client


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--port", required=True, type=int)
    args = p.parse_args()
    if not 1024 <= args.port <= 65535:
        p.error("Only an unprivileged ephemeral local fixture port is permitted")

    client = Client()
    connected = False
    try:
        client.connect("127.0.0.1", 0, 1, args.port)
        connected = True
        # One external S7 READ_VAR of the complete five-byte range.
        # Offsets 1802/1804 must stay unchanged even when all three
        # intended odd/even-byte WRITE_VAR items were applied.
        raw = bytes(client.db_read(1, 1801, 5))
        if len(raw) != 5:
            raise AssertionError("External witness could not read exact 5-byte DB1 span")
        untouched = [raw[1], raw[3]]
        if untouched != [1802 & 255, 1804 & 255]:
            raise AssertionError("Collateral writes changed DB1 offsets 1802/1804")
        print(json.dumps({
            "status": "passed",
            "source": "python-snap7==3.3.1 external S7Comm client",
            "host": "127.0.0.1",
            "db": 1,
            "start": 1801,
            "length": len(raw),
            "values": [raw[0], raw[2], raw[4]],
            "untouched": untouched,
            "spanSha256": hashlib.sha256(raw).hexdigest(),
            "spanHex": raw.hex(),
        }, sort_keys=True))
    finally:
        if connected:
            client.disconnect()


if __name__ == "__main__":
    main()
