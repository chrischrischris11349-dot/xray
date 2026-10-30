/** Offline inspection only: no fetch, DNS, redirect resolution or remote reputation API. */
const internal=new Set(['discord.com','ptb.discord.com','canary.discord.com','discord.gg','cdn.discordapp.com','media.discordapp.net']);
const shorteners=new Set(['bit.ly','t.co','tinyurl.com','is.gd','cutt.ly','rb.gy','shorturl.at','buff.ly','ow.ly']);
export interface LinkAssessment {href:string;host:string;label:string;masked:boolean;mismatch:boolean;external:boolean;reasons:string[];blocked:boolean;}
const hidden=/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
export function inspectLink(value:string,label='',base='https://discord.com/'):LinkAssessment|null{
 if(typeof value!=='string'||value.length>8192)return null;
 let url:URL;try{url=new URL(value,base);}catch{return null;}
 if(!['http:','https:'].includes(url.protocol))return null;
 const host=url.hostname.toLowerCase(),shown=String(label).slice(0,1000),clean=shown.replace(hidden,'').trim(),reasons:string[]=[];
 const claim=/^(?:https?:\/\/)?((?:[\p{L}\p{N}-]+\.)+[\p{L}\p{N}-]+)(?::\d+)?(?:[/?#]|$)/iu.exec(clean);
 let claimed='';if(claim)try{claimed=new URL('https://'+claim[1]).hostname.toLowerCase();}catch{}
 const same=(a:string,b:string)=>a.replace(/^www\./,'')===b.replace(/^www\./,'');
 const mismatch=!!claimed&&!same(claimed,host);
 const external=!internal.has(host)||url.protocol!=='https:';
 const masked=mismatch||external&&!!clean&&clean!==url.href&&clean!==value&&!same(clean.replace(/\/$/,''),host);
 if(mismatch)reasons.push('Displayed website differs from the actual destination.');
 else if(masked)reasons.push('This text label hides the destination URL.');
 if(host.split('.').some(part=>part.startsWith('xn--')))reasons.push('Internationalized domain: inspect the ASCII hostname carefully.');
 if(shown!==shown.replace(hidden,''))reasons.push('The label contains hidden or direction-changing characters.');
 if(shorteners.has(host.replace(/^www\./,'')))reasons.push('Shortened URL: the final destination is unknown without following it.');
 if(url.protocol==='http:')reasons.push('This is an unencrypted HTTP link.');
 const blocked=!!url.username||!!url.password;if(blocked)reasons.push('Links containing embedded credentials are blocked.');
 return {href:url.href,host:url.host,label:clean||'(Image or icon link)',masked,mismatch,external,reasons,blocked};
}
