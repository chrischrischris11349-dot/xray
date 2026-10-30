"""Open only the existing Tor Browser, with a mandatory local SOCKS listener and policy."""
import argparse,json,os,socket,subprocess,sys
from pathlib import Path
from urllib.parse import urlsplit

def abort(message):
 if os.name=='nt' and Path(sys.executable).stem.lower()=='pythonw':
  import ctypes
  ctypes.windll.user32.MessageBoxW(None,message,'XRay Tor Browser',0x10)
 raise SystemExit(message)

def policy_matches(value):
 proxy=value.get('policies',{}).get('Proxy',{});prefs=value.get('policies',{}).get('Preferences',{})
 return proxy.get('Mode')=='manual' and proxy.get('Locked') is True and proxy.get('SOCKSProxy')=='127.0.0.1:9050' and proxy.get('SOCKSVersion')==5 and proxy.get('UseProxyForDNS') is True and proxy.get('Passthrough')=='' and all(prefs.get(key,{}).get('Value') is False and prefs[key].get('Status')=='locked' for key in ['network.proxy.failover_direct','media.peerconnection.enabled'])

def main():
 parser=argparse.ArgumentParser();parser.add_argument('url',nargs='?',default='https://check.torproject.org/');parser.add_argument('--check',action='store_true');parser.add_argument('--browser',type=Path);args=parser.parse_args()
 url=urlsplit(args.url)
 if len(args.url)>8192 or url.scheme not in ['https','http'] or not url.hostname or url.username or url.password:abort('Use a web link without embedded credentials.')
 try:
  settings=Path(os.environ['APPDATA'])/'app.xray.desktop/shell.json'
  config=json.loads(settings.read_text(encoding='utf8')) if not args.browser else {}
  browser=args.browser or Path(config.get('tor_browser_path',''))
  metadata=(browser.parent/'application.ini').read_text(encoding='utf8') if browser.is_file() else ''
  policies=json.loads((browser.parent/'distribution/policies.json').read_text(encoding='utf8'))
 except (OSError,ValueError):abort('Tor Browser configuration is unavailable. No ordinary browser was used.')
 if 'Vendor=Tor Project' not in metadata or 'RemotingName=Tor Browser' not in metadata or not policy_matches(policies):abort('Tor Browser and its locked proxy policy could not be verified. No ordinary browser was used.')
 try:
  with socket.create_connection(('127.0.0.1',9050),timeout=2) as sock:
   sock.sendall(bytes([5,1,0]));reply=b''
   while len(reply)<2:
    part=sock.recv(2-len(reply))
    if not part:raise OSError('Incomplete SOCKS handshake')
    reply+=part
   if reply!=bytes([5,0]):raise OSError('Not a SOCKS5 listener')
 except OSError:abort('Tor is unavailable on 127.0.0.1:9050. Browser kept closed.')
 if args.check:print('Tor Browser, locked proxy policy and local SOCKS5 listener verified.');return
 environment={**os.environ,'TOR_PROVIDER':'none','TOR_SKIP_LAUNCH':'1','TOR_SOCKS_HOST':'127.0.0.1','TOR_SOCKS_PORT':'9050','TOR_SKIP_CONTROLPORTTEST':'1'}
 environment.pop('TOR_TRANSPROXY',None);environment.pop('MOZ_NO_REMOTE',None)
 profile=browser.parent/'TorBrowser/Data/Browser/xray-profile';profile.mkdir(parents=True,exist_ok=True)
 subprocess.Popen([str(browser),'--allow-remote','--profile',str(profile),'-new-tab',args.url],cwd=browser.parent,env=environment)

if __name__=='__main__':main()
