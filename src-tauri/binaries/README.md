# iPerf3 Sidecar Binary

This directory should contain the iPerf3 binary for the Tauri sidecar.

## Required files

For macOS (Apple Silicon):
- `iperf3-aarch64-apple-darwin`

For macOS (Intel):
- `iperf3-x86_64-apple-darwin`

## How to install

### Option 1: Homebrew (recommended)
```bash
brew install iperf3
cp $(brew --prefix iperf3)/bin/iperf3 src-tauri/binaries/iperf3-aarch64-apple-darwin
```

### Option 2: Download from iperf.fr
Download iPerf3 3.14+ from https://iperf.fr/iperf-download.php
and place the binary here with the correct Tauri naming convention.
