#!/usr/bin/env python3
"""Offline source/package sanity checks; not a substitute for macOS compilation."""
import json
import tomllib
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
json_paths=['package.json', 'tsconfig.json', 'src-tauri/tauri.conf.json','src-tauri/capabilities/default.json']
for rel in json_paths:
    json.loads((ROOT/rel).read_text())
    print(f'PASS JSON {rel}')
with (ROOT/'src-tauri/Cargo.toml').open('rb') as f:
    cfg=tomllib.load(f)
assert cfg['package']['name'] == 'nsight-macos'
print('PASS TOML src-tauri/Cargo.toml')
for rel in ['src/App.tsx','src/styles.css','public/nsight-avatar.webp','public/nsight-avatar-source.png','public/nsight-avatar.png','src-tauri/icons/icon.icns','src-tauri/src/mcp.rs','src-tauri/src/qwen.rs']:
    assert (ROOT/rel).stat().st_size > 0, rel
    print('PASS exists',rel)
app=(ROOT/'src/App.tsx').read_text()
backend=(ROOT/'src-tauri/src/config.rs').read_text()
for item in ['send_chat', 'discover_mcp_tools', 'save_settings', 'test_mcp', 'test_qwen']:
    assert item in app, item
for item in ['macOS Keychain', 'permitted_tools', 'validate_url']:
    assert item in (ROOT/'README.md').read_text() + backend, item
assert 'new_mcp_token' not in (ROOT/'src-tauri/tauri.conf.json').read_text()
print('PASS UI commands and backend settings guards')
assert 'DESKTOP PET' not in app
assert 'COMPANION READY' not in app
assert 'LOCAL MISSION ANALYST' not in app
assert 'TACTICAL INTELLIGENCE · EDGE ANALYSIS' in app
assert 'MISSION EDGESIGHT / LOCAL AI' in app
assert 'nSIght <span>' not in app
assert json.loads((ROOT/'src-tauri/tauri.conf.json').read_text())['productName'] == 'nSIght'
print('PASS requested branding and image replacements')
print('Static source checks passed. Run `npm run tauri build` on macOS to validate Rust/TypeScript compilation.')
