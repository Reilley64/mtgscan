import json
import subprocess

metadata = json.loads(subprocess.check_output(
    ["mise", "exec", "--", "cargo", "metadata", "--no-deps", "--format-version", "1", "--locked"],
    text=True,
))
allowed = {
    "mtgscan-domain": set(),
    "mtgscan-application": {"mtgscan-domain"},
    "mtgscan-identity": {"mtgscan-application", "mtgscan-domain", "reqwest", "serde", "serde_json", "base64", "uuid"},
    "mtgscan-api": {"mtgscan-application", "mtgscan-domain", "axum", "serde", "serde_json", "uuid"},
    "mtgscan-persistence": {"mtgscan-application", "mtgscan-domain", "sqlx", "serde", "serde_json", "base64"},
    "mtgscan-server": {"mtgscan-identity", "mtgscan-api", "mtgscan-persistence", "axum", "tokio"},
}
for package in metadata["packages"]:
    if package["id"] not in metadata["workspace_members"]:
        continue
    if package["name"] not in allowed:
        raise SystemExit(f"Declare dependency boundaries for {package['name']}")
    for dependency in package["dependencies"]:
        if dependency["kind"] == "dev":
            if dependency["name"] not in {"tokio", "tower"}:
                raise SystemExit(f"Unapproved unit dependency: {dependency['name']}")
        elif dependency["name"] not in allowed[package["name"]]:
            raise SystemExit(f"Forbidden dependency: {package['name']} -> {dependency['name']}")
print("Rust dependency boundaries passed")
