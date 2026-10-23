export interface CountedServer { id: string; name: string; count: number; channels: number; }
export function countLoadedMessages(userId: string, servers: { id: string; name: string }[], channels: any[], read: (id: string) => any[] | null): { total: number; servers: CountedServer[] } {
  const seen = new Set<string>();
  const result = servers.map(server => ({ ...server, count: 0, channels: 0 }));
  const byGuild = new Map(result.map(server => [server.id, server]));
  const scannedChannels = new Set<string>();
  for (const channel of channels) {
    const server = byGuild.get(channel?.guild_id);
    if (!server || typeof channel.id !== "string" || scannedChannels.has(channel.id)) continue;
    scannedChannels.add(channel.id);
    const messages = read(channel.id);
    if (!messages) continue;
    server.channels++;
    for (const message of messages) {
      if (message?.author?.id !== userId || typeof message.id !== "string" || message.deleted || seen.has(message.id)) continue;
      seen.add(message.id); server.count++;
    }
  }
  return { total: result.reduce((sum, server) => sum + server.count, 0), servers: result };
}
