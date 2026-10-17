import os
import hashlib
import requests
from pathlib import Path

NETLIFY_TOKEN = os.environ.get("NETLIFY_TOKEN", "nfp_aYkbZV8f4vqcp3NGWyiuBcMUyFHWUeAndcb0")
SITE_ID = "883d7575-fef1-46c4-b539-fb87ebab241c"
DIST_DIR = Path(__file__).parent / "dist"

headers = {"Authorization": f"Bearer {NETLIFY_TOKEN}"}

# Step 1: Calculate file hashes
files = {}
for path in DIST_DIR.rglob("*"):
    if path.is_file():
        rel = str(path.relative_to(DIST_DIR)).replace("\\", "/")
        with open(path, "rb") as f:
            sha = hashlib.sha1(f.read()).hexdigest()
        files[rel] = sha

print(f"Found {len(files)} files")

# Step 2: Create deploy
resp = requests.post(
    f"https://api.netlify.com/api/v1/sites/{SITE_ID}/deploys",
    headers=headers,
    json={"files": files}
)
deploy = resp.json()
deploy_id = deploy["id"]
print(f"Deploy created: {deploy_id}")

# Step 3: Upload files that Netlify needs
required = deploy.get("required", [])
uploaded = 0
for file_path, sha in files.items():
    if sha in required:
        full_path = DIST_DIR / file_path.replace("/", os.sep)
        with open(full_path, "rb") as f:
            requests.put(
                f"https://api.netlify.com/api/v1/deploys/{deploy_id}/files/{file_path}",
                headers={**headers, "Content-Type": "application/octet-stream"},
                data=f
            )
        uploaded += 1

print(f"Uploaded {uploaded} files")
print(f"Deploy URL: https://app.netlify.com/sites/stirring-taffy-b70878/deploys/{deploy_id}")
