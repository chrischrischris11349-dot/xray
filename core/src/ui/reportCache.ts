import { myId } from "../discord";
const reports=new Map<string,any[]>();
/** Session-only, account/subject-scoped results. Never silently persist provider findings. */
export function rememberReport(subject:string,report:any):void {
  const owner=myId();if(!owner || !/^\d{14,20}$/.test(subject) || JSON.stringify(report).length>1_048_576)return;
  const key=`${owner}:${subject}`;reports.set(key,[...(reports.get(key)??[]).slice(-3),report]);
  while(reports.size>8)reports.delete(reports.keys().next().value!);
}
export function reportsFor(subject:string):any[]{return reports.get(`${myId()}:${subject}`)??[];}
