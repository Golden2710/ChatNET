#!/usr/bin/env bash
# Drives the release APK on a running emulator. Run from the repository root.
set -euo pipefail

APK=android/app/build/outputs/apk/release/app-release.apk
OUT=e2e-output
mkdir -p "$OUT"

# Slow CI emulators raise ANR dialogs for system apps that would cover the UI
adb shell settings put global hide_error_dialogs 1
adb shell pm grant com.google.android.inputmethod.latin android.permission.RECORD_AUDIO || true
sleep 30

adb install -r "$APK"
adb logcat -c
adb logcat > "$OUT/logcat.txt" &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT

# 1. UI + send to self over real TCP with every cipher
maestro test --debug-output "$OUT/debug-chat" e2e/01-chat.yaml

# 2. A second "device" (this host) sends framed, AES-encrypted data to the app
adb forward tcp:8888 tcp:8888
npx --yes esbuild@0.24.0 e2e/peer.cts --bundle --platform=node --log-level=warning --outfile="$OUT/peer.cjs"
node "$OUT/peer.cjs" text
maestro test --debug-output "$OUT/debug-peer-text" e2e/02-peer-text.yaml
adb forward --list
node "$OUT/peer.cjs" image
maestro test --debug-output "$OUT/debug-peer-image" e2e/03-peer-image.yaml

adb shell pidof com.chatnet >/dev/null
sleep 1
if grep -E "FATAL EXCEPTION|ReactNativeJS.*(Error|Invariant)" "$OUT/logcat.txt"; then
  echo "App logged a fatal error" >&2
  exit 1
fi
echo "E2E passed"
