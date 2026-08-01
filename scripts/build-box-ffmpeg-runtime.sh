#!/usr/bin/env bash

set -euo pipefail

umask 022

kc_fail() {
  printf 'build-box-ffmpeg-runtime: %s\n' "$*" >&2
  exit 1
}

kc_require_command() {
  command -v "$1" >/dev/null 2>&1 || kc_fail "required command is unavailable: $1"
}

kc_python="/usr/bin/python3"
kc_clang="/usr/bin/clang"

[[ -x "$kc_python" ]] || kc_fail "required Python is unavailable: $kc_python"

kc_canonicalize_path() {
  local kc_raw_path="$1"
  local kc_label="$2"
  "$kc_python" - "$kc_raw_path" "$kc_label" <<'PY'
import os
import pathlib
import sys

raw = sys.argv[1]
label = sys.argv[2]
if not raw:
    raise SystemExit(f"{label} must not be empty")
raw_path = pathlib.PurePath(raw)
if ".." in raw_path.parts:
    raise SystemExit(f"{label} must not contain '..': {raw}")
path = pathlib.Path(raw)
if not path.is_absolute():
    path = pathlib.Path.cwd() / path
path = pathlib.Path(os.path.abspath(os.fspath(path)))
probe = pathlib.Path(path.anchor)
for part in path.parts[1:]:
    probe /= part
    if probe.is_symlink():
        raise SystemExit(f"{label} must not traverse a symlink: {probe}")
print(path)
PY
}

kc_assert_strict_descendant() {
  local kc_candidate="$1"
  local kc_anchor="$2"
  local kc_label="$3"
  "$kc_python" - "$kc_candidate" "$kc_anchor" "$kc_label" <<'PY'
import pathlib
import sys

candidate = pathlib.Path(sys.argv[1])
anchor = pathlib.Path(sys.argv[2])
label = sys.argv[3]
if candidate == anchor or anchor not in candidate.parents:
    raise SystemExit(f"{label} must be a strict descendant of {anchor}: {candidate}")
PY
}

kc_assert_runtime_target() {
  local kc_candidate="$1"
  local kc_repo="$2"
  "$kc_python" - "$kc_candidate" "$kc_repo" <<'PY'
import pathlib
import sys

candidate = pathlib.Path(sys.argv[1])
repo = pathlib.Path(sys.argv[2])
home = pathlib.Path.home().resolve()
for protected in (pathlib.Path(candidate.anchor), home, repo):
    if candidate == protected or candidate in protected.parents:
        raise SystemExit(f"unsafe runtime output path: {candidate}")
PY
}

kc_marker_matches() {
  local kc_directory="$1"
  local kc_marker_name="$2"
  local kc_marker_value="$3"
  [[ -d "$kc_directory" && ! -L "$kc_directory" && -f "$kc_directory/$kc_marker_name" && ! -L "$kc_directory/$kc_marker_name" ]] || return 1
  [[ "$(<"$kc_directory/$kc_marker_name")" == "$kc_marker_value" ]]
}

kc_remove_owned_tree() {
  local kc_directory="$1"
  local kc_marker_name="$2"
  local kc_marker_value="$3"
  [[ -e "$kc_directory" || -L "$kc_directory" ]] || return 0
  kc_marker_matches "$kc_directory" "$kc_marker_name" "$kc_marker_value" || kc_fail "refusing to remove unowned directory: $kc_directory"
  rm -rf -- "$kc_directory"
}

kc_publish_owned_directory() {
  local kc_stage="$1"
  local kc_target="$2"
  local kc_marker_name="$3"
  local kc_marker_value="$4"
  local kc_parent="$(dirname -- "$kc_target")"
  local kc_backup="$kc_parent/.koubo-ffmpeg-runtime-backup.$$.${RANDOM}"

  kc_marker_matches "$kc_stage" "$kc_marker_name" "$kc_marker_value" || kc_fail "runtime staging directory is not script-owned: $kc_stage"
  [[ ! -e "$kc_backup" && ! -L "$kc_backup" ]] || kc_fail "runtime backup path already exists: $kc_backup"
  if [[ -e "$kc_target" || -L "$kc_target" ]]; then
    kc_marker_matches "$kc_target" "$kc_marker_name" "$kc_marker_value" || kc_fail "refusing to replace unowned runtime output: $kc_target"
    mv "$kc_target" "$kc_backup"
    if ! mv "$kc_stage" "$kc_target"; then
      mv "$kc_backup" "$kc_target"
      kc_fail "failed to publish runtime output"
    fi
    kc_remove_owned_tree "$kc_backup" "$kc_marker_name" "$kc_marker_value"
  else
    mv "$kc_stage" "$kc_target"
  fi
}

kc_build_marker_name=".koubo-clip-ffmpeg-build-owned"
kc_build_marker_value="koubo-clip ffmpeg build staging v1"
kc_runtime_marker_name=".koubo-clip-ffmpeg-runtime-owned"
kc_runtime_marker_value="koubo-clip ffmpeg runtime output v1"

kc_run_path_safety_self_test() {
  local kc_test_root=""
  local kc_owned_stage=""
  local kc_owned_stage_two=""
  local kc_owned_target=""
  local kc_unowned_build=""
  local kc_unowned_target=""
  kc_test_root="$(mktemp -d /private/tmp/koubo-ffmpeg-path-safety.XXXXXX)"
  printf '%s\n' "$kc_build_marker_value" > "$kc_test_root/$kc_build_marker_name"
  mkdir -p "$kc_test_root/victim" "$kc_test_root/fake-repo"
  printf 'preserve\n' > "$kc_test_root/victim/sentinel"
  printf 'preserve\n' > "$kc_test_root/fake-repo/sentinel"
  ln -s "$kc_test_root/victim" "$kc_test_root/escape"

  if (kc_canonicalize_path "$kc_test_root/fake-repo/../victim" "self-test path" >/dev/null 2>&1); then
    kc_fail "path safety self-test accepted '..'"
  fi
  if (kc_canonicalize_path "$kc_test_root/escape/sentinel" "self-test path" >/dev/null 2>&1); then
    kc_fail "path safety self-test accepted a symlink traversal"
  fi
  if (kc_assert_runtime_target "$kc_test_root/fake-repo" "$kc_test_root/fake-repo" >/dev/null 2>&1); then
    kc_fail "path safety self-test accepted the repository root as runtime output"
  fi

  kc_unowned_build="$kc_test_root/unowned-build"
  mkdir "$kc_unowned_build"
  printf 'preserve\n' > "$kc_unowned_build/sentinel"
  if (kc_remove_owned_tree "$kc_unowned_build" "$kc_build_marker_name" "$kc_build_marker_value" >/dev/null 2>&1); then
    kc_fail "path safety self-test removed an unowned build directory"
  fi

  kc_owned_stage="$(mktemp -d "$kc_test_root/.runtime-stage.XXXXXX")"
  printf '%s\n' "$kc_runtime_marker_value" > "$kc_owned_stage/$kc_runtime_marker_name"
  printf 'stage\n' > "$kc_owned_stage/payload"
  kc_unowned_target="$kc_test_root/unowned-runtime"
  mkdir "$kc_unowned_target"
  printf 'preserve\n' > "$kc_unowned_target/sentinel"
  if (kc_publish_owned_directory "$kc_owned_stage" "$kc_unowned_target" "$kc_runtime_marker_name" "$kc_runtime_marker_value" >/dev/null 2>&1); then
    kc_fail "path safety self-test replaced an unowned runtime directory"
  fi
  [[ "$(<"$kc_test_root/victim/sentinel")" == "preserve" ]] || kc_fail "path safety self-test modified the symlink target"
  [[ "$(<"$kc_test_root/fake-repo/sentinel")" == "preserve" ]] || kc_fail "path safety self-test modified the repository root"
  [[ "$(<"$kc_unowned_build/sentinel")" == "preserve" ]] || kc_fail "path safety self-test modified an unowned build directory"
  [[ "$(<"$kc_unowned_target/sentinel")" == "preserve" ]] || kc_fail "path safety self-test modified an unowned runtime directory"

  kc_remove_owned_tree "$kc_owned_stage" "$kc_runtime_marker_name" "$kc_runtime_marker_value"
  kc_owned_stage="$(mktemp -d "$kc_test_root/.runtime-stage.XXXXXX")"
  printf '%s\n' "$kc_runtime_marker_value" > "$kc_owned_stage/$kc_runtime_marker_name"
  printf 'first\n' > "$kc_owned_stage/payload"
  kc_owned_target="$kc_test_root/owned-runtime"
  kc_publish_owned_directory "$kc_owned_stage" "$kc_owned_target" "$kc_runtime_marker_name" "$kc_runtime_marker_value"
  kc_owned_stage_two="$(mktemp -d "$kc_test_root/.runtime-stage.XXXXXX")"
  printf '%s\n' "$kc_runtime_marker_value" > "$kc_owned_stage_two/$kc_runtime_marker_name"
  printf 'second\n' > "$kc_owned_stage_two/payload"
  kc_publish_owned_directory "$kc_owned_stage_two" "$kc_owned_target" "$kc_runtime_marker_name" "$kc_runtime_marker_value"
  [[ "$(<"$kc_owned_target/payload")" == "second" ]] || kc_fail "path safety self-test failed atomic owned-directory replacement"
  kc_remove_owned_tree "$kc_owned_target" "$kc_runtime_marker_name" "$kc_runtime_marker_value"
  kc_remove_owned_tree "$kc_test_root" "$kc_build_marker_name" "$kc_build_marker_value"
  printf 'path-safety-self-test: passed\n'
}

if [[ "${KOUBO_FFMPEG_PATH_SAFETY_SELF_TEST:-0}" == "1" ]]; then
  kc_run_path_safety_self_test
  exit 0
fi

kc_script_path="$(kc_canonicalize_path "$0" "build script path")"
kc_script_dir="$(dirname -- "$kc_script_path")"
kc_repo_root="$(kc_canonicalize_path "$(dirname -- "$kc_script_dir")" "repository root")"
kc_lock_path="$(kc_canonicalize_path "${KOUBO_FFMPEG_SOURCE_LOCK:-$kc_repo_root/third_party/ffmpeg-runtime/macos-aarch64/source-lock.json}" "source lock path")"
kc_lock_dir="$(dirname -- "$kc_lock_path")"

[[ -f "$kc_lock_path" ]] || kc_fail "source lock is missing: $kc_lock_path"
[[ "$(uname -s)" == "Darwin" ]] || kc_fail "unsupported operating system: expected Darwin"
[[ "$(uname -m)" == "arm64" ]] || kc_fail "unsupported architecture: expected arm64"

for kc_command in curl make patch shasum tar xcrun otool lipo; do
  kc_require_command "$kc_command"
done
[[ -x "$kc_clang" ]] || kc_fail "required compiler is unavailable: $kc_clang"

kc_json_value() {
  "$kc_python" - "$kc_lock_path" "$1" <<'PY'
import json
import sys

value = json.load(open(sys.argv[1], encoding="utf-8"))
for part in sys.argv[2].split("."):
    value = value[part]
if isinstance(value, (dict, list)):
    raise SystemExit(f"expected scalar at {sys.argv[2]}")
print(value)
PY
}

kc_delivery_version="$(kc_json_value delivery.version)"
kc_deployment_target="$(kc_json_value target.minimum_deployment_target)"
kc_meson_version="$(kc_json_value build_tools.meson)"
kc_ninja_version="$(kc_json_value build_tools.ninja)"

kc_source_revision="source-bundle"
kc_git_dirty="false"
if git -C "$kc_repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  kc_head_revision="$(git -C "$kc_repo_root" rev-parse HEAD)"
  kc_git_status="$(git -C "$kc_repo_root" status --porcelain --untracked-files=normal)"
  kc_source_revision="$kc_head_revision"
  if [[ -n "$kc_git_status" ]]; then
    kc_source_revision="$kc_head_revision-dirty"
    kc_git_dirty="true"
  fi
fi
if [[ -n "${KOUBO_CLIP_SOURCE_REVISION:-}" ]]; then
  [[ "$KOUBO_CLIP_SOURCE_REVISION" =~ ^[0-9a-f]{40}$ ]] || kc_fail "KOUBO_CLIP_SOURCE_REVISION must be exactly 40 lowercase hexadecimal characters"
  [[ "$kc_source_revision" != "source-bundle" ]] || kc_fail "KOUBO_CLIP_SOURCE_REVISION requires a Git worktree"
  [[ "$kc_git_dirty" == "false" ]] || kc_fail "KOUBO_CLIP_SOURCE_REVISION requires a clean Git worktree"
  [[ "$KOUBO_CLIP_SOURCE_REVISION" == "$kc_source_revision" ]] || kc_fail "KOUBO_CLIP_SOURCE_REVISION does not match HEAD"
  kc_source_revision="$KOUBO_CLIP_SOURCE_REVISION"
fi

kc_build_anchor="$(kc_canonicalize_path "/private/tmp/koubo-ffmpeg-runtime-build/v1" "build staging anchor")"
mkdir -p "$kc_build_anchor"
[[ "$(kc_canonicalize_path "$kc_build_anchor" "build staging anchor")" == "$kc_build_anchor" ]] || kc_fail "build staging anchor changed during creation"
kc_build_root="$(kc_canonicalize_path "${KOUBO_FFMPEG_BUILD_ROOT:-$kc_build_anchor/macos-aarch64}" "KOUBO_FFMPEG_BUILD_ROOT")"
kc_assert_strict_descendant "$kc_build_root" "$kc_build_anchor" "KOUBO_FFMPEG_BUILD_ROOT"
kc_source_cache="$(kc_canonicalize_path "${KOUBO_FFMPEG_SOURCE_CACHE:-$kc_build_root/downloads}" "KOUBO_FFMPEG_SOURCE_CACHE")"
kc_runtime_output="$(kc_canonicalize_path "${KOUBO_FFMPEG_RUNTIME_OUTPUT:-$kc_repo_root/dist/box-runtime/macos-aarch64}" "KOUBO_FFMPEG_RUNTIME_OUTPUT")"
kc_assert_runtime_target "$kc_runtime_output" "$kc_repo_root"
kc_source_bundle="$(kc_canonicalize_path "${KOUBO_FFMPEG_SOURCE_BUNDLE:-$kc_repo_root/dist/box/koubo-clip-ffmpeg-sources-$kc_delivery_version.tar.xz}" "KOUBO_FFMPEG_SOURCE_BUNDLE")"
kc_assert_runtime_target "$kc_source_bundle" "$kc_repo_root"
[[ ! -e "$kc_source_bundle" || -f "$kc_source_bundle" ]] || kc_fail "KOUBO_FFMPEG_SOURCE_BUNDLE must be a file path"
kc_build_marker_value="koubo-clip ffmpeg build staging v1 path=$kc_build_root"
kc_runtime_marker_value="koubo-clip ffmpeg runtime output v1 path=$kc_runtime_output"
kc_release_base_url="${KOUBO_BOX_RELEASE_BASE_URL:-https://github.com/MarcusYuan/koubo-clip/releases/download/v$kc_delivery_version}"
kc_release_base_url="$($kc_python - "$kc_release_base_url" <<'PY'
import sys
import urllib.parse

raw = sys.argv[1]
url = urllib.parse.urlsplit(raw)
if url.scheme != "https" or not url.netloc or url.username or url.password or url.query or url.fragment:
    raise SystemExit("KOUBO_BOX_RELEASE_BASE_URL must be a credential-free HTTPS URL without query or fragment")
if ".." in [part for part in url.path.split("/") if part]:
    raise SystemExit("KOUBO_BOX_RELEASE_BASE_URL must not contain '..'")
print(raw.rstrip("/"))
PY
)"
kc_source_bundle_url="$kc_release_base_url/$(basename -- "$kc_source_bundle")"
kc_jobs="${KOUBO_FFMPEG_JOBS:-$(sysctl -n hw.logicalcpu 2>/dev/null || printf '4')}"

[[ "$kc_jobs" =~ ^[1-9][0-9]*$ ]] || kc_fail "KOUBO_FFMPEG_JOBS must be a positive integer"

kc_downloads="$kc_source_cache"
kc_sources="$kc_build_root/sources"
kc_prefix="$kc_build_root/prefix"
kc_venv="$kc_build_root/venv"
kc_source_stage="$kc_build_root/source-compliance/koubo-clip-ffmpeg-sources-$kc_delivery_version"

kc_remove_owned_tree "$kc_build_root" "$kc_build_marker_name" "$kc_build_marker_value"
mkdir -p "$kc_build_root"
printf '%s\n' "$kc_build_marker_value" > "$kc_build_root/$kc_build_marker_name"
mkdir -p "$kc_downloads" "$kc_sources" "$kc_prefix" "$kc_source_stage/sources" "$kc_source_stage/patches" "$kc_source_stage/licenses"
mkdir -p "$(dirname -- "$kc_runtime_output")" "$(dirname -- "$kc_source_bundle")"
[[ "$(kc_canonicalize_path "$kc_downloads" "source cache")" == "$kc_downloads" ]] || kc_fail "source cache changed during creation"
[[ "$(kc_canonicalize_path "$(dirname -- "$kc_runtime_output")" "runtime output parent")" == "$(dirname -- "$kc_runtime_output")" ]] || kc_fail "runtime output parent changed during creation"
[[ "$(kc_canonicalize_path "$(dirname -- "$kc_source_bundle")" "source bundle parent")" == "$(dirname -- "$kc_source_bundle")" ]] || kc_fail "source bundle parent changed during creation"

kc_expected_sha() {
  "$kc_python" - "$kc_lock_path" "$1" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    if source["id"] == sys.argv[2]:
        print(source["sha256"])
        break
else:
    raise SystemExit(f"unknown source: {sys.argv[2]}")
PY
}

kc_source_dir() {
  "$kc_python" - "$kc_lock_path" "$1" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    if source["id"] == sys.argv[2]:
        print(source["source_directory"])
        break
else:
    raise SystemExit(f"unknown source: {sys.argv[2]}")
PY
}

kc_fetch() {
  local kc_id="$1"
  local kc_archive="$2"
  local kc_url="$3"
  local kc_sha="$4"
  local kc_destination="$kc_downloads/$kc_archive"
  local kc_actual_sha=""

  if [[ -f "$kc_destination" ]]; then
    kc_actual_sha="$(shasum -a 256 "$kc_destination" | awk '{print $1}')"
    if [[ "$kc_actual_sha" != "$kc_sha" ]]; then
      rm -f "$kc_destination"
    fi
  fi
  if [[ ! -f "$kc_destination" ]]; then
    curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$kc_destination.part" "$kc_url"
    mv "$kc_destination.part" "$kc_destination"
  fi
  kc_actual_sha="$(shasum -a 256 "$kc_destination" | awk '{print $1}')"
  [[ "$kc_actual_sha" == "$kc_sha" ]] || kc_fail "$kc_id source checksum mismatch: expected $kc_sha, got $kc_actual_sha"
  cp "$kc_destination" "$kc_source_stage/sources/$kc_archive"
}

while IFS=$'\t' read -r kc_id kc_archive kc_url kc_sha; do
  kc_fetch "$kc_id" "$kc_archive" "$kc_url" "$kc_sha"
done < <("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    fields = [source["id"], source["archive"], source["url"], source["sha256"]]
    if any("\t" in value or "\n" in value for value in fields):
        raise SystemExit("source lock contains unsafe whitespace")
    print("\t".join(fields))
PY
)

while IFS=$'\t' read -r kc_id kc_kind kc_archive kc_source_directory; do
  case "$kc_kind" in
    source-archive)
      tar -xf "$kc_downloads/$kc_archive" -C "$kc_sources"
      ;;
    python-wheel)
      mkdir -p "$kc_sources/$kc_source_directory"
      "$kc_python" - "$kc_downloads/$kc_archive" "$kc_sources/$kc_source_directory" <<'PY'
import pathlib
import stat
import sys
import zipfile

archive_path = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2]).resolve()
with zipfile.ZipFile(archive_path) as archive:
    for entry in archive.infolist():
        target = (destination / entry.filename).resolve()
        if target != destination and destination not in target.parents:
            raise SystemExit(f"unsafe path in Python wheel: {entry.filename}")
        unix_mode = entry.external_attr >> 16
        if stat.S_ISLNK(unix_mode):
            raise SystemExit(f"symlink in Python wheel: {entry.filename}")
    archive.extractall(destination)
PY
      ;;
    *) kc_fail "$kc_id has unsupported locked source kind: $kc_kind" ;;
  esac
  [[ -d "$kc_sources/$kc_source_directory" ]] || kc_fail "$kc_id archive did not produce the locked source directory"
done < <("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    print("\t".join([source["id"], source["kind"], source["archive"], source["source_directory"]]))
PY
)

while IFS=$'\t' read -r kc_source_id kc_patch_path kc_patch_sha; do
  kc_patch_file="$kc_lock_dir/$kc_patch_path"
  [[ -f "$kc_patch_file" ]] || kc_fail "locked patch is missing: $kc_patch_file"
  kc_patch_actual_sha="$(shasum -a 256 "$kc_patch_file" | awk '{print $1}')"
  [[ "$kc_patch_actual_sha" == "$kc_patch_sha" ]] || kc_fail "patch checksum mismatch: $kc_patch_path"
  patch -d "$kc_sources/$(kc_source_dir "$kc_source_id")" -p1 --forward --batch < "$kc_patch_file"
  mkdir -p "$kc_source_stage/$(dirname -- "$kc_patch_path")"
  cp "$kc_patch_file" "$kc_source_stage/$kc_patch_path"
done < <("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    for patch in source.get("patches", []):
        print("\t".join([source["id"], patch["path"], patch["sha256"]]))
PY
)

kc_pkgconf_source="$kc_sources/$(kc_source_dir pkgconf)"
(
  cd "$kc_pkgconf_source"
  ./configure --prefix="$kc_prefix" --disable-shared --enable-static
  make -j"$kc_jobs"
  make install
)
ln -s pkgconf "$kc_prefix/bin/pkg-config"

export MACOSX_DEPLOYMENT_TARGET="$kc_deployment_target"
export PATH="$kc_prefix/bin:$kc_venv/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PKG_CONFIG_PATH="$kc_prefix/lib/pkgconfig"

kc_freetype_source="$kc_sources/$(kc_source_dir freetype)"
(
  cd "$kc_freetype_source"
  ./configure \
    --prefix="$kc_prefix" \
    --disable-shared \
    --enable-static \
    --with-zlib=no \
    --with-bzip2=no \
    --with-png=no \
    --with-brotli=no \
    --with-harfbuzz=no
  make -j"$kc_jobs"
  make install
)

kc_x264_source="$kc_sources/$(kc_source_dir x264)"
(
  cd "$kc_x264_source"
  ./configure \
    --prefix="$kc_prefix" \
    --enable-static \
    --disable-cli \
    --disable-opencl \
    --enable-pic
  make -j"$kc_jobs"
  make install
)

"$kc_python" -m venv "$kc_venv"
"$kc_venv/bin/python" -m pip install \
  --disable-pip-version-check \
  --no-index \
  --no-deps \
  "$kc_downloads/$("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys
lock = json.load(open(sys.argv[1], encoding="utf-8"))
print(next(source["archive"] for source in lock["sources"] if source["id"] == "meson"))
PY
)" \
  "$kc_downloads/$("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys
lock = json.load(open(sys.argv[1], encoding="utf-8"))
print(next(source["archive"] for source in lock["sources"] if source["id"] == "ninja"))
PY
)"
[[ "$($kc_venv/bin/meson --version)" == "$kc_meson_version" ]] || kc_fail "installed Meson version does not match source lock"
[[ "$("$kc_venv/bin/python" -c 'import importlib.metadata; print(importlib.metadata.version("meson"))')" == "$kc_meson_version" ]] || kc_fail "installed Meson package version does not match source lock"
[[ "$("$kc_venv/bin/python" -c 'import importlib.metadata; print(importlib.metadata.version("ninja"))')" == "$kc_ninja_version" ]] || kc_fail "installed Ninja package version does not match source lock"
[[ "$($kc_venv/bin/ninja --version)" == 1.11.1* ]] || kc_fail "installed Ninja version does not match source lock"

kc_harfbuzz_source="$kc_sources/$(kc_source_dir harfbuzz)"
(
  cd "$kc_harfbuzz_source"
  "$kc_venv/bin/meson" setup build \
    --prefix="$kc_prefix" \
    --default-library=static \
    -Dbenchmark=disabled \
    -Dcairo=disabled \
    -Dchafa=disabled \
    -Ddocs=disabled \
    -Dfreetype=enabled \
    -Dglib=disabled \
    -Dgobject=disabled \
    -Dgraphite=disabled \
    -Dgraphite2=disabled \
    -Dicu=disabled \
    -Dtests=disabled \
    -Dutilities=disabled
  "$kc_venv/bin/meson" compile -C build
  "$kc_venv/bin/meson" install -C build
)

kc_ffmpeg_source="$kc_sources/$(kc_source_dir ffmpeg)"
kc_ffmpeg_configure=(
  "--prefix=$kc_prefix"
  "--arch=arm64"
  "--cc=$kc_clang"
  "--enable-gpl"
  "--disable-nonfree"
  "--enable-libx264"
  "--enable-libfreetype"
  "--enable-libharfbuzz"
  "--enable-static"
  "--disable-shared"
  "--disable-doc"
  "--disable-debug"
  "--disable-ffplay"
  "--disable-sdl2"
  "--disable-autodetect"
  "--enable-audiotoolbox"
  "--enable-videotoolbox"
  "--enable-pthreads"
  "--enable-zlib"
  "--pkg-config=$kc_prefix/bin/pkgconf"
  "--pkg-config-flags=--static"
  "--extra-cflags=-I$kc_prefix/include"
  "--extra-ldflags=-L$kc_prefix/lib"
)
(
  cd "$kc_ffmpeg_source"
  ./configure "${kc_ffmpeg_configure[@]}"
  make -j"$kc_jobs"
  make install
)

kc_ffmpeg="$kc_prefix/bin/ffmpeg"
kc_ffprobe="$kc_prefix/bin/ffprobe"
[[ -x "$kc_ffmpeg" ]] || kc_fail "FFmpeg build did not produce an executable"
[[ -x "$kc_ffprobe" ]] || kc_fail "ffprobe build did not produce an executable"
[[ "$(lipo -archs "$kc_ffmpeg")" == "arm64" ]] || kc_fail "FFmpeg is not an arm64-only executable"
[[ "$(lipo -archs "$kc_ffprobe")" == "arm64" ]] || kc_fail "ffprobe is not an arm64-only executable"

kc_version_output="$($kc_ffmpeg -version)"
for kc_required_flag in \
  --enable-gpl \
  --disable-nonfree \
  --enable-libx264 \
  --enable-libfreetype \
  --enable-libharfbuzz \
  --enable-static \
  --disable-shared; do
  [[ "$kc_version_output" == *"$kc_required_flag"* ]] || kc_fail "FFmpeg is missing required configure flag: $kc_required_flag"
done
[[ "$kc_version_output" != *"--enable-nonfree"* ]] || kc_fail "FFmpeg contains forbidden configure flag: --enable-nonfree"
kc_filters_output="$($kc_ffmpeg -hide_banner -filters 2>/dev/null)"
kc_encoders_output="$($kc_ffmpeg -hide_banner -encoders 2>/dev/null)"
grep -Eq '(^|[[:space:]])drawtext([[:space:]]|$)' <<< "$kc_filters_output" || kc_fail "FFmpeg drawtext filter is unavailable"
grep -Eq '(^|[[:space:]])libx264([[:space:]]|$)' <<< "$kc_encoders_output" || kc_fail "FFmpeg libx264 encoder is unavailable"
grep -Eq '(^|[[:space:]])aac([[:space:]]|$)' <<< "$kc_encoders_output" || kc_fail "FFmpeg AAC encoder is unavailable"

kc_check_dynamic_dependencies() {
  local kc_binary="$1"
  local kc_dependency=""
  while IFS= read -r kc_dependency; do
    kc_dependency="${kc_dependency#${kc_dependency%%[![:space:]]*}}"
    [[ -z "$kc_dependency" ]] && continue
    [[ "$kc_dependency" == "$kc_binary:" ]] && continue
    kc_dependency="${kc_dependency%% *}"
    case "$kc_dependency" in
      /usr/lib/*|/System/Library/*) ;;
      *) kc_fail "non-system dynamic dependency in $(basename -- "$kc_binary"): $kc_dependency" ;;
    esac
  done < <(otool -L "$kc_binary")
}

kc_check_dynamic_dependencies "$kc_ffmpeg"
kc_check_dynamic_dependencies "$kc_ffprobe"

kc_runtime_parent="$(dirname -- "$kc_runtime_output")"
[[ "$(kc_canonicalize_path "$kc_runtime_parent" "runtime output parent")" == "$kc_runtime_parent" ]] || kc_fail "runtime output parent changed before publication"
kc_runtime_stage="$(mktemp -d "$kc_runtime_parent/.koubo-ffmpeg-runtime-stage.XXXXXX")"
kc_source_bundle_tmp=""
printf '%s\n' "$kc_runtime_marker_value" > "$kc_runtime_stage/$kc_runtime_marker_name"
kc_cleanup_runtime_stage() {
  if [[ -n "${kc_runtime_stage:-}" ]] && kc_marker_matches "$kc_runtime_stage" "$kc_runtime_marker_name" "$kc_runtime_marker_value"; then
    rm -rf -- "$kc_runtime_stage"
  fi
  if [[ -n "${kc_source_bundle_tmp:-}" && -f "$kc_source_bundle_tmp" && ! -L "$kc_source_bundle_tmp" ]]; then
    rm -f -- "$kc_source_bundle_tmp"
  fi
}
trap kc_cleanup_runtime_stage EXIT

mkdir -p "$kc_runtime_stage/bin" "$kc_runtime_stage/evidence/licenses"
install -m 0755 "$kc_ffmpeg" "$kc_runtime_stage/bin/ffmpeg"
install -m 0755 "$kc_ffprobe" "$kc_runtime_stage/bin/ffprobe"

printf '%s\n' "$kc_version_output" > "$kc_runtime_stage/evidence/ffmpeg-version.txt"
"$kc_ffprobe" -version > "$kc_runtime_stage/evidence/ffprobe-version.txt"
printf '%s\n' "$kc_filters_output" > "$kc_runtime_stage/evidence/ffmpeg-filters.txt"
printf '%s\n' "$kc_encoders_output" > "$kc_runtime_stage/evidence/ffmpeg-encoders.txt"
otool -L "$kc_ffmpeg" > "$kc_runtime_stage/evidence/otool-ffmpeg.txt"
otool -L "$kc_ffprobe" > "$kc_runtime_stage/evidence/otool-ffprobe.txt"
printf '%s\n' "${kc_ffmpeg_configure[@]}" > "$kc_runtime_stage/evidence/configure-args.txt"
{
  printf 'source_revision=%s\n' "$kc_source_revision"
  printf 'git_dirty=%s\n' "$kc_git_dirty"
  printf 'macos_version=%s\n' "$(sw_vers -productVersion)"
  printf 'deployment_target=%s\n' "$MACOSX_DEPLOYMENT_TARGET"
  printf 'xcode_version=%s\n' "$(xcodebuild -version 2>/dev/null | tr '\n' ' ')"
  printf 'sdk_path=%s\n' "$(xcrun --show-sdk-path)"
  printf 'compiler=%s\n' "$($kc_clang --version | head -1)"
  printf 'python=%s\n' "$($kc_python --version 2>&1)"
  printf 'meson=%s\n' "$($kc_venv/bin/meson --version)"
  printf 'ninja=%s\n' "$($kc_venv/bin/ninja --version)"
} > "$kc_runtime_stage/evidence/build-environment.txt"

cp "$kc_lock_path" "$kc_runtime_stage/evidence/source-lock.json"
cp "$kc_script_path" "$kc_runtime_stage/evidence/build-box-ffmpeg-runtime.sh"
mkdir -p "$kc_runtime_stage/evidence/patches"
cp "$kc_lock_dir/patches/harfbuzz-8.3.0-macos-sincosf.patch" "$kc_runtime_stage/evidence/patches/"

kc_copy_license() {
  local kc_source_id="$1"
  local kc_relative_path="$2"
  local kc_license_dir="$kc_runtime_stage/evidence/licenses/$kc_source_id"
  local kc_source_file="$kc_sources/$(kc_source_dir "$kc_source_id")/$kc_relative_path"
  [[ -f "$kc_source_file" ]] || kc_fail "locked license file is missing: $kc_source_id/$kc_relative_path"
  mkdir -p "$kc_license_dir/$(dirname -- "$kc_relative_path")"
  cp "$kc_source_file" "$kc_license_dir/$kc_relative_path"
  mkdir -p "$kc_source_stage/licenses/$kc_source_id/$(dirname -- "$kc_relative_path")"
  cp "$kc_source_file" "$kc_source_stage/licenses/$kc_source_id/$kc_relative_path"
}

while IFS=$'\t' read -r kc_source_id kc_license_path; do
  kc_copy_license "$kc_source_id" "$kc_license_path"
done < <("$kc_python" - "$kc_lock_path" <<'PY'
import json
import sys

lock = json.load(open(sys.argv[1], encoding="utf-8"))
for source in lock["sources"]:
    for path in source["license_files"]:
        print("\t".join([source["id"], path]))
PY
)

cp "$kc_lock_path" "$kc_source_stage/SOURCE_MANIFEST.json"
cp "$kc_script_path" "$kc_source_stage/BUILD.sh"
chmod 0755 "$kc_source_stage/BUILD.sh"
cat > "$kc_source_stage/README.txt" <<EOF
This archive contains the complete, checksum-locked source inputs and build
recipe corresponding to the Koubo Clip $kc_delivery_version macOS aarch64
FFmpeg runtime. It includes the upstream source archives without modification,
the applied patch, and the license/copyright texts copied from those sources.

Rebuild on macOS aarch64 with Apple Command Line Tools. All upstream and Python
build-tool inputs are included in this archive and installed without network access:

  KOUBO_FFMPEG_SOURCE_LOCK=\"\$PWD/SOURCE_MANIFEST.json\" \\
  KOUBO_FFMPEG_SOURCE_CACHE=\"\$PWD/sources\" \\
  KOUBO_FFMPEG_RUNTIME_OUTPUT=\"\$PWD/out/macos-aarch64\" \\
  KOUBO_FFMPEG_SOURCE_BUNDLE=\"\$PWD/out/koubo-clip-ffmpeg-sources-$kc_delivery_version.tar.xz\" \\
  ./BUILD.sh

The script rejects non-macOS/non-aarch64 hosts, source or patch checksum
mismatches, forbidden --enable-nonfree builds, missing codecs/filters, and
non-system dynamic library dependencies.
EOF

find "$kc_source_stage" -type l -print -quit | grep -q . && kc_fail "source compliance staging tree contains a symlink"

kc_source_bundle_tmp="$(mktemp "$(dirname -- "$kc_source_bundle")/.koubo-ffmpeg-sources.XXXXXX")"
"$kc_python" - "$kc_source_stage" "$kc_source_bundle_tmp" <<'PY'
import os
import pathlib
import tarfile
import sys

source = pathlib.Path(sys.argv[1])
output = pathlib.Path(sys.argv[2])

def normalized(info):
    info.uid = 0
    info.gid = 0
    info.uname = "root"
    info.gname = "wheel"
    info.mtime = 0
    if info.isdir():
        info.mode = 0o755
    elif info.name.endswith("/BUILD.sh"):
        info.mode = 0o755
    else:
        info.mode = 0o644
    return info

with tarfile.open(output, "w:xz") as archive:
    archive.add(source, arcname=source.name, recursive=False, filter=normalized)
    for path in sorted(source.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise SystemExit(f"refusing symlink in source bundle: {path}")
        archive.add(path, arcname=f"{source.name}/{path.relative_to(source)}", recursive=False, filter=normalized)
PY
mv "$kc_source_bundle_tmp" "$kc_source_bundle"
kc_source_bundle_tmp=""

"$kc_python" - \
  "$kc_lock_path" \
  "$kc_runtime_stage" \
  "$kc_source_bundle" \
  "$kc_source_bundle_url" \
  "$kc_source_revision" \
  "$kc_git_dirty" <<'PY'
import hashlib
import json
import os
import pathlib
import stat
import sys

lock_path = pathlib.Path(sys.argv[1])
runtime_root = pathlib.Path(sys.argv[2])
source_bundle = pathlib.Path(sys.argv[3])
source_bundle_url = sys.argv[4]
source_revision = sys.argv[5]
git_dirty = sys.argv[6] == "true"
lock = json.loads(lock_path.read_text(encoding="utf-8"))

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def file_record(path, relative_to):
    return {
        "path": path.relative_to(relative_to).as_posix(),
        "size_bytes": path.stat().st_size,
        "sha256": sha256(path),
        "mode": format(stat.S_IMODE(path.stat().st_mode), "04o"),
    }

binaries = []
for name, role in (("ffmpeg", "media-runtime"), ("ffprobe", "media-inspector")):
    record = file_record(runtime_root / "bin" / name, runtime_root)
    record["role"] = role
    binaries.append(record)

licenses = []
license_root = runtime_root / "evidence" / "licenses"
expected_license_paths = {
    pathlib.PurePosixPath("evidence", "licenses", source["id"], license_path).as_posix()
    for source in lock["sources"]
    for license_path in source["license_files"]
}
actual_license_paths = {
    path.relative_to(runtime_root).as_posix()
    for path in license_root.rglob("*")
    if path.is_file() and not path.is_symlink()
}
if actual_license_paths != expected_license_paths:
    missing = sorted(expected_license_paths - actual_license_paths)
    extra = sorted(actual_license_paths - expected_license_paths)
    raise SystemExit(f"license evidence mismatch; missing={missing}, extra={extra}")
if any(path.is_symlink() for path in license_root.rglob("*")):
    raise SystemExit("license evidence must not contain symlinks")
for path in sorted(license_root.rglob("*")):
    if path.is_file():
        licenses.append(file_record(path, runtime_root))

configure_args = (runtime_root / "evidence" / "configure-args.txt").read_text(encoding="utf-8").splitlines()
evidence = {
    "contract_version": "1",
    "delivery": lock["delivery"],
    "target": lock["target"],
    "source_revision": source_revision,
    "git_dirty": git_dirty,
    "build": {
        "compiler": lock["build_tools"]["compiler"],
        "deployment_target": lock["target"]["minimum_deployment_target"],
        "configure_args": configure_args,
        "environment_evidence": "evidence/build-environment.txt",
    },
    "sources": lock["sources"],
    "binaries": binaries,
    "license_evidence": licenses,
    "source_bundle": {
        "path": source_bundle.name,
        "url": source_bundle_url,
        "size_bytes": source_bundle.stat().st_size,
        "sha256": sha256(source_bundle),
    },
    "assertions": {
        "gpl_enabled": True,
        "nonfree_disabled": True,
        "libx264_enabled": True,
        "libfreetype_enabled": True,
        "libharfbuzz_enabled": True,
        "drawtext_available": True,
        "aac_encoder_available": True,
        "libx264_encoder_available": True,
        "only_system_dynamic_dependencies": True,
    },
}
(runtime_root / "evidence" / "build-evidence.json").write_text(
    json.dumps(evidence, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

kc_publish_owned_directory "$kc_runtime_stage" "$kc_runtime_output" "$kc_runtime_marker_name" "$kc_runtime_marker_value"
kc_runtime_stage=""

printf 'FFmpeg runtime: %s\n' "$kc_runtime_output"
printf 'Source bundle: %s\n' "$kc_source_bundle"
printf 'FFmpeg sha256: %s\n' "$(shasum -a 256 "$kc_runtime_output/bin/ffmpeg" | awk '{print $1}')"
printf 'ffprobe sha256: %s\n' "$(shasum -a 256 "$kc_runtime_output/bin/ffprobe" | awk '{print $1}')"
printf 'Source bundle sha256: %s\n' "$(shasum -a 256 "$kc_source_bundle" | awk '{print $1}')"
