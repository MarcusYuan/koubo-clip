import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
import importlib.util

spec = importlib.util.spec_from_file_location("target_gate", Path(__file__).with_name("verify-box-macos-target.py"))
target_gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target_gate)

SCRIPT = Path(__file__).with_name("verify-release-npm-artifact.py").resolve()

class ReleaseArtifactTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        subprocess.run(["git", "init", "-q", self.root], check=True)
        subprocess.run(["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], cwd=self.root, check=True)
        self.source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root, text=True).strip()
        (self.root / "dist").mkdir()
        self.artifact = self.root / "dist/koubo-clip-0.0.21.tgz"
        manifest = json.dumps({"source_revision": self.source, "delivery_digest": "sha256:fixture"}).encode()
        with tarfile.open(self.artifact, "w:gz") as archive:
            entry = tarfile.TarInfo("package/delivery-manifest.json")
            entry.size = len(manifest)
            archive.addfile(entry, io.BytesIO(manifest))
        self.metadata = {"package": "koubo-clip@0.0.21", "filename": self.artifact.name, "source_revision": self.source, "sha256": "sha256:" + hashlib.sha256(self.artifact.read_bytes()).hexdigest()}
        self.acceptance = {"package": "koubo-clip@0.0.21", "ok": True, "inspection_accepted": True, "delivery_digest": "sha256:fixture"}
    def tearDown(self):
        self.tmp.cleanup()
    def run_check(self):
        Path(str(self.artifact) + ".json").write_text(json.dumps(self.metadata))
        Path(str(self.artifact) + ".acceptance.json").write_text(json.dumps(self.acceptance))
        return subprocess.run(["python3", str(SCRIPT)], cwd=self.root, env={**os.environ, "VERSION": "0.0.21"}, capture_output=True).returncode
    def test_verified_bytes(self):
        self.assertEqual(self.run_check(), 0)
    def test_modified_bytes(self):
        self.artifact.write_bytes(self.artifact.read_bytes() + b"tampered")
        self.assertNotEqual(self.run_check(), 0)
    def test_wrong_source(self):
        self.metadata["source_revision"] = "0" * 40
        self.assertNotEqual(self.run_check(), 0)
    def test_wrong_version(self):
        self.metadata["package"] = "koubo-clip@0.0.20"
        self.assertNotEqual(self.run_check(), 0)
    def test_failed_inspection(self):
        self.acceptance["inspection_accepted"] = False
        self.assertNotEqual(self.run_check(), 0)
    def test_delivery_mismatch(self):
        self.acceptance["delivery_digest"] = "sha256:wrong"
        self.assertNotEqual(self.run_check(), 0)

class MacTargetTest(unittest.TestCase):
    def test_modern_load_command(self):
        self.assertEqual(target_gate.minimum_versions("Load command 1\n cmd LC_BUILD_VERSION\n minos 14.0\n sdk 26.0"), ["14.0"])
    def test_legacy_load_command(self):
        self.assertEqual(target_gate.minimum_versions("cmd LC_VERSION_MIN_MACOSX\n version 11.0\n sdk 26.0"), ["11.0"])
    def test_too_new(self):
        with self.assertRaises(ValueError):
            target_gate.minimum_versions("cmd LC_BUILD_VERSION\n minos 26.0")
    def test_missing_minos(self):
        with self.assertRaises(ValueError):
            target_gate.minimum_versions("cmd LC_BUILD_VERSION\n sdk 26.0")

if __name__ == "__main__":
    unittest.main()
