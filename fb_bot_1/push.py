import base64
import json
import requests
import os

# --- Configuration ---
TOKEN = "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"  # Replace with new token after revoking the old one
USERNAME = "Qring33"
REPO = "speter-octo"
BRANCH = "main"

# Local → Repo file mappings
FILES_TO_UPLOAD = {
    "FB_account.json": "fb_bot_1/FB_account.json",
    "fb_profile.json": "fb_bot_1/fb_profile.json",
    "FB_login.json": "fb_bot_1/Fb_login.json",
}

API_URL = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents"


def upload_file(local_path, repo_path):
    # Read and Base64-encode file
    with open(local_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    # Build URL
    url = f"{API_URL}/{repo_path}"

    # Check if file already exists to get SHA
    check = requests.get(url, headers={"Authorization": f"token {TOKEN}"})
    sha = check.json().get("sha") if check.status_code == 200 else None

    # Build payload
    payload = {
        "message": f"Add/Update {os.path.basename(local_path)}",
        "content": encoded,
        "branch": BRANCH
    }
    if sha:
        payload["sha"] = sha

    # Upload
    put = requests.put(
        url,
        headers={"Authorization": f"token {TOKEN}"},
        data=json.dumps(payload)
    )

    if put.status_code in (200, 201):
        print(f"[SUCCESS] {local_path} uploaded.")
    else:
        print(f"[FAILED] {local_path}: {put.status_code} — {put.text}")


# --- Execute uploads ---
for local, repo in FILES_TO_UPLOAD.items():
    if not os.path.exists(local):
        print(f"[SKIPPED] Missing local file: {local}")
        continue
    upload_file(local, repo)
