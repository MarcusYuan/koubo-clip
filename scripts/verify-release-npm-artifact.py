"""Verify downloaded release bytes before separately authorized npm publication."""
import hashlib
import json
import os
import subprocess
import tarfile
from pathlib import Path
version = os.environ['VERSION']
filename = f'koubo-clip-{version}.tgz'
artifact = Path('dist') / filename
metadata = json.loads(Path(str(artifact) + '.json').read_text())
acceptance = json.loads(Path(str(artifact) + '.acceptance.json').read_text())
source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
if not metadata['package'] == f'koubo-clip@{version}':
    raise ValueError("Release verification failed: metadata['package'] == f'koubo-clip@{version}'")
if not metadata['filename'] == filename:
    raise ValueError("Release verification failed: metadata['filename'] == filename")
if not metadata['source_revision'] == source:
    raise ValueError("Release verification failed: metadata['source_revision'] == source")
if not metadata['sha256'] == 'sha256:' + hashlib.sha256(artifact.read_bytes()).hexdigest():
    raise ValueError("Release verification failed: metadata['sha256'] == 'sha256:' + hashlib.sha256(artifact.read_bytes()).hexdigest()")
if not acceptance['package'] == metadata['package']:
    raise ValueError("Release verification failed: acceptance['package'] == metadata['package']")
if not (acceptance['ok'] is True and acceptance['inspection_accepted'] is True):
    raise ValueError("Release verification failed: acceptance['ok'] is True and acceptance['inspection_accepted'] is True")
with tarfile.open(artifact) as archive:
    entry = archive.getmember('package/delivery-manifest.json')
    if not entry.isfile():
        raise ValueError('Release verification failed: entry.isfile()')
    manifest = json.load(archive.extractfile(entry))
    if not manifest['source_revision'] == source:
        raise ValueError("Release verification failed: manifest['source_revision'] == source")
    if not manifest['delivery_digest'] == acceptance['delivery_digest']:
        raise ValueError("Release verification failed: manifest['delivery_digest'] == acceptance['delivery_digest']")
print(json.dumps({'verified': True, 'version': version, 'source_revision': source, 'sha256': metadata['sha256']}))
