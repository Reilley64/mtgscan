import argparse
import json
import pathlib
import plistlib
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("upstream", type=pathlib.Path)
parser.add_argument("build", type=pathlib.Path)
parser.add_argument("--simulator", action="store_true")
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[2]
upstream = args.upstream.resolve()
build = args.build.resolve()
rust_target = "aarch64-apple-ios-sim" if args.simulator else "aarch64-apple-ios"
platform = "iphonesimulator" if args.simulator else "iphoneos"
build.mkdir(parents=True, exist_ok=True)
example_dir = upstream / "crates/gpui_ios/examples"
shutil.copy(repo / "prototypes/gpui-iphone/gate.rs", example_dir / "mtgscan_gate.rs")
shutil.copy(repo / "prototypes/gpui-iphone/camera_proof.rs", example_dir / "camera_proof.rs")
manifest = upstream / "crates/gpui_ios/Cargo.toml"
entry = '\n[[example]]\nname = "mtgscan_gate"\npath = "examples/mtgscan_gate.rs"\ncrate-type = ["staticlib"]\ntest = false\nbench = false\n'
if 'name = "mtgscan_gate"' not in manifest.read_text():
    manifest.write_text(manifest.read_text() + entry)

objects = {}


def obj(isa, **fields):
    key = f"{len(objects) + 1:024X}"
    objects[key] = dict(isa=isa, **fields)
    return key


def ref(path, kind):
    return obj("PBXFileReference", path=str(path), sourceTree="<absolute>", lastKnownFileType=kind)


mobile = repo / "apps/mobile/modules"
sources = [repo / "prototypes/gpui-iphone" / name for name in ["Proof.swift", "camera_status.swift", "main.swift"]]
sources += [mobile / "card-detector/ios/CameraSession.swift"]
sources += sorted((mobile / "card-detector/ios/Detector").glob("*.swift"))
sources += sorted((mobile / "card-recognizer/ios/Recognizer").glob("*.swift"))
sources += [mobile / "card-recognizer/ios/GalleryDownloads.swift"]
source_refs = [ref(path, "sourcecode.swift") for path in sources]
source_phase = obj("PBXSourcesBuildPhase", buildActionMask=2147483647, files=[obj("PBXBuildFile", fileRef=key) for key in source_refs], runOnlyForDeploymentPostprocessing=0)
resolved = json.loads((mobile / "card-recognizer/Package.resolved").read_text())
webp_pin = next(pin for pin in resolved["pins"] if pin["identity"] == "libwebp-xcode")
package = obj("XCRemoteSwiftPackageReference", repositoryURL=webp_pin["location"], requirement={"kind": "revision", "revision": webp_pin["state"]["revision"]})
webp = obj("XCSwiftPackageProductDependency", package=package, productName="libwebp")
rust = ref(build / f"rust/{rust_target}/debug/examples/libmtgscan_gate.a", "archive.ar")
frameworks = [obj("PBXBuildFile", fileRef=rust), obj("PBXBuildFile", productRef=webp)]
for name in ["UIKit", "Metal", "QuartzCore", "CoreText", "CoreGraphics", "Security", "SystemConfiguration"]:
    framework = obj("PBXFileReference", path=f"System/Library/Frameworks/{name}.framework", sourceTree="SDKROOT", lastKnownFileType="wrapper.framework")
    frameworks.append(obj("PBXBuildFile", fileRef=framework))
framework_phase = obj("PBXFrameworksBuildPhase", buildActionMask=2147483647, files=frameworks, runOnlyForDeploymentPostprocessing=0)
product = obj("PBXFileReference", path="GPUIProof.app", sourceTree="BUILT_PRODUCTS_DIR", explicitFileType="wrapper.application")
group = obj("PBXGroup", children=source_refs + [rust, product], sourceTree="<group>")
settings = {
    "PRODUCT_BUNDLE_IDENTIFIER": "dev.reilley.mtgscan.test",
    "PRODUCT_NAME": "GPUIProof",
    "DEVELOPMENT_TEAM": "YDZJL5K3RQ",
    "CODE_SIGN_STYLE": "Automatic",
    "CODE_SIGN_IDENTITY": "Apple Development",
    "SDKROOT": platform,
    "ALWAYS_SEARCH_USER_PATHS": "NO",
    "SUPPORTED_PLATFORMS": platform,
    "IPHONEOS_DEPLOYMENT_TARGET": "17.0",
    "SWIFT_VERSION": "5.0",
    "TARGETED_DEVICE_FAMILY": "1",
    "GENERATE_INFOPLIST_FILE": "YES",
    "INFOPLIST_KEY_CFBundleDisplayName": "mtgscan Test",
    "INFOPLIST_KEY_NSCameraUsageDescription": "This isolated proof uses the existing card detector and recognizer.",
    "INFOPLIST_KEY_UILaunchScreen_Generation": "YES",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations": "UIInterfaceOrientationPortrait",
    "MARKETING_VERSION": "0.1.0",
    "CURRENT_PROJECT_VERSION": "274",
    "OTHER_LDFLAGS": ["$(inherited)", "-lc++"],
    "LIBRARY_SEARCH_PATHS": ["$(inherited)", str(build / f"rust/{rust_target}/debug/examples")],
    "ENABLE_DEBUG_DYLIB": "NO",
    "SWIFT_OPTIMIZATION_LEVEL": "-Onone",
    "DEBUG_INFORMATION_FORMAT": "dwarf-with-dsym",
}
config = obj("XCBuildConfiguration", name="Debug", buildSettings=settings)
configs = obj("XCConfigurationList", buildConfigurations=[config], defaultConfigurationName="Debug", defaultConfigurationIsVisible=0)
target = obj("PBXNativeTarget", name="GPUIProof", productName="GPUIProof", productReference=product, productType="com.apple.product-type.application", buildConfigurationList=configs, buildPhases=[source_phase, framework_phase], dependencies=[], packageProductDependencies=[webp])
project_config = obj("XCBuildConfiguration", name="Debug", buildSettings={})
project_configs = obj("XCConfigurationList", buildConfigurations=[project_config], defaultConfigurationName="Debug", defaultConfigurationIsVisible=0)
project = obj("PBXProject", compatibilityVersion="Xcode 14.0", developmentRegion="en", knownRegions=["en", "Base"], buildConfigurationList=project_configs, mainGroup=group, projectDirPath="", projectRoot="", targets=[target], packageReferences=[package], attributes={"LastUpgradeCheck": "2710"})
project_dir = build / "GPUIProof.xcodeproj"
project_dir.mkdir(exist_ok=True)
with (project_dir / "project.pbxproj").open("wb") as file:
    plistlib.dump({"archiveVersion": "1", "objectVersion": "56", "objects": objects, "rootObject": project}, file)
print(project_dir)
