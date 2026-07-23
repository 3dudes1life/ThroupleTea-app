#!/usr/bin/env python3
from pathlib import Path
import json
import os
import plistlib
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
package = json.loads((root / "package.json").read_text())
assert package["dependencies"].get("throuple-watch-party") == "file:plugins/throuple-watch-party"
plugin = root / "plugins/throuple-watch-party"
swift = (plugin / "ios/Sources/ThroupleWatchPartyPlugin/ThroupleWatchPartyPlugin.swift").read_text()
for token in (
    "CAPBridgedPlugin",
    'jsName = "ThroupleWatchParty"',
    "GroupActivitySharingController",
    "GroupSessionMessenger",
    "ThroupleWatchActivity.sessions()",
    "session.join()",
):
    assert token in swift, token
web = (root / "www/app.js").read_text()
for token in ("ThroupleWatchParty", "Start Watch Party", "sessionStarted", "partyMessage", "participantsChanged"):
    assert token in web, token

# Exercise the native capability configurator, including the Xcode capability record.
with tempfile.TemporaryDirectory() as temp:
    temp_root = Path(temp)
    (temp_root / "ios/App/App.xcodeproj").mkdir(parents=True)
    (temp_root / "ios/App/App").mkdir(parents=True)
    (temp_root / "ios/App/App.xcodeproj/project.pbxproj").write_text(
        "TargetAttributes = {\n"
        "  ABC123 = {\n"
        "    ProvisioningStyle = Automatic;\n"
        "  };\n"
        "};\n"
        "CODE_SIGN_STYLE = Automatic;\n"
    )
    env = os.environ.copy()
    env["THROUPLETEA_PROJECT_ROOT"] = str(temp_root)
    subprocess.run([sys.executable, str(root / "scripts/configure-shareplay-ios.py")], env=env, check=True, capture_output=True, text=True)
    with (temp_root / "ios/App/App/App.entitlements").open("rb") as handle:
        entitlements = plistlib.load(handle)
    assert entitlements["com.apple.developer.group-session"] is True
    project = (temp_root / "ios/App/App.xcodeproj/project.pbxproj").read_text()
    assert "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;" in project
    assert "com.apple.GroupActivities" in project
    assert "enabled = 1;" in project

print("✅ UX7.9.7 Watch Party verified: native plugin, JS bridge, entitlement, and Xcode Group Activities capability.")
