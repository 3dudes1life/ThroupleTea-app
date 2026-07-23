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
with entitlements.open("wb") as handle:
    plistlib.dump(
        {"com.apple.developer.group-session": True},
        handle,
        fmt=plistlib.FMT_XML,
        sort_keys=True,
    )

text = project.read_text(encoding="utf-8")

# Add the entitlement path to both App target configurations.
if "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" not in text:
    text = text.replace(
        "CODE_SIGN_STYLE = Automatic;",
        "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n"
        "\t\t\t\tCODE_SIGN_STYLE = Automatic;"
    )

# Mark Group Activities as an enabled system capability in the target metadata.
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

print("✅ Group Activities entitlement configured.")
print("✅ Throuple Tea Watch Party native bridge ready.")
