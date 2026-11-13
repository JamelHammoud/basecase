#!/bin/sh
set -eu
cd "$(dirname "$0")"
device=$(xcrun simctl list devices available | grep -m1 -oE 'iPhone[^(]*\([0-9A-F-]{36}\)' | grep -oE '[0-9A-F-]{36}')
exec xcodebuild test -project BasecaseScan.xcodeproj -scheme BasecaseScan -destination "id=$device" CODE_SIGNING_ALLOWED=NO "$@"
