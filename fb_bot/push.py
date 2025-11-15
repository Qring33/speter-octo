import base64
import json
import requests

# === FETCH TOKEN FROM DROPBOX (automatically at runtime) ===
DROPBOX_RAW_URL = "https://www.dropbox.com/scl/fi/e3k4f55zpny41ptw2pbrz/git_token.txt?rlkey=nfsxxwlkponq4qoqimrbu9xns&st=npwv1f1o&dl=1"

print("[INFO] Fetching GitHub token from Dropbox...")
try:
    response = requests.get(DROPBOX_RAW_URL, timeout=10)
    response.raise_for_status()
    TOKEN = response.text.strip()

    if not TOKEN.startswith("ghp_") and not TOKEN.startswith("github_pat_"):
        raise ValueError("Downloaded content doesn't look like a valid GitHub token")
except Exception as e:
    raise SystemExit(f"[FATAL] Failed to load token from Dropbox → {e}")

print("[SUCCESS] Token loaded successfully!\n")

# === Your configuration ===
USERNAME = "Qring33"
REPO = "speter-octo"
BRANCH = "main"
FILEPATH_LOCAL = "FB_account.json"                    # Local file to upload
FILEPATH_REPO = "fb_bot/FB_account.json"              # Path inside the GitHub repo

# === Read and encode the local file ===
if not requests.path.isfile(FILEPATH_LOCAL):
    raise SystemExit(f"[ERROR] Local file not found: {FILEPATH_LOCAL}")

with open(FILEPATH_LOCAL, "rb") as f:
    encoded_content = base64.b64encode(f.read()).decode("utf-8")

# === GitHub API URL ===
url = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents/{FILEPATH_REPO}"

# === Check if file already exists (to get SHA for updates) ===
headers = {"Authorization": f"token {TOKEN}"}
response = requests.get(url, headers=headers)

sha = response.json().get("sha") if response.status_code == 200 else None

# === Prepare payload ===
payload = {
    "message": f"Auto-update FB_account.json – {requests.utils.default_user_agent()}",
    "content": encoded_content,
    "branch": BRANCH
}
if sha:
    payload["sha"] = sha  # Required when updating existing file

# === Upload / Update the file ===
put_response = requests.put(
    url,
    headers=headers,
    data=json.dumps(payload)
)

# === Result ===
if put_response.status_code in (200, 201):
    print("[SUCCESS] FB_account.json successfully uploaded/updated in the repo!")
else:
    print("[FAILED] Upload failed!")
    print("Status:", put_response.status_code)
    print("Response:", put_response.text)