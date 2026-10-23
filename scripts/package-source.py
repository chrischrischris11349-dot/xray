"""Create the friend-shareable corresponding source without local settings or secrets."""
from pathlib import Path
import re
import os
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output = root / "dist"
output.mkdir(exist_ok=True)
roots = ["core", "equicord", "src-tauri", "server", "shell", "scripts", "docs", "vendor/equicord"]
excluded = {"node_modules", ".git", "target", "gen", "dist", "generated", "__pycache__"}
files = set()
for name in roots:
    folder = root / name
    for directory, directories, names in os.walk(folder):
        directories[:] = [entry for entry in directories if entry not in excluded]
        for entry in names:
            path = Path(directory) / entry
            relative = path.relative_to(root)
            if path.name.startswith(".env") or path.name.endswith(".local"):
                continue
            if relative.as_posix().startswith("src-tauri/inject/") and path.suffix == ".js":
                continue
            files.add(path)
for name in ["package.json", "package-lock.json", "LICENSE", "README.md", ".gitignore"]:
    if (root/name).is_file():
        files.add(root/name)

secret_pattern = re.compile(rb"(?:oath_[A-Za-z0-9_-]{25,}|sby[a-z0-9]{24,})")
for path in files:
    if secret_pattern.search(path.read_bytes()):
        raise SystemExit(f"Credential-shaped content detected; source package stopped: {path.relative_to(root)}")

destination = output / f"XRay-{version}-source.zip"
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(files):
        archive.write(path, f"XRay-{version}/" + path.relative_to(root).as_posix())
print(f"Source package: {len(files)} files, {destination.stat().st_size:,} bytes")
