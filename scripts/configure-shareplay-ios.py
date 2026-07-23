#!/usr/bin/env python3
from pathlib import Path
import plistlib
import re
import sys

root = Path(__file__).resolve().parents[1]
ios_app = root / "ios" / "App"
project = ios_app / "App.xcodeproj" / "project.pbxproj"
entitlements = ios_app / "App" / "App.entitlements"

if not project.exists():
    print("❌ iOS Xcode project was not found. Run npx cap add ios first.")
    sys.exit(1)

entitlements.parent.mkdir(parents=True, exist_ok=True)

# Merge instead of replace. This preserves APNs, associated domains,
# Sign in with Apple, and any other entitlements added later.
existing = {}
if entitlements.exists():
    try:
        with entitlements.open("rb") as handle:
            loaded = plistlib.load(handle)
            if isinstance(loaded, dict):
                existing = loaded
    except Exception as exc:
        print(f"⚠️ Existing entitlements could not be read: {exc}")

existing["com.apple.developer.group-session"] = True

with entitlements.open("wb") as handle:
    plistlib.dump(
        existing,
        handle,
        fmt=plistlib.FMT_XML,
        sort_keys=True,
    )

text = project.read_text(encoding="utf-8")

if "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" not in text:
    text = text.replace(
        "CODE_SIGN_STYLE = Automatic;",
        "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n"
        "\t\t\t\tCODE_SIGN_STYLE = Automatic;"
    )

if "com.apple.GroupActivities" not in text:
    target_match = re.search(
        r'(ProvisioningStyle = Automatic;\n)(\s*};\n\s*};\n\s*};)',
        text
    )
    if target_match:
        capability = (
            target_match.group(1)
            + "\t\t\t\t\tSystemCapabilities = {\n"
            + "\t\t\t\t\t\tcom.apple.GroupActivities = {\n"
            + "\t\t\t\t\t\t\tenabled = 1;\n"
            + "\t\t\t\t\t\t};\n"
            + "\t\t\t\t\t};\n"
            + target_match.group(2)
        )
        text = text[:target_match.start()] + capability + text[target_match.end():]

project.write_text(text, encoding="utf-8")

print("✅ Existing iOS entitlements preserved.")
print("✅ Group Activities entitlement configured.")
print("✅ Throuple Tea Watch Party native bridge ready.")
