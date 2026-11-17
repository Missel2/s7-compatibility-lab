// SPDX-License-Identifier: GPL-3.0-or-later
// Rischlab-owned S7 laboratory client. Published Apache PLC4X library is not vendored.
package org.rischlab.s7lab;

import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.apache.plc4x.java.api.PlcConnection;
import org.apache.plc4x.java.api.PlcDriverManager;
import org.apache.plc4x.java.api.messages.PlcReadRequest;
import org.apache.plc4x.java.api.messages.PlcReadResponse;
import org.apache.plc4x.java.api.types.PlcResponseCode;

public final class Plc4xReadonlyS7Candidate {
    private static final String HOST = "127.0.0.1";
    private static final String CANDIDATE = "apache-plc4x-java";
    private static final String VERSION = "1.0.0";
    private static final String ORACLE = "healthy-DB1-REAL0-INT4-REAL8-and-kernel-TCP-close-v1";
    private static final Pattern SHA = Pattern.compile("[0-9a-f]{40}");

    private Plc4xReadonlyS7Candidate() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !"--port".equals(args[0])) {
            throw new IllegalArgumentException("Only --port for the local synthetic fixture is permitted");
        }
        final int port = Integer.parseInt(args[1]);
        if (port < 1024 || port > 65535) {
            throw new IllegalArgumentException("Only an unprivileged ephemeral loopback port is allowed");
        }
        final String head = System.getenv("S7_LAB_SOURCE_SHA");
        if (head == null || !SHA.matcher(head).matches()) {
            throw new IllegalStateException("Missing exact checked-out source SHA");
        }
        // Explicit local-only endpoint. No user-supplied hostname, rack or DB.
        // The controller-type disables network hardware-detection SZL probes.
        final String url = "s7://" + HOST + ":" + port
            + "?controller-type=S7_1200&cotp.remote-rack=0&cotp.remote-slot=1"
            + "&cotp.connect-timeout-ms=5000&cotp.handshake-timeout-ms=5000"
            + "&read-timeout-ms=5000";
        float temperature;
        float writable;
        int counter;
        boolean closeCalled = false;
        try (PlcConnection connection = PlcDriverManager.getDefault()
                .getConnectionFactory().getConnection(url)) {
            if (!connection.getMetadata().isReadSupported()) {
                throw new IllegalStateException("Published PLC4X S7 driver does not advertise reading");
            }
            final PlcReadRequest request = connection.readRequestBuilder()
                .addTagAddress("temperature", "%DB1.DBD0:REAL")
                .addTagAddress("counter", "%DB1.DBW4:INT")
                .addTagAddress("writable", "%DB1.DBD8:REAL")
                .build();
            final PlcReadResponse response = request.execute().get(6500, TimeUnit.MILLISECONDS);
            for (String tag : new String[] {"temperature", "counter", "writable"}) {
                if (response.getResponseCode(tag) != PlcResponseCode.OK) {
                    throw new IllegalStateException("Failed to read synthetic DB1 " + tag + ": "
                        + response.getResponseCode(tag));
                }
            }
            temperature = response.getFloat("temperature");
            counter = response.getInteger("counter");
            writable = response.getFloat("writable");
            if (temperature != 12.5f || counter != -123 || writable != 3.25f) {
                throw new AssertionError("Expected synthetic DB1 REAL0/INT4/REAL8 mismatched");
            }
        }
        closeCalled = true;
        // Exactly one line of authentic original candidate JSON on successful client close.
        // Values are finite and expected, no arbitrary remote data enters serialization.
        System.out.printf(Locale.ROOT,
            "{\"schemaVersion\":1,\"sourceCommit\":\"%s\","
            + "\"candidate\":\"%s\",\"version\":\"%s\","
            + "\"scope\":\"SOFTWARE_LOOPBACK_ONLY\",\"protocol\":\"S7COMM_CLASSIC\","
            + "\"oracleId\":\"%s\",\"host\":\"127.0.0.1\",\"db\":1,"
            + "\"status\":\"passed\",\"clientCloseInvoked\":%s,\"candidateQualified\":false,"
            + "\"observed\":{\"temperature\":%.1f,\"counter\":%d,\"writable\":%.2f}}%n",
            head, CANDIDATE, VERSION, ORACLE, closeCalled, temperature, counter, writable);
    }
}
