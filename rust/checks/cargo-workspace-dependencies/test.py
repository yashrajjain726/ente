import subprocess
import sys
import tempfile
from pathlib import Path

check = Path(__file__).with_name("check.py")
workspace = """\
[workspace]
members = ["app-*"]
exclude = ["app-excluded"]
resolver = "2"

[workspace.dependencies]
shared = { path = "shared" }
serde = "1.0.0"
"""
package = """\
[package]
name = "{}"
version = "0.1.0"
edition = "2024"
"""


def run(app_b, members='"app-*"'):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        rust = root / "rust"
        write(rust / "Cargo.toml", workspace.replace('"app-*"', members))
        write(
            rust / "app-a/Cargo.toml",
            package.format("app-a")
            + "\n[dependencies]\nshared.workspace = true\nserde.workspace = true\n",
        )
        write(rust / "app-b/Cargo.toml", package.format("app-b") + app_b)
        write(
            rust / "app-excluded/Cargo.toml",
            package.format("app-excluded")
            + '\n[dependencies]\nsolo = { path = "../solo" }\n',
        )
        write(rust / "shared/Cargo.toml", package.format("shared"))
        write(rust / "solo/Cargo.toml", package.format("solo"))
        return subprocess.run(
            [sys.executable, check, root],
            capture_output=True,
            text=True,
        )


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    if path.name == "Cargo.toml" and path.parent.name != "rust":
        source = path.parent / "src/lib.rs"
        source.parent.mkdir(exist_ok=True)
        source.write_text("")


result = run('\n[dependencies]\nshared = { path = "../shared" }\n')
assert result.returncode == 1, result.stderr
assert "dependencies.shared duplicates shared dependency 'shared'" in result.stderr

result = run("\n[dependencies]\nshared.workspace = true\n")
assert result.returncode == 0, result.stderr
assert not result.stdout
assert not result.stderr

result = run(
    '\n[target.\'cfg(unix)\'.dev-dependencies]\nlocal = { package = "shared", path = "../shared" }\n'
)
assert result.returncode == 1, result.stderr
assert "target.cfg(unix).dev-dependencies.local" in result.stderr

result = run('''
[dependencies]
solo = { path = "../solo" }
[dev-dependencies]
solo = { path = "../solo" }
''')
assert result.returncode == 0, result.stderr
assert not result.stdout
assert not result.stderr

result = run('''
[target.'cfg(unix)'.dependencies]
dep = { package = "serde", version = "1.0.0" }
[target.'cfg(windows)'.dependencies]
dep = { package = "tokio", version = "1.0.0" }
''')
assert result.returncode == 1, result.stderr
assert "target.cfg(unix).dependencies.dep duplicates shared dependency 'serde'" in result.stderr
assert "target.cfg(windows)" not in result.stderr

result = run("\n[dependencies]\nshared.workspace = true\n", '"app-b", "app-a"')
assert result.returncode == 1, result.stderr
assert "rust/Cargo.toml: workspace.members 'app-b' precedes 'app-a'; sort members" in result.stderr

result = run("\n[dependencies]\nshared.workspace = true\n", '"app-a", "app-b"')
assert result.returncode == 0, result.stderr
assert not result.stderr
