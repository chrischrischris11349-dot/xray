/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** FakeDM records live only in this renderer process; no storage adapter exists. */
export class SessionRecords<T> {
    private records: T[] = [];

    all(): T[] {
        return [...this.records];
    }

    replace(records: T[]): void {
        this.records = [...records];
    }

    clear(): void {
        this.records = [];
    }
}
