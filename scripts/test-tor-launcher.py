"""The launcher must never spawn a browser after a failed proxy/policy check."""
import importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
spec=importlib.util.spec_from_file_location('tor_launcher',Path(__file__).with_name('launch-tor-browser.py'))
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)
class LauncherTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
  self.directory=Path(self.temporary.name);self.browser=self.directory/'firefox.exe';self.browser.write_bytes(b'fixture')
  (self.directory/'application.ini').write_text('Vendor=Tor Project\nRemotingName=Tor Browser\n',encoding='utf8')
  (self.directory/'distribution').mkdir()
  self.policy={'policies':{'Proxy':{'Mode':'manual','Locked':True,'SOCKSProxy':'127.0.0.1:9050','SOCKSVersion':5,'UseProxyForDNS':True,'Passthrough':''},'Preferences':{key:{'Value':False,'Status':'locked'} for key in ['network.proxy.failover_direct','media.peerconnection.enabled']}}}
  self.policy_path=self.directory/'distribution/policies.json';self.save()
 def save(self):self.policy_path.write_text(json.dumps(self.policy),encoding='utf8')
 def call(self):
  with patch.object(sys,'argv',['launcher','--browser',str(self.browser),'https://check.torproject.org/']):launcher.main()
 def test_offline_never_starts_browser(self):
  with patch('socket.create_connection',side_effect=OSError('offline')),patch('subprocess.Popen') as spawn:
   with self.assertRaises(SystemExit):self.call()
   spawn.assert_not_called()
 def test_bad_policy_never_starts_browser(self):
  self.policy['policies']['Proxy']['Passthrough']='*';self.save()
  with patch('socket.create_connection') as connect,patch('subprocess.Popen') as spawn:
   with self.assertRaises(SystemExit):self.call()
   connect.assert_not_called();spawn.assert_not_called()
 def test_good_proxy_passes_fixed_external_provider_without_transparent_override(self):
  connection=MagicMock();connection.__enter__.return_value.recv.side_effect=[b'\x05',b'\x00']
  with patch.dict(os.environ,{'TOR_TRANSPROXY':'1','MOZ_NO_REMOTE':'1'}),patch('socket.create_connection',return_value=connection),patch('subprocess.Popen') as spawn:
   self.call();args,kwargs=spawn.call_args;self.assertEqual(args[0][0],str(self.browser));self.assertEqual(args[0][1:3],['--allow-remote','--profile']);self.assertIn('xray-profile',args[0][3]);self.assertEqual(kwargs['env']['TOR_SOCKS_PORT'],'9050');self.assertEqual(kwargs['env']['TOR_PROVIDER'],'none');self.assertNotIn('TOR_TRANSPROXY',kwargs['env']);self.assertNotIn('MOZ_NO_REMOTE',kwargs['env'])
if __name__=='__main__':unittest.main()
