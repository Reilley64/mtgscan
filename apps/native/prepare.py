import argparse
import hashlib
import io
import json
import pathlib
import plistlib
import re
import shutil
import tarfile
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--build", type=pathlib.Path, required=True)
parser.add_argument("--simulator", action="store_true")
parser.add_argument("--config", type=pathlib.Path)
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[2]
source = repo / "apps/native"
build = args.build.resolve()
build.mkdir(parents=True, exist_ok=True)
pin = json.loads((source / "gpui.json").read_text())
cache = pathlib.Path.home() / "Library/Caches/mtgscan/gpui" / pin["revision"]
upstream = cache / ("simulator" if args.simulator else "device")
if not upstream.exists():
    url = f"https://codeload.github.com/zed-industries/zed/tar.gz/{pin['revision']}"
    with urllib.request.urlopen(url, timeout=120) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != pin["sha256"]:
        raise SystemExit("GPUI source checksum did not match")
    cache.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        tar.extractall(cache)
    (cache / f"zed-{pin['revision']}").rename(upstream)

example = upstream / "crates/gpui_ios/examples"
shutil.copy(source / "shell.rs", example / "mtgscan_mobile.rs")
manifest = upstream / "crates/gpui_ios/Cargo.toml"
entry = '\n[[example]]\nname = "mtgscan_mobile"\npath = "examples/mtgscan_mobile.rs"\ncrate-type = ["staticlib"]\ntest = false\nbench = false\n'
if 'name = "mtgscan_mobile"' not in manifest.read_text():
    manifest.write_text(manifest.read_text() + entry)

theme = (repo / "apps/mobile/src/theme.ts").read_text()


def section(name):
    return re.search(rf"export const {name} = \{{(.*?)\}} as const", theme, re.S)[1]


def color(name, group="colors"):
    return re.search(rf"\b{name}: '#([0-9a-f]+)'", section(group))[1]


def number(group, name):
    return float(re.search(rf"\b{name}: ([0-9.]+)", section(group))[1])


swift = "import UIKit\n\n@MainActor\nenum Tokens {\n"
for name in ["background", "text", "surfaceControl"]:
    value = color(name)
    channels = [int(value[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    swift += f"  static let {name} = UIColor(red: {channels[0]}, green: {channels[1]}, blue: {channels[2]}, alpha: 1)\n"
for name, key in {"googleBackground": "background", "googleText": "text", "googleBorder": "border"}.items():
    value = color(key, "googleButtonColors")
    channels = [int(value[i:i + 2], 16) / 255 for i in [0, 2, 4]]
    swift += f"  static let {name} = UIColor(red: {channels[0]}, green: {channels[1]}, blue: {channels[2]}, alpha: 1)\n"
for name, value in {
    "googleFontSize": float(re.search(r"googleButton: \{ fontSize: ([0-9]+)", theme)[1]),
    "sm": number("spacing", "sm"),
    "lg": number("spacing", "lg"),
    "corner": number("rounded", "sm"),
    "signInHeight": number("sizes", "signInButton"),
    "touchTarget": float(re.search(r"const touchTarget = ([0-9]+)", theme)[1]),
    "dimmed": number("opacity", "dimmed"),
}.items():
    swift += f"  static let {name}: CGFloat = {value}\n"
(build / "Tokens.swift").write_text(swift + "}\n")
(example / "tokens.rs").write_text(
    f'pub const BACKGROUND: u32 = 0x{color("background")};\n'
    f'pub const TEXT: u32 = 0x{color("text")};\n'
    f'pub const SM: f32 = {number("spacing", "sm")};\n'
    f'pub const LG: f32 = {number("spacing", "lg")};\n'
)

config = None
if args.config:
    config = json.loads(args.config.read_text())
    keys = {"supabaseURL", "publishableKey", "apiURL", "googleIOSClientID", "googleServerClientID"}
    if set(config) != keys or not all(isinstance(v, str) and v for v in config.values()):
        raise SystemExit("Public configuration must contain only the documented five public fields")
    if not config["publishableKey"].startswith("sb_publishable_"):
        raise SystemExit("Only a Supabase publishable key can enter this app")
    (build / "PublicConfiguration.json").write_text(json.dumps(config))
else:
    (build / "PublicConfiguration.json").unlink(missing_ok=True)

objects = {}


def obj(isa, **fields):
    key = f"{len(objects) + 1:024X}"
    objects[key] = dict(isa=isa, **fields)
    return key


def ref(path, kind):
    return obj("PBXFileReference", path=str(path), sourceTree="<absolute>", lastKnownFileType=kind)


sources = sorted(source.rglob("*.swift"))
sources = [path for path in sources if "tests" not in path.parts] + [build / "Tokens.swift"]
refs = [ref(path, "sourcecode.swift") for path in sources]
source_phase = obj("PBXSourcesBuildPhase", buildActionMask=2147483647, files=[obj("PBXBuildFile", fileRef=key) for key in refs], runOnlyForDeploymentPostprocessing=0)
package = obj("XCRemoteSwiftPackageReference", repositoryURL="https://github.com/google/GoogleSignIn-iOS", requirement={"kind": "exactVersion", "version": "9.0.0"})
google = obj("XCSwiftPackageProductDependency", package=package, productName="GoogleSignIn")
rust_target = "aarch64-apple-ios-sim" if args.simulator else "aarch64-apple-ios"
platform = "iphonesimulator" if args.simulator else "iphoneos"
rust = ref(build / f"rust/{rust_target}/debug/examples/libmtgscan_mobile.a", "archive.ar")
frameworks = [obj("PBXBuildFile", fileRef=rust), obj("PBXBuildFile", productRef=google)]
for name in ["UIKit", "Metal", "QuartzCore", "CoreText", "CoreGraphics", "Security", "SystemConfiguration", "AuthenticationServices"]:
    framework = obj("PBXFileReference", path=f"System/Library/Frameworks/{name}.framework", sourceTree="SDKROOT", lastKnownFileType="wrapper.framework")
    frameworks.append(obj("PBXBuildFile", fileRef=framework))
framework_phase = obj("PBXFrameworksBuildPhase", buildActionMask=2147483647, files=frameworks, runOnlyForDeploymentPostprocessing=0)
resources = []
for image in (repo / "apps/mobile/assets").glob("google-logo*.png"):
    resources.append(obj("PBXBuildFile", fileRef=ref(image, "image.png")))
if config:
    resources.append(obj("PBXBuildFile", fileRef=ref(build / "PublicConfiguration.json", "text.json")))
resource_phase = obj("PBXResourcesBuildPhase", buildActionMask=2147483647, files=resources, runOnlyForDeploymentPostprocessing=0)
product = obj("PBXFileReference", path="MTGScanNative.app", sourceTree="BUILT_PRODUCTS_DIR", explicitFileType="wrapper.application")
group = obj("PBXGroup", children=refs + [rust, product], sourceTree="<group>")
info = {
    "CFBundleExecutable": "$(EXECUTABLE_NAME)", "CFBundleIdentifier": "$(PRODUCT_BUNDLE_IDENTIFIER)",
    "CFBundleName": "$(PRODUCT_NAME)", "CFBundleDisplayName": "mtgscan Test",
    "CFBundlePackageType": "APPL", "CFBundleShortVersionString": "0.1.0", "CFBundleVersion": "275",
    "UILaunchScreen": {}, "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
}
if config:
    scheme = ".".join(reversed(config["googleIOSClientID"].split(".")))
    info["CFBundleURLTypes"] = [{"CFBundleURLSchemes": [scheme]}]
with (build / "Info.plist").open("wb") as file:
    plistlib.dump(info, file)
with (build / "Native.entitlements").open("wb") as file:
    plistlib.dump({"com.apple.developer.applesignin": ["Default"]}, file)
settings = {
    "PRODUCT_BUNDLE_IDENTIFIER": "dev.reilley.mtgscan.test", "PRODUCT_NAME": "MTGScanNative",
    "DEVELOPMENT_TEAM": "YDZJL5K3RQ", "CODE_SIGN_STYLE": "Automatic",
    "CODE_SIGN_IDENTITY": "Apple Development", "CODE_SIGN_ENTITLEMENTS": str(build / "Native.entitlements"),
    "SDKROOT": platform, "SUPPORTED_PLATFORMS": platform, "ALWAYS_SEARCH_USER_PATHS": "NO",
    "IPHONEOS_DEPLOYMENT_TARGET": "17.0", "SWIFT_VERSION": "5.0", "TARGETED_DEVICE_FAMILY": "1",
    "INFOPLIST_FILE": str(build / "Info.plist"), "OTHER_LDFLAGS": ["$(inherited)", "-lc++"],
    "LIBRARY_SEARCH_PATHS": ["$(inherited)", str(build / f"rust/{rust_target}/debug/examples")],
    "ENABLE_DEBUG_DYLIB": "NO", "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
    "DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym",
}
configuration = obj("XCBuildConfiguration", name="Debug", buildSettings=settings)
configs = obj("XCConfigurationList", buildConfigurations=[configuration], defaultConfigurationName="Debug", defaultConfigurationIsVisible=0)
target = obj("PBXNativeTarget", name="MTGScanNative", productName="MTGScanNative", productReference=product, productType="com.apple.product-type.application", buildConfigurationList=configs, buildPhases=[source_phase, framework_phase, resource_phase], dependencies=[], packageProductDependencies=[google])
project_config = obj("XCBuildConfiguration", name="Debug", buildSettings={})
project_configs = obj("XCConfigurationList", buildConfigurations=[project_config], defaultConfigurationName="Debug", defaultConfigurationIsVisible=0)
project = obj("PBXProject", compatibilityVersion="Xcode 14.0", developmentRegion="en", knownRegions=["en", "Base"], buildConfigurationList=project_configs, mainGroup=group, projectDirPath="", projectRoot="", targets=[target], packageReferences=[package], attributes={"LastUpgradeCheck": "2710", "TargetAttributes": {target: {"SystemCapabilities": {"com.apple.SignInWithApple": {"enabled": 1}}}}})
project_dir = build / "MTGScanNative.xcodeproj"
project_dir.mkdir(exist_ok=True)
with (project_dir / "project.pbxproj").open("wb") as file:
    plistlib.dump({"archiveVersion": "1", "objectVersion": "56", "objects": objects, "rootObject": project}, file)
resolved = source / "Package.resolved"
if resolved.exists():
    destination = project_dir / "project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(resolved, destination)
(build / "upstream-path").write_text(str(upstream))
print(project_dir)
