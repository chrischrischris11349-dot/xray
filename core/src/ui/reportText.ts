import { h } from "./dom";
export function reportLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {const url=new URL(value);return ["https:","http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;}catch{return null;}
}
/** Text/JSON layout stays intact. Never interpret supplied HTML as markup. */
export function linkedText(value: unknown, className=""): HTMLElement {
  const element=h("span",{class:className});
  const text=typeof value==="string"?value:value==null?"Unavailable":JSON.stringify(value,null,2);
  let from=0;
  for(const match of text.matchAll(/https?:\/\/[^\s<>"\\]+/gi)) {
    element.append(text.slice(from,match.index));
    let raw=match[0].replace(/[.,;!?]+$/,"");
    while(raw.endsWith(")") && (raw.match(/\)/g)?.length??0)>(raw.match(/\(/g)?.length??0))raw=raw.slice(0,-1);
    const href=reportLink(raw);
    element.append(href?h("a",{attrs:{href,target:"_blank",rel:"noopener noreferrer",referrerpolicy:"no-referrer"},text:raw}):raw);
    element.append(match[0].slice(raw.length));from=match.index!+match[0].length;
  }
  element.append(text.slice(from));return element;
}
export function connectionUrl(connection:{type:string;id?:string;name:string;url?:string}):string|null {
  const supplied=reportLink(connection.url);if(supplied)return supplied;
  const id=connection.id;if(!id)return null;
  const routes:Record<string,string>={spotify:`https://open.spotify.com/user/${encodeURIComponent(id)}`,steam:`https://steamcommunity.com/profiles/${encodeURIComponent(id)}`,twitch:`https://www.twitch.tv/${encodeURIComponent(connection.name)}`,youtube:`https://www.youtube.com/channel/${encodeURIComponent(id)}`,github:`https://github.com/${encodeURIComponent(connection.name)}`,reddit:`https://www.reddit.com/user/${encodeURIComponent(connection.name)}`,xbox:`https://www.xbox.com/play/user/${encodeURIComponent(connection.name)}`};
  return routes[connection.type]??null;
}
