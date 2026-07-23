#!/usr/bin/env python3
"""Preserve entitlements and enable the native Group Activities capability."""
from pathlib import Path
import os
import plistlib
import re
import sys

root = Path(os.environ.get("THROUPLETEA_PROJECT_ROOT", Path(__file__).resolve().parents[1])).resolve()
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
    plistlib.dump(existing, handle, fmt=plistlib.FMT_XML, sort_keys=True)

text = project.read_text(encoding="utf-8")

# Add the entitlements file to every automatically signed app configuration.
if "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" not in text:
    text = re.sub(
        r"(?m)^(\s*)CODE_SIGN_STYLE = Automatic;",
        r"\1CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\1CODE_SIGN_STYLE = Automatic;",
        text,
    )

# Xcode records the UI capability under the app target's TargetAttributes.
# Insert directly after the first automatic provisioning line; this is stable
# across current Capacitor/Xcode project templates and avoids brittle brace counting.
if "com.apple.GroupActivities" not in text:
    capability = (
        "\n"
        "\t\t\t\t\tSystemCapabilities = {\n"
        "\t\t\t\t\t\tcom.apple.GroupActivities = {\n"
        "\t\t\t\t\t\t\tenabled = 1;\n"
        "\t\t\t\t\t\t};\n"
        "\t\t\t\t\t};"
    )
    text, count = re.subn(
        r"(ProvisioningStyle = Automatic;)",
        r"\1" + capability,
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("❌ Could not locate the Xcode target provisioning settings for Group Activities.")

project.write_text(text, encoding="utf-8")

# Fail loudly instead of telling the user the native setup succeeded when it did not.
with entitlements.open("rb") as handle:
    check_entitlements = plistlib.load(handle)
check_project = project.read_text(encoding="utf-8")
if check_entitlements.get("com.apple.developer.group-session") is not True:
    raise SystemExit("❌ Group Activities entitlement did not persist.")
if "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" not in check_project:
    raise SystemExit("❌ Xcode is not linked to App.entitlements.")
if "com.apple.GroupActivities" not in check_project or "enabled = 1;" not in check_project:
    raise SystemExit("❌ Group Activities capability did not persist in the Xcode project.")

print("✅ Existing iOS entitlements preserved.")
print("✅ Group Activities entitlement configured and verified.")
print("✅ Throuple Tea Watch Party native bridge ready.")
