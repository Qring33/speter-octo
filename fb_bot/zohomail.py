# zohomail.py
# python3 zohomail.py new
# python3 zohomail.py inbox <email>

import random, sys, imaplib, email, re
from email.header import decode_header
from email.utils import parsedate_tz, mktime_tz

# === CONFIG ===
GMAIL_EMAIL = "sinnerman334@gmail.com"
GMAIL_PASS  = "qeyy mnsd prjq tiuj"
DOMAIN      = "wixnation.com"
NAMES_FILE  = "name.txt"

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

# === GET EMAIL BODY ===
def get_body(msg):
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                pl = part.get_payload(decode=True)
                if pl:
                    body = pl.decode(errors="ignore")
                    break
        if not body:
            for part in msg.walk():
                if part.get_content_type() == "text/html":
                    pl = part.get_payload(decode=True)
                    if pl:
                        body = pl.decode(errors="ignore")
                    break
    else:
        pl = msg.get_payload(decode=True)
        if pl:
            body = pl.decode(errors="ignore")
    return body

# === GET RECIPIENT HEADERS ===
def get_recipient(msg):
    headers = []
    for h in ["To", "Delivered-To", "X-Original-To"]:
        val = msg.get(h)
        if val:
            decoded = "".join(
                p.decode(c or "utf-8", errors="ignore") if isinstance(p, bytes) else p
                for p, c in decode_header(val)
            )
            headers.append(decoded)
    return headers

# === EXTRACT OTP FROM BODY ===
def extract_otp(body):
    # First: FB-XXXXX (even if glued like FB-20129Don't)
    fb = re.search(r'FB[-–][\s-]*(\d{5,8})', body, re.IGNORECASE)
    if fb:
        return fb.group(1)
    # Fallback: any 5-8 digit number
    num = re.search(r'\b\d{5,8}\b', body)
    if num:
        return num.group()
    return None

# === CHECK ONE FOLDER FOR LATEST EMAIL ===
def check_folder(mail, folder, target_norm):
    try:
        status, _ = mail.select(f'"{folder}"', readonly=True)
        if status != "OK":
            return None
    except:
        return None

    status, data = mail.search(None, "ALL")
    if status != "OK" or not data[0]:
        return None
    uids = data[0].split()
    if not uids:
        return None

    # Get only the newest email
    uid = uids[-1]
    status, msg_data = mail.fetch(uid, "(RFC822)")
    if status != "OK":
        return None
    msg = email.message_from_bytes(msg_data[0][1])

    # Check if email is for target
    headers = get_recipient(msg)
    matched = any(target_norm in norm(a) for hdr in headers for a in re.split(r'[,\n]', hdr))
    if not matched:
        return None

    body = get_body(msg)
    return extract_otp(body)

# === MAIN INBOX COMMAND ===
def get_verification_code(target_email):
    target_norm = norm(target_email)
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(GMAIL_EMAIL, GMAIL_PASS)

        # Check only INBOX and Spam
        for folder in ["INBOX", "[Gmail]/Spam"]:
            code = check_folder(mail, folder, target_norm)
            if code:
                mail.logout()
                print(code)
                return

        mail.logout()
        print("OTP not found")
    except:
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