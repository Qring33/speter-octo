import os
import dropbox
from dropbox.oauth import DropboxOAuth2FlowNoRedirect

# ----------------------------------------------------------------------
# 1. Configuration (replace only if you get new credentials)
# ----------------------------------------------------------------------
DROPBOX_REFRESH_TOKEN = "aKyyc46BzjsAAAAAAAAAAflNqCXbvJtQ75QkrOK3GGJKTEHbE6bq__b-tPQ7tpVH"
DROPBOX_APP_KEY       = "89qh2irwhtm9nh3"
DROPBOX_APP_SECRET    = "n3al44m84jg1i3q"

LOCAL_FOLDER   = "session"
DROPBOX_FOLDER = "/session"

# ----------------------------------------------------------------------
# 2. Helper: get a fresh Dropbox client using the refresh token
# ----------------------------------------------------------------------
def get_dropbox_client():
    """
    Performs the OAuth2 refresh-token flow (no browser redirect) and returns
    a fully-authenticated Dropbox object with a fresh access token.
    """
    auth_flow = DropboxOAuth2FlowNoRedirect(
        consumer_key=DROPBOX_APP_KEY,
        consumer_secret=DROPBOX_APP_SECRET,
        token_access_type="offline",   # important for refresh tokens
    )

    # The SDK can refresh automatically if we give it the refresh token
    # directly via the `Dropbox` constructor (available from v10.3+).
    # If you are on an older version, uncomment the manual flow below.
    dbx = dropbox.Dropbox(
        oauth2_refresh_token=DROPBOX_REFRESH_TOKEN,
        app_key=DROPBOX_APP_KEY,
        app_secret=DROPBOX_APP_SECRET,
    )
    return dbx

# ----------------------------------------------------------------------
# 3. Upload logic (identical to your original version)
# ----------------------------------------------------------------------
def upload_json_files(dbx, local_folder, dropbox_folder):
    if not os.path.exists(local_folder):
        raise FileNotFoundError(f"Local folder does not exist: {local_folder}")

    for filename in os.listdir(local_folder):
        if filename.lower().endswith(".json"):
            local_path   = os.path.join(local_folder, filename)
            dropbox_path = f"{dropbox_folder}/{filename}"

            with open(local_path, "rb") as f:
                dbx.files_upload(
                    f.read(),
                    dropbox_path,
                    mode=dropbox.files.WriteMode.overwrite,
                )
    print("Upload completed successfully.")

# ----------------------------------------------------------------------
# 4. Main entry point
# ----------------------------------------------------------------------
def main():
    dbx = get_dropbox_client()
    upload_json_files(dbx, LOCAL_FOLDER, DROPBOX_FOLDER)

if __name__ == "__main__":
    main()