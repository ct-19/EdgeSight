#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then echo "This build script must run on macOS." >&2; exit 1; fi
if [[ -f "$HOME/.cargo/env" ]]; then source "$HOME/.cargo/env"; fi
for cmd in node npm rustc cargo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing $cmd. Install Rust (https://rustup.rs/) and Node.js 22+." >&2; exit 1
  fi
done
if ! xcrun --find clang >/dev/null 2>&1; then
  echo "Install Xcode Command Line Tools: xcode-select --install" >&2; exit 1
fi
if [[ ! -d node_modules ]]; then npm install; fi
npm run tauri build
printf '\nBuilt bundles:\n'
find src-tauri/target/release/bundle -maxdepth 2 \( -name '*.app' -o -name '*.dmg' \) -print
