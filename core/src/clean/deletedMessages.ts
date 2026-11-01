export function isDeletedMessage(message: any): boolean {
  return message?.deleted === true || typeof message?.xrayDeletedAt === "number";
}
/** Clean builds keep no copies of deleted messages. */
export class DeletedMessages {
  clear(): void {}
  remember(_channel: string, _messages: any[]): void {}
  handle(_action: any, _getMessage: (channel: string, id: string) => any): boolean { return false; }
  merge(_channel: string, messages: any[]): any[] { return messages; }
}
