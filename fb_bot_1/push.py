import base64
import json
import requests
import os

# === AUTOMATICALLY FETCH TOKEN FROM DROPBOX ===
DROPBOX_LINK = "https://www.dropbox.com/scl/fi/e3k4f55zpny41ptw2pbrz/git_token.txt?rlkey=nfsxxwlkponq4qoqimrbu9xns&st=npwv1f1o&dl=0"

# Force raw download by changing dl=0 → dl=1
raw_url = DROPBOX_LINK.replace("dl=0", "dl=1") if "dl=0" in DROPBOX_LINK else DROPBOX_LINK + "?dl=1"

try:
    TOKEN = requests.get(raw_url, timeout=10).text.strip()
    if not TOKEN.startswith("ghp_"):
        raise ValueError("Token does not look like a valid GitHub token")
except Exception as e:
    raise SystemExit(f"[FATAL] Could not fetch token from Dropbox → {e}")

# === Rest of your configuration (unchanged) ===
USERNAME = "Qring33"
REPO = "speter-octo"
BRANCH = "main"

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
        "message": f"Auto-update {os.path.basename(local_path)}",
        "content": encoded,
        "branch": BRANCH
    }
    if sha:
        payload["sha"] = sha

    # Upload
    put = requests.put(
        url,
        headers={
            "Authorization": f"token {TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        },
        data=json.dumps(payload)
    )

    if put.status_code in (200, 201):
        print(f"[SUCCESS] {local_path} → {repo_path}")
    else:
        print(f"[FAILED] {local_path}: {put.status_code} — {put.text}")


# === Execute uploads ===
print("[INFO] Token successfully loaded from Dropbox\n")
for local, repo in FILES_TO_UPLOAD.items():
    if not os.path.exists(local):
        print(f"[SKIPPED] Missing local file: {local}")
        continue
    upload_file(local, repo)