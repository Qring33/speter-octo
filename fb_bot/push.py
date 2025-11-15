import base64
import json
import requests

# --- Configuration ---
TOKEN = "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"
USERNAME = "Qring33"
REPO = "speter-octo"
BRANCH = "main"  # or whichever branch you want
FILEPATH_LOCAL = "FB_account.json"
FILEPATH_REPO = "fb_bot/FB_account.json"  # path inside the repo

# --- Read and encode the file ---
with open(FILEPATH_LOCAL, "rb") as f:
    content = f.read()
encoded_content = base64.b64encode(content).decode("utf-8")

# --- API URL for creating/updating a file ---
url = f"https://api.github.com/repos/{USERNAME}/{REPO}/contents/{FILEPATH_REPO}"

# Check if file exists (GitHub requires a SHA for updates)
response = requests.get(url, headers={"Authorization": f"token {TOKEN}"})

if response.status_code == 200:
    sha = response.json()["sha"]
else:
    sha = None

# --- Prepare commit payload ---
payload = {
    "message": "Add FB_account.json",
    "content": encoded_content,
    "branch": BRANCH
}

if sha:
    payload["sha"] = sha  # needed for update

# --- Upload the file ---
put_response = requests.put(
    url,
    headers={"Authorization": f"token {TOKEN}"},
    data=json.dumps(payload)
)

if put_response.status_code in (200, 201):
    print("File successfully uploaded/updated.")
else:
    print("Upload failed:", put_response.status_code, put_response.text)
