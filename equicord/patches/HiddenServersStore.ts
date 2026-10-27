/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Guild } from "@vencord/discord-types";
import { proxyLazyWebpack } from "@webpack";
import { Flux, FluxDispatcher, GuildStore, SortedGuildStore } from "@webpack/common";

export const HiddenServersStore = proxyLazyWebpack(() => {
    const { Store } = Flux;

    const DB_KEY = "HideServers_servers";
    class HiddenServersStore extends Store {
        public _hiddenGuilds: Set<string> = new Set();
        private hideSheet?: CSSStyleSheet;

        // Keep hiding effective when Discord changes the guild-tree source patch.
        // CSS follows newly mounted rows without polling or changing navigation.
        private applyDom() {
            if (typeof document === "undefined" || typeof CSSStyleSheet === "undefined") return;
            if (!this.hideSheet) {
                this.hideSheet = new CSSStyleSheet();
                document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.hideSheet];
            }
            const selectors = [...this._hiddenGuilds].filter(id => /^\d{14,20}$/.test(id)).flatMap(id => [
                `nav[class*="guilds_"] [class*="listItem_"]:has([data-list-item-id="guildsnav___${id}"])`,
                `nav[class*="guilds_"] [data-list-item-id="guildsnav___${id}"]`
            ]);
            this.hideSheet.replaceSync(selectors.length ? `${selectors.join(",")} { display:none!important; }` : "");
        }

        private publish() { this.applyDom(); this.emitChange(); }

        public get hiddenGuilds() { return this._hiddenGuilds; }

        public async load() {
            const data = await DataStore.get(DB_KEY);
            if (data && data instanceof Set) {
                this._hiddenGuilds = new Set(data);
                this.publish();
            }
        }

        public unload() {
            this._hiddenGuilds = new Set();
            if (this.hideSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== this.hideSheet);
            this.hideSheet = undefined;
            this.emitChange();
        }

        public save() {
            DataStore.set(DB_KEY, this._hiddenGuilds);
        }

        public addHiddenGuild(id: string) {
            this._hiddenGuilds = new Set(this._hiddenGuilds);
            this._hiddenGuilds.add(id);
            this.save();
            this.publish();
        }

        public removeHiddenGuild(id: string) {
            this._hiddenGuilds = new Set(this._hiddenGuilds);
            this._hiddenGuilds.delete(id);
            this.save();
            this.publish();
        }

        public addHiddenFolder(id: string, guildIds: string[]) {
            this._hiddenGuilds = new Set(this._hiddenGuilds);
            this._hiddenGuilds.add(`folder-${id}`);
            guildIds.forEach(gid => this._hiddenGuilds.add(gid));
            this.save();
            this.publish();
        }

        public removeHiddenFolder(id: string, guildIds: string[]) {
            this._hiddenGuilds = new Set(this._hiddenGuilds);
            this._hiddenGuilds.delete(`folder-${id}`);
            guildIds.forEach(gid => this._hiddenGuilds.delete(gid));
            this.save();
            this.publish();
        }

        public clearHidden() {
            this._hiddenGuilds = new Set();
            DataStore.del(DB_KEY);
            this.publish();
        }

        public hiddenGuildsDetail(): Guild[] {
            const sortedGuildIds = SortedGuildStore.getFlattenedGuildIds() as string[];
            // otherwise the list is in order of increasing id number which is confusing
            return sortedGuildIds.filter(id => this._hiddenGuilds.has(id)).map(id => GuildStore.getGuild(id));
        }
    }

    return new HiddenServersStore(FluxDispatcher);
});
