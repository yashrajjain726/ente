import json
import subprocess
import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1]).resolve()
sections = "dependencies", "dev-dependencies", "build-dependencies"
metadata = json.loads(
    subprocess.check_output(
        [
            "cargo",
            "metadata",
            "--no-deps",
            "--format-version",
            "1",
            "--locked",
            "--offline",
        ],
        cwd=root / "rust",
        text=True,
    )
)
packages = [
    package for package in metadata["packages"]
    if package["id"] in metadata["workspace_members"]
]
users = {}
for package in packages:
    for dependency in package["dependencies"]:
        users.setdefault(dependency["name"], set()).add(package["id"])

failed = False

for package in packages:
    manifest = Path(package["manifest_path"])
    path = manifest.relative_to(root).as_posix()
    cargo = tomllib.loads(manifest.read_text())
    tables = [(section, cargo.get(section, {})) for section in sections]
    tables += [
        (f"target.{target}.{section}", config.get(section, {}))
        for target, config in cargo.get("target", {}).items()
        for section in sections
    ]
    for table, dependencies in tables:
        for name, declaration in dependencies.items():
            if isinstance(declaration, dict) and declaration.get("workspace") is True:
                continue
            dependency = (
                declaration.get("package", name) if isinstance(declaration, dict) else name
            )
            if len(users[dependency]) < 2:
                continue
            print(
                f"{path}: {table}.{name} duplicates shared dependency {dependency!r}; use workspace = true",
                file=sys.stderr,
            )
            failed = True

sys.exit(1 if failed else 0)
