"""Generate the matching Tauri feed from a built installer signature; no credentials."""
import argparse
import base64
import datetime
import json
import re
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser()
parser.add_argument('--signature', type=Path, required=True)
parser.add_argument('--url', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
version = json.loads((root/'package.json').read_text(encoding='utf8'))['version']
url = urlparse(args.url)
if url.scheme != 'https' or url.username or url.password or url.fragment:
    raise SystemExit('An HTTPS installer URL without embedded credentials is required')
signature = args.signature.read_text(encoding='utf8').strip()
comment = base64.b64decode(signature, validate=True).decode('utf8')
if not re.search(r'(?:^|\s)version:'+re.escape(version)+r'(?=\s|$)', comment):
    raise SystemExit('Signature does not name this release version')
manifest = {'version': version, 'notes': 'Archived media, duplicate prevention and interface polish.',
            'pub_date': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'platforms': {'windows-x86_64': {'url': args.url, 'signature': signature}}}
args.output.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf8')
print(f'Update manifest written: {args.output.name}')
