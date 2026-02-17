# zohomail.py
# python3 zohomail.py new
# python3 zohomail.py inbox <email>

import random, sys, imaplib, email, re
from email.header import decode_header

# === CONFIG ===
GMAIL_EMAIL = "sinnerman334@gmail.com"
GMAIL_PASS  = "ftvy upoo eqnz kihg"
DOMAIN      = "wixnation.com"
NAMES_FILE  = "name.txt"
FACEBOOK_SENDER = "registration@facebookmail.com"

# === LOAD NAMES ===
def load_names():
    try:
        with open(NAMES_FILE, "r") as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print("OTP not found", file=sys.stderr)
        sys.exit(1)

# === GENERATE EMAIL & PASSWORD ===
def generate_email():
    names = load_names()
    if len(names) < 2:
        print("OTP not found", file=sys.stderr)
        sys.exit(1)
    return f"{random.choice(names)}{random.choice(names)}@{DOMAIN}"

def generate_password():
    lowercase = "abcdefghijklmnopqrstuvwxyz"
    uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    digits = "0123456789"
    all_chars = lowercase + uppercase + digits
    password = [random.choice(lowercase), random.choice(uppercase), random.choice(digits)]
    password += [random.choice(all_chars) for _ in range(9)]
    random.shuffle(password)
    return ''.join(password)

# === NORMALIZE EMAIL ===
def norm(addr):
    addr = addr.lower().strip()
    s = addr.find("<")
    if s != -1:
        e = addr.find(">", s)
        if e != -1:
            addr = addr[s+1:e]
    return addr.strip('"<> ')

# === DECODE HEADER ===
def decode_value(val):
    if not val:
        return ""
    decoded = ""
    for part, encoding in decode_header(val):
        if isinstance(part, bytes):
            decoded += part.decode(encoding or "utf-8", errors="ignore")
        else:
            decoded += part
    return decoded

# === GET EMAIL BODY ===
def get_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type in ["text/plain", "text/html"]:
                payload = part.get_payload(decode=True)
                if payload:
                    body += payload.decode(errors="ignore") + "\n"
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            body = payload.decode(errors="ignore")
    return body.strip()

# === EXTRACT OTP FROM BODY ===
def extract_otp(body):
    # Match FB-XXXXX pattern
    fb = re.search(r'FB[-–][\s-]*(\d{5,8})', body, re.IGNORECASE)
    if fb:
        return fb.group(1)
    # fallback: any 5-8 digit number
    num = re.search(r'\b\d{5,8}\b', body)
    if num:
        return num.group()
    return None

# === CHECK ONE FOLDER FOR FACEBOOK EMAIL ===
def check_folder(mail, folder, target_email):
    try:
        status, _ = mail.select(f'"{folder}"', readonly=True)
        if status != "OK":
            return None
    except:
        return None

    # Search last 10 emails from Facebook sender
    status, data = mail.search(None, f'(FROM "{FACEBOOK_SENDER}")')
    if status != "OK" or not data[0]:
        return None

    uids = data[0].split()
    if not uids:
        return None

    # Iterate over last 10 emails, newest first
    for uid in reversed(uids[-10:]):
        status, msg_data = mail.fetch(uid, "(RFC822)")
        if status != "OK":
            continue

        msg = email.message_from_bytes(msg_data[0][1])

        # Confirm it was sent to the target email
        to_header = decode_value(msg.get("To"))
        if target_email.lower() not in norm(to_header):
            continue

        body = get_body(msg)
        otp = extract_otp(body)
        if otp:
            return otp

    return None

# === MAIN INBOX COMMAND ===
def get_verification_code(target_email):
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(GMAIL_EMAIL, GMAIL_PASS)

        # Check INBOX and Spam
        for folder in ["INBOX", "[Gmail]/Spam"]:
            code = check_folder(mail, folder, target_email)
            if code:
                mail.logout()
                print(code)
                return

        mail.logout()
        print("OTP not found")
    except Exception as e:
        print("OTP not found")

# === MAIN ===
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("OTP not found", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "new":
        print(generate_email())
        print(generate_password())
    elif cmd == "inbox" and len(sys.argv) == 3:
        get_verification_code(sys.argv[2])
    else:
        print("OTP not found", file=sys.stderr)
        sys.exit(1)