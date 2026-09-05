"""Seed only checksum-locked source archives from the immutable 0.0.20 source offer."""
import hashlib
import io
import json
import os
import tarfile
import urllib.request
from pathlib import Path
URL = 'https://github.com/MarcusYuan/koubo-clip/releases/download/v0.0.20/koubo-clip-ffmpeg-sources-0.0.20.tar.xz'
SIZE = 34588468
SHA256 = 'd44e4314753b13c739451132472e9a87a35e0dbba4f5466f5f59f1a052fe4e48'
root = Path(__file__).resolve().parent.parent
lock = json.loads((root / 'third_party/ffmpeg-runtime/macos-aarch64/source-lock.json').read_text())
cache = Path(os.environ['KOUBO_FFMPEG_SOURCE_CACHE'])
cache.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(URL, timeout=120) as response:
    payload = response.read(SIZE + 1)
if not len(payload) == SIZE:
    raise ValueError('source offer size mismatch')
if not hashlib.sha256(payload).hexdigest() == SHA256:
    raise ValueError('source offer checksum mismatch')
with tarfile.open(fileobj=io.BytesIO(payload), mode='r:xz') as archive:
    for source in lock['sources']:
        name = source['archive']
        if not Path(name).name == name:
            raise ValueError('Release verification failed: Path(name).name == name')
        entry = archive.getmember('koubo-clip-ffmpeg-sources-0.0.20/sources/' + name)
        if not entry.isfile():
            raise ValueError('source cache entry must be a regular file')
        data = archive.extractfile(entry).read()
        if not hashlib.sha256(data).hexdigest() == source['sha256']:
            raise ValueError('locked source checksum mismatch')
        destination = cache / name
        if not not destination.is_symlink():
            raise ValueError('Release verification failed: not destination.is_symlink()')
        if destination.exists():
            if not hashlib.sha256(destination.read_bytes()).hexdigest() == source['sha256']:
                raise ValueError("Release verification failed: hashlib.sha256(destination.read_bytes()).hexdigest() == source['sha256']")
        else:
            with destination.open('xb') as output:
                output.write(data)
print(json.dumps({'source_offer_sha256': SHA256, 'verified_archives': len(lock['sources'])}))
