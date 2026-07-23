#!/usr/bin/env python3
from pathlib import Path
import json
import os
import plistlib
import shutil
import struct
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]

def png_size(path: Path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])

config = json.loads((root / "capacitor.config.json").read_text())
assert config["appId"] == "com.throupletea.app"
assert config["appName"] == "Throuple Tea"
assert not config.get("server", {}).get("url")
manifest = json.loads((root / "www/manifest.json").read_text())
assert manifest["name"] == "Throuple Tea"
assert manifest["short_name"] == "Throuple Tea"
icon_set = root / "resources/ios/AppIcon.appiconset"
contents = json.loads((icon_set / "Contents.json").read_text())
assert len(contents["images"]) == 18, len(contents["images"])
for image in contents["images"]:
    path = icon_set / image["filename"]
    assert path.exists(), path
assert png_size(icon_set / "Icon-AppStore-1024.png") == (1024, 1024)
assert png_size(root / "www/app-icon.png") == (192, 192)
assert png_size(root / "www/app-icon-512.png") == (512, 512)
splash = root / "resources/ios/SplashPortrait.imageset/SplashPortrait.png"
assert png_size(splash) == (1536, 2732)

# Exercise the post-sync native configurator against a representative Xcode skeleton.
with tempfile.TemporaryDirectory() as temp:
    temp_root = Path(temp)
    (temp_root / "ios/App/App.xcodeproj").mkdir(parents=True)
    (temp_root / "ios/App/App/Base.lproj").mkdir(parents=True)
    (temp_root / "ios/App/App/Assets.xcassets").mkdir(parents=True)
    (temp_root / "resources/ios").mkdir(parents=True)
    shutil.copytree(icon_set, temp_root / "resources/ios/AppIcon.appiconset")
    shutil.copytree(root / "resources/ios/SplashPortrait.imageset", temp_root / "resources/ios/SplashPortrait.imageset")
    (temp_root / "ios/App/App.xcodeproj/project.pbxproj").write_text(
        "PRODUCT_BUNDLE_IDENTIFIER = old.bundle;\n"
        "CURRENT_PROJECT_VERSION = 1;\n"
        "MARKETING_VERSION = 0.1;\n"
        "CODE_SIGN_STYLE = Automatic;\n"
    )
    with (temp_root / "ios/App/App/Info.plist").open("wb") as handle:
        plistlib.dump({"CFBundleDisplayName": "Old", "CFBundleName": "Old"}, handle)
    env = os.environ.copy()
    env["THROUPLETEA_PROJECT_ROOT"] = str(temp_root)
    env["THROUPLETEA_BUILD_NUMBER"] = "3"
    subprocess.run([sys.executable, str(root / "scripts/configure-ios-branding.py")], env=env, check=True, capture_output=True, text=True)
    with (temp_root / "ios/App/App/Info.plist").open("rb") as handle:
        info = plistlib.load(handle)
    assert info["CFBundleDisplayName"] == "Throuple Tea"
    project = (temp_root / "ios/App/App.xcodeproj/project.pbxproj").read_text()
    for token in ("PRODUCT_BUNDLE_IDENTIFIER = com.throupletea.app;", "CURRENT_PROJECT_VERSION = 3;", "MARKETING_VERSION = 1.0;"):
        assert token in project, token
    assert (temp_root / "ios/App/App/Assets.xcassets/AppIcon.appiconset/Icon-AppStore-1024.png").exists()
    assert (temp_root / "ios/App/App/Assets.xcassets/SplashPortrait.imageset/SplashPortrait.png").exists()
    assert "SplashPortrait" in (temp_root / "ios/App/App/Base.lproj/LaunchScreen.storyboard").read_text()

print("✅ UX7.9.7 branding verified: assets, display name, launch screen, and native post-sync installer.")
