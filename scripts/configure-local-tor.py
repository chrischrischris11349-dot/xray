"""Configure the existing Tor Browser and local XRay opt-in; no admin or Firefox-profile access."""
import argparse,datetime,json,os,socket
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--browser-only',action='store_true');parser.add_argument('--links-only',action='store_true',help='Explicitly restore normal XRay networking/voice; route only opened links to Tor Browser');parser.add_argument('--xray',action='store_true',help='Compatibility alias; strict configuration is the default action');args=parser.parse_args()
browser=Path.home()/'Desktop/Tor Browser/Browser/firefox.exe'
metadata=(browser.parent/'application.ini').read_text(encoding='utf8') if browser.is_file() else ''
if 'Vendor=Tor Project' not in metadata or 'RemotingName=Tor Browser' not in metadata:raise SystemExit('Existing Tor Browser could not be verified. No ordinary Firefox configuration was changed.')
with socket.create_connection(('127.0.0.1',9050),timeout=2) as connection:
 connection.sendall(bytes([5,1,0]));reply=b''
 while len(reply)<2:
  part=connection.recv(2-len(reply))
  if not part:raise SystemExit('Tor SOCKS handshake did not complete.')
  reply+=part
 if reply!=bytes([5,0]):raise SystemExit('Local listener is not the configured SOCKS5 proxy.')
if args.check:print('Existing Tor Browser and SOCKS5 127.0.0.1:9050 are ready.');raise SystemExit()
policy_path=browser.parent/'distribution/policies.json'
policy=json.loads(policy_path.read_text(encoding='utf8')) if policy_path.exists() else {'policies':{}}
if not isinstance(policy,dict) or not isinstance(policy.get('policies'),dict):raise SystemExit('Existing browser policies are unreadable; nothing was overwritten.')
policy_directory=Path(os.environ['APPDATA'])/'XRay-network';policy_directory.mkdir(exist_ok=True)
if policy_path.exists():(policy_directory/('tor-browser-policies-before-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.json')).write_bytes(policy_path.read_bytes())
policy['policies']['Proxy']={'Mode':'manual','Locked':True,'SOCKSProxy':'127.0.0.1:9050','SOCKSVersion':5,'UseProxyForDNS':True,'Passthrough':'','HTTPProxy':'','SSLProxy':'','UseHTTPProxyForAllProtocols':False}
prefs=policy['policies'].setdefault('Preferences',{})
for key,value in {'network.proxy.failover_direct':False,'network.proxy.allow_hijacking_localhost':True,'network.dns.disablePrefetch':True,'network.prefetch-next':False,'network.http.speculative-parallel-limit':0,'network.trr.mode':5,'network.http.http3.enable':False,'media.peerconnection.enabled':False}.items():prefs[key]={'Value':value,'Status':'locked'}
policy_path.parent.mkdir(exist_ok=True);temporary=policy_path.with_suffix('.tor-tmp');temporary.write_text(json.dumps(policy,indent=2)+'\n',encoding='utf8');temporary.replace(policy_path)
print('Existing Tor Browser: locked SOCKS5, remote DNS, direct fallback and WebRTC disabled.')
if args.browser_only:raise SystemExit()
directory=Path(os.environ['APPDATA'])/'app.xray.desktop';directory.mkdir(exist_ok=True)
settings=directory/'shell.json';data=json.loads(settings.read_text(encoding='utf8')) if settings.exists() else {}
backup={key:data.get(key) for key in ['tor_proxy','tor_browser_path','tor_browser_links']};backup['required']=(directory/'tor-required.flag').exists()
backup_path=directory/('tor-before-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.json')
backup_path.write_text(json.dumps(backup,indent=2)+'\n',encoding='utf8')
if args.links_only:(directory/'tor-required.flag').unlink(missing_ok=True)
else:(directory/'tor-required.flag').write_text('Tor routing is required. Removing this file and setting tor_proxy=false is an explicit opt-out.\n',encoding='utf8')
data.update(tor_proxy=not args.links_only,tor_browser_links=True,tor_browser_path=str(browser))
temporary=settings.with_suffix('.tor-tmp');temporary.write_text(json.dumps(data,indent=2)+'\n',encoding='utf8');temporary.replace(settings)
print('XRay '+('normal networking/VC with Tor Browser links' if args.links_only else 'strict Tor mode')+' configured for the next full process startup. Use XRay 0.5.15 or newer.')
print('Links use the existing Tor Browser on 127.0.0.1:9050. Ordinary Firefox was not modified.')
print('Previous Tor-only settings saved:',backup_path.name)
