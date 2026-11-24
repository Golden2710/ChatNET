#!/usr/bin/env bash
# Boots two emulators and makes the real app on each one chat with the other.
# Emulators reach the host at 10.0.2.2; a relay there forwards to whichever device
# should receive next and records the traffic to prove it is encrypted.
set -euo pipefail

A=emulator-5554
B=emulator-5556
OUT=e2e-output
APK=android/app/build/outputs/apk/release/app-release.apk
IMAGE="system-images;android-34;default;x86_64"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
export ANDROID_AVD_HOME="$HOME/.android/avd"
mkdir -p "$OUT" "$ANDROID_AVD_HOME"

PIDS=()
trap 'kill "${PIDS[@]}" 2>/dev/null || true; adb -s "$A" emu kill 2>/dev/null || true; adb -s "$B" emu kill 2>/dev/null || true' EXIT

yes | sdkmanager --licenses >/dev/null || true
sdkmanager "emulator" "platform-tools" "$IMAGE" >/dev/null

boot() { # name port serial
  echo no | avdmanager create avd --force -n "$1" -k "$IMAGE" -d pixel_2 >/dev/null
  emulator -avd "$1" -port "$2" -no-window -no-snapshot -wipe-data -no-boot-anim -noaudio \
    -gpu swiftshader_indirect -camera-back none -camera-front none -cores 2 -memory 3072 \
    -partition-size 2048 > "$OUT/emulator-$1.log" 2>&1 &
  local emulator_pid=$!
  PIDS+=("$emulator_pid")
  local waited=0
  until [ "$(adb -s "$3" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if ! kill -0 "$emulator_pid" 2>/dev/null; then
      echo "Emulator $1 exited during boot:" >&2
      tail -20 "$OUT/emulator-$1.log" >&2
      exit 1
    fi
    waited=$((waited + 5))
    if [ "$waited" -ge 600 ]; then
      echo "Emulator $1 did not boot in 600s" >&2
      exit 1
    fi
    sleep 5
  done
  echo "Emulator $1 booted after ${waited}s"
  for k in window_animation_scale transition_animation_scale animator_duration_scale; do
    adb -s "$3" shell settings put global "$k" 0
  done
  adb -s "$3" shell settings put global hide_error_dialogs 1
  adb -s "$3" install -r "$APK"
  adb -s "$3" logcat -c
  adb -s "$3" logcat > "$OUT/logcat-$1.txt" &
  PIDS+=($!)
}

STEP=0
flow() { # serial file [KEY=VALUE...]
  local serial=$1 file=$2; shift 2
  local args=()
  for kv in "$@"; do args+=(-e "$kv"); done
  STEP=$((STEP + 1))
  echo "=== [$STEP] $serial: $file $*"
  maestro --device "$serial" test ${args[@]+"${args[@]}"} \
    --debug-output "$OUT/debug-$(printf %02d $STEP)-${serial}" "e2e/two/$file.yaml"
}

route_to() { # serial that should receive the next connection
  adb -s "$A" forward --remove tcp:18888 2>/dev/null || true
  adb -s "$B" forward --remove tcp:18888 2>/dev/null || true
  adb -s "$1" forward tcp:18888 tcp:8888
}

boot chatnet-a 5554 "$A"
boot chatnet-b 5556 "$B"
node e2e/relay.cjs "$OUT/network-capture.bin" &
PIDS+=($!)

flow "$A" setup NAME=PhoneA
flow "$B" setup NAME=PhoneB

echo "--- A -> B"
route_to "$B"
flow "$A" send "TEXT=hello from phone A"
flow "$B" expect "TEXT=hello from phone A" FROM=PhoneA

echo "--- B -> A"
route_to "$A"
flow "$B" send "TEXT=reply from phone B"
flow "$A" expect "TEXT=reply from phone B" FROM=PhoneB

echo "--- Image from the gallery, A -> B"
adb -s "$A" push assets/Logo.jpg /sdcard/Pictures/e2e-photo.jpg
adb -s "$A" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/e2e-photo.jpg
route_to "$B"
flow "$A" send-image
flow "$B" expect-image

for method in RSA DES Caesar AES; do
  echo "--- Cipher $method, A -> B"
  flow "$A" set-method "METHOD=$method"
  flow "$B" set-method "METHOD=$method"
  flow "$A" send "TEXT=cipher check $method"
  flow "$B" expect "TEXT=cipher check $method" FROM=PhoneA
done

echo "--- Wrong key must not reveal the message"
flow "$B" set-key KEY=WrongKey1
flow "$A" send "TEXT=top secret words"
flow "$B" expect-decrypt-failure "TEXT=top secret words"

sleep 1
if grep -aiE "hello from phone|reply from phone|cipher check|top secret" "$OUT/network-capture.bin"; then
  echo "Plaintext found in network traffic" >&2
  exit 1
fi
echo "Network capture: $(wc -c < "$OUT/network-capture.bin") bytes, no plaintext"

if grep -hE "FATAL EXCEPTION|ReactNativeJS.*(Error|Invariant)" "$OUT"/logcat-*.txt; then
  echo "App logged a fatal error" >&2
  exit 1
fi
echo "Two-device E2E passed"
