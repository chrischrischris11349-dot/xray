import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('private full and clean update feeds require authentication and accept only their named assets',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'xray-update-feeds-'));
  const token='test-only-private-update-token';
  process.env.XRAY_LOG_TOKEN=token;
  process.env.XRAY_UPDATES_DIR=directory;
  const files=['personal.json','personal-clean.json','XRay-Personal-0.5.22.exe','XRay-Personal-Clean-0.5.22.exe','XRay-Personal-Clean-0.5.22.exe.sig'];
  for(const name of files)writeFileSync(join(directory,name),name.endsWith('.json')?JSON.stringify({version:'0.5.22',variant:name}):`fixture:${name}`);
  const {createApp}=await import('./log-server.mjs');
  const server=createServer(createApp({}));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:`Bearer ${token}`};
  try{
    for(const name of files){
      const response=await fetch(`${base}/updates/${name}`,{headers});
      assert.equal(response.status,200,name);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      if(name.endsWith('.json')){
        assert.equal(response.headers.get('content-type'),'application/json');
        assert.equal((await response.json()).variant,name,'the clean and full manifests must stay distinct');
      }else assert.equal(await response.text(),`fixture:${name}`);
      for(const credentials of [undefined,{Authorization:'Bearer wrong-token'}]){
        const denied=await fetch(`${base}/updates/${name}`,{headers:credentials});
        assert.equal(denied.status,401,name);await denied.arrayBuffer();
      }
    }
    for(const path of ['personal-other.json','XRay-Team-0.5.22.exe','updater.key','XRay-Personal-Clean-0.5.22.exe.extra','personal-clean.json%2fupdater.key']){
      const response=await fetch(`${base}/updates/${path}`,{headers});
      assert.equal(response.status,404,path);await response.arrayBuffer();
    }
    const missing=await fetch(`${base}/updates/XRay-Personal-Clean-99.0.0.exe`,{headers});
    assert.equal(missing.status,404);await missing.arrayBuffer();
    const mutation=await fetch(`${base}/updates/personal-clean.json`,{method:'POST',headers,body:'replace'});
    assert.equal(mutation.status,404);await mutation.arrayBuffer();
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    for(const name of files)unlinkSync(join(directory,name));rmdirSync(directory);
  }
});
