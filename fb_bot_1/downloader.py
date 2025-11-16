import requests

# URL of the raw file (GitHub raw content)
url = "https://raw.githubusercontent.com/Qring33/speter-octo/main/fb_bot/FB_account.json"

# Local filename to save the downloaded file
filename = "FB_account.json"

try:
    # Send a GET request to the URL
    response = requests.get(url)
    
    # Raise an exception if the request failed
    response.raise_for_status()
    
    # Save the content to a file
    with open(filename, 'wb') as f:
        f.write(response.content)
    
    print(f"File successfully downloaded and saved as '{filename}'")

except requests.exceptions.RequestException as e:
    print(f"Error downloading the file: {e}")
