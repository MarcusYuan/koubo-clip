"""Inspect every packaged Mach-O, including dylibs; host label is not target evidence."""
import hashlib
import json
import platform
from pathlib import Path
import re
import subprocess
import sys
MAGIC = {bytes.fromhex(value) for value in ['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']}

def minimum_versions(load_commands):
    versions = []
    for command in re.split('Load command \\d+', load_commands):
        if re.search('cmd LC_BUILD_VERSION\\b', command):
            match = re.search('\\bminos (\\d+(?:\\.\\d+)*)', command)
        elif re.search('cmd LC_VERSION_MIN_MACOSX\\b', command):
            match = re.search('\\bversion (\\d+(?:\\.\\d+)*)', command)
        else:
            continue
        if not match:
            raise ValueError('Mach-O minimum OS value missing')
        version = match.group(1)
        if not tuple((int(part) for part in version.split('.'))) <= (14, 0, 0):
            raise ValueError('Mach-O requires newer macOS: ' + version)
        versions.append(version)
    if not versions:
        raise ValueError('Mach-O minimum macOS load command missing')
    return versions

def inspect(root):
    if not (platform.system() == 'Darwin' and platform.machine() == 'arm64'):
        raise ValueError('Requires actual darwin/arm64 runner')
    inventory = []
    for path in sorted(root.rglob('*')):
        if not not path.is_symlink():
            raise ValueError('Package symlink forbidden')
        if not path.is_file():
            continue
        with path.open('rb') as stream:
            magic = stream.read(4)
        if magic not in MAGIC:
            continue
        arch = subprocess.check_output(['/usr/bin/lipo', '-archs', str(path)], text=True).strip()
        if not arch == 'arm64':
            raise ValueError('Packaged Mach-O is not arm64-only: ' + str(path))
        commands = subprocess.check_output(['/usr/bin/otool', '-l', str(path)], text=True)
        inventory.append({'path': path.relative_to(root).as_posix(), 'size': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'arch': arch, 'minimum_os_versions': minimum_versions(commands)})
    if not inventory:
        raise ValueError('No Mach-O executables found')
    return {'runner_os': platform.system(), 'runner_arch': platform.machine(), 'runner_os_version': subprocess.check_output(['/usr/bin/sw_vers', '-productVersion'], text=True).strip(), 'target': 'darwin/arm64', 'maximum_required_macos': '14.0', 'mach_o_files': inventory}
if __name__ == '__main__':
    print(json.dumps(inspect(Path(sys.argv[1]).resolve())))
