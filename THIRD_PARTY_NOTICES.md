# Third-Party Notices

koubo-clip itself is licensed under the MIT License. Third-party dependencies,
vendored resources, generated user assets, and CDN runtimes keep their own
licenses.

## Runtime Dependency

- `gsap` is distributed by GreenSock/Webflow under the Standard "No Charge"
  GSAP License: https://gsap.com/standard-license

## Box Managed FFmpeg Runtime

The macOS aarch64 Plugin Box CLI artifact includes a separately built FFmpeg
and ffprobe runtime. That runtime is built with GPL support and x264, and is
not covered by koubo-clip's MIT license. The artifact carries the exact
license and copyright texts, source lock, build recipe, configure output, and
binary-to-source evidence under `licenses/ffmpeg-runtime/`.

The matching GitHub Release publishes
`koubo-clip-ffmpeg-sources-<version>.tar.xz` next to the Box CLI artifact. It
contains the locked FFmpeg, x264, FreeType, HarfBuzz, and pkgconf source
archives, the checksum-locked Meson/Ninja build-tool distributions, local
patches, build recipe, and license texts. The exact release-asset digest is
also bound by the Box CLI descriptor and FFmpeg build evidence. See
`docs/box-packaging.md` for the machine-verification procedure.

Every Box CLI artifact also carries a versioned machine-readable source offer
at `licenses/ffmpeg-runtime/SOURCE_OFFER.json`. It records the direct HTTPS URL,
byte size, and SHA-256 of that same-release corresponding-source asset.

These records provide auditable engineering evidence for the selected
distribution path; they are not a legal conclusion.

## Vendored Resources

- HyperFrames resources under `packages/cli/vendor/hyperframes/` are adapted
  from `heygen-com/hyperframes`, licensed under Apache-2.0:
  https://github.com/heygen-com/hyperframes
- `packages/cli/vendor/hyperframes/resources/talking-head-recut/NOTICE.md`
  retains the MIT notice for the upstream `vtake-skills` work it adapts.
- `packages/cli/vendor/hyperframes/resources/hyperframes-media/assets/sfx/`
  includes sound effects from Pixabay under the Pixabay Content License; see
  the local `CREDITS.md` file in that directory.
- `packages/cli/vendor/hyperframes/registry/examples/vscode-theme-visualizer/assets/vscode-themes/`
  includes VS Code theme JSON files under the Microsoft MIT License; see the
  local `LICENSE` file in that directory.

## References Only

`easy-video`, `video-use`, and `OpenMontage` are referenced in docs as design
inspiration. They are not bundled dependencies of koubo-clip.
