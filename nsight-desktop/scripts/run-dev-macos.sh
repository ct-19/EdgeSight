#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then echo "Run on macOS." >&2; exit 1; fi
# rustup commonly installs cargo here before shell profile files are updated.
if [[ -f "$HOME/.cargo/env" ]]; then source "$HOME/.cargo/env"; fi
if ! command -v cargo >/dev/null 2>&1; then
  echo 'Cargo (Rust) is missing. Install from https://rustup.rs/, then run: source "$HOME/.cargo/env"' >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then echo "Node.js/npm is missing. Install Node.js 22+." >&2; exit 1; fi
if ! xcrun --find clang >/dev/null 2>&1; then
  echo "Xcode Command Line Tools missing. Run: xcode-select --install" >&2; exit 1
fi
if [[ ! -d node_modules ]]; then npm install; fi
npm run tauri dev
