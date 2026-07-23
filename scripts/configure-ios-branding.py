#!/usr/bin/env python3
"""Apply Throuple Tea branding after every Capacitor iOS sync."""
from __future__ import annotations

import json
import os
import plistlib
import re
import shutil
from pathlib import Path

ROOT = Path(os.environ.get("THROUPLETEA_PROJECT_ROOT", Path(__file__).resolve().parents[1])).resolve()
BUILD_NUMBER = os.environ.get("THROUPLETEA_BUILD_NUMBER", "3").strip() or "3"
MARKETING_VERSION = os.environ.get("THROUPLETEA_MARKETING_VERSION", "1.0").strip() or "1.0"
DISPLAY_NAME = "Throuple Tea"
BUNDLE_ID = "com.throupletea.app"

IOS_APP = ROOT / "ios" / "App"
NATIVE_APP = IOS_APP / "App"
PROJECT = IOS_APP / "App.xcodeproj" / "project.pbxproj"
INFO = NATIVE_APP / "Info.plist"
ASSETS = NATIVE_APP / "Assets.xcassets"
LAUNCH = NATIVE_APP / "Base.lproj" / "LaunchScreen.storyboard"
SOURCE_ICON_SET = ROOT / "resources" / "ios" / "AppIcon.appiconset"
SOURCE_SPLASH_SET = ROOT / "resources" / "ios" / "SplashPortrait.imageset"

for required in (PROJECT, INFO, SOURCE_ICON_SET / "Contents.json", SOURCE_SPLASH_SET / "Contents.json"):
    if not required.exists():
        raise SystemExit(f"❌ Missing required iOS branding file: {required}")

# Replace generated asset sets every time so `cap sync` can never restore defaults.
ASSETS.mkdir(parents=True, exist_ok=True)
for name, source in (("AppIcon.appiconset", SOURCE_ICON_SET), ("SplashPortrait.imageset", SOURCE_SPLASH_SET)):
    destination = ASSETS / name
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)

# Ensure the native display name and launch storyboard are explicit.
with INFO.open("rb") as handle:
    info = plistlib.load(handle)
info["CFBundleDisplayName"] = DISPLAY_NAME
info["CFBundleName"] = DISPLAY_NAME
info["UILaunchStoryboardName"] = "LaunchScreen"
with INFO.open("wb") as handle:
    plistlib.dump(info, handle, fmt=plistlib.FMT_XML, sort_keys=False)

LAUNCH.parent.mkdir(parents=True, exist_ok=True)
LAUNCH.write_text(
    '''<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23096" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="LaunchVC">
    <device id="retina6_12" orientation="portrait" appearance="dark"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23084"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="System colors in document resources" minToolsVersion="11.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="LaunchScene">
            <objects>
                <viewController id="LaunchVC" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="LaunchView">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <imageView clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="SplashPortrait" translatesAutoresizingMaskIntoConstraints="NO" id="SplashImage">
                                <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                            </imageView>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="SafeArea"/>
                        <color key="backgroundColor" systemColor="blackColor"/>
                        <constraints>
                            <constraint firstItem="SplashImage" firstAttribute="leading" secondItem="LaunchView" secondAttribute="leading" id="SplashLeading"/>
                            <constraint firstAttribute="trailing" secondItem="SplashImage" secondAttribute="trailing" id="SplashTrailing"/>
                            <constraint firstItem="SplashImage" firstAttribute="top" secondItem="LaunchView" secondAttribute="top" id="SplashTop"/>
                            <constraint firstAttribute="bottom" secondItem="SplashImage" secondAttribute="bottom" id="SplashBottom"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="FirstResponder" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    <resources>
        <image name="SplashPortrait" width="864" height="1536"/>
        <systemColor name="blackColor">
            <color white="0.0" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
        </systemColor>
    </resources>
</document>
''',
    encoding="utf-8",
)

project = PROJECT.read_text(encoding="utf-8")
project = re.sub(r"CURRENT_PROJECT_VERSION = [^;]+;", f"CURRENT_PROJECT_VERSION = {BUILD_NUMBER};", project)
project = re.sub(r"MARKETING_VERSION = [^;]+;", f"MARKETING_VERSION = {MARKETING_VERSION};", project)
project = re.sub(r"PRODUCT_BUNDLE_IDENTIFIER = [^;]+;", f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};", project)
# Capacitor templates differ across Xcode releases. Update a generated display-name setting if present;
# Info.plist above remains the source of truth when this setting is absent.
if "INFOPLIST_KEY_CFBundleDisplayName" in project:
    project = re.sub(
        r"INFOPLIST_KEY_CFBundleDisplayName = [^;]+;",
        'INFOPLIST_KEY_CFBundleDisplayName = "Throuple Tea";',
        project,
    )
PROJECT.write_text(project, encoding="utf-8")

# Validate what was written rather than only reporting success.
with INFO.open("rb") as handle:
    check_info = plistlib.load(handle)
if check_info.get("CFBundleDisplayName") != DISPLAY_NAME:
    raise SystemExit("❌ Bundle display name did not persist.")
if not (ASSETS / "AppIcon.appiconset" / "Icon-AppStore-1024.png").exists():
    raise SystemExit("❌ Branded App Store icon did not persist.")
if not (ASSETS / "SplashPortrait.imageset" / "SplashPortrait.png").exists():
    raise SystemExit("❌ Branded splash artwork did not persist.")
check_project = PROJECT.read_text(encoding="utf-8")
for expected in (
    f"CURRENT_PROJECT_VERSION = {BUILD_NUMBER};",
    f"MARKETING_VERSION = {MARKETING_VERSION};",
    f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};",
):
    if expected not in check_project:
        raise SystemExit(f"❌ Xcode setting did not persist: {expected}")

print(f"✅ Home Screen name configured: {DISPLAY_NAME}")
print(f"✅ Branded iOS app icon installed ({len(json.loads((SOURCE_ICON_SET / 'Contents.json').read_text())['images'])} sizes).")
print("✅ Branded portrait splash screen installed with aspect-fit protection.")
print(f"✅ App Store version/build configured: {MARKETING_VERSION} ({BUILD_NUMBER})")
