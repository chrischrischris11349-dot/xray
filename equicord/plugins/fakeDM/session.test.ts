/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SessionRecords } from "./session";

test("FakeDM records stay in memory and can be cleared", () => {
    const records = new SessionRecords<{ channelId: string; id: string; }>();
    records.replace([{ channelId: "one", id: "fake-1" }]);
    const copy = records.all();
    copy.push({ channelId: "two", id: "fake-2" });
    assert.deepEqual(records.all(), [{ channelId: "one", id: "fake-1" }]);
    records.clear();
    assert.deepEqual(records.all(), []);
    assert.deepEqual(new SessionRecords().all(), []);
});
