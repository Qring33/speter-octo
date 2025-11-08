const { firefox } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');

(async () => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    let email, password;

    // === LOAD USER AGENTS ===
    const userAgents = fs.readFileSync('user_agents.txt', 'utf-8').split('\n').filter(Boolean);
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    console.log(`Using User Agent: ${randomUserAgent}`);

    // === GET EMAIL & PASSWORD FROM zohomail.py ===
    try {
      const out = execSync('python3 zohomail.py new', { encoding: 'utf8' });
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('zohomail.py did not return email and password');
      email = lines[0];
      password = lines[1];
      console.log(`Generated email: ${email}`);
      console.log(`Generated password: ${password}`);
    } catch (err) {
      throw new Error(`Failed to get email/password: ${err.message}`);
    }

    // === LOAD NAMES FROM name.txt ===
    let names = [];
    try {
      names = fs.readFileSync('name.txt', 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      if (names.length === 0) throw new Error('name.txt is empty');
    } catch (err) {
      throw new Error(`Failed to read name.txt: ${err.message}`);
    }

    const getRandomName = () => names[Math.floor(Math.random() * names.length)];

    // === LAUNCH BROWSER ===
    browser = await firefox.launch({ headless: false });
    context = await browser.newContext({
      userAgent: randomUserAgent,
      viewport: null,
      bypassCSP: true,
    });

    page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // === NAVIGATE TO SIGNUP ===
    const targetUrl = 'https://web.facebook.com/reg/';
    console.log(`Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // === FILL FIRST NAME ===
    const firstName = getRandomName();
    await page.fill('input[name="firstname"]', firstName);
    await delay(1000);
    console.log(`Filled First Name: ${firstName}`);

    // === FILL SURNAME ===
    const lastName = getRandomName();
    await page.fill('input[name="lastname"]', lastName);
    await delay(1000);
    console.log(`Filled Surname: ${lastName}`);

    // === SELECT DAY ===
    await page.click('select#day');
    await delay(1000);
    const dayOptions = await page.$$eval('select#day option', opts => opts.map(o => o.value).filter(v => v));
    const randomDay = dayOptions[Math.floor(Math.random() * dayOptions.length)];
    await page.selectOption('select#day', randomDay);
    await delay(1000);
    console.log(`Selected Day: ${randomDay}`);

    // === SELECT MONTH ===
    await page.click('select#month');
    await delay(1000);
    const monthOptions = await page.$$eval('select#month option', opts => opts.map(o => o.value).filter(v => v));
    const randomMonth = monthOptions[Math.floor(Math.random() * monthOptions.length)];
    await page.selectOption('select#month', randomMonth);
    await delay(1000);
    console.log(`Selected Month: ${randomMonth}`);

    // === SELECT YEAR (<= 2005) ===
    const yearOptions = await page.$$eval('select#year option', opts =>
      opts.map(o => ({ value: o.value, text: o.innerText.trim() }))
        .filter(y => y.value && parseInt(y.value) <= 2005)
    );
    if (yearOptions.length === 0) throw new Error('No year <= 2005');
    const randomYear = yearOptions[Math.floor(Math.random() * yearOptions.length)].value;
    await page.selectOption('select#year', randomYear);
    await delay(1000);
    console.log(`Selected Year: ${randomYear}`);

    // === SELECT GENDER ===
    const gender = Math.random() < 0.5 ? '1' : '2';
    await page.click(`input[name="sex"][value="${gender}"]`);
    await delay(1000);
    console.log(`Selected Gender: ${gender === '1' ? 'Female' : 'Male'}`);

    // === FILL EMAIL ===
    await page.fill('input[name="reg_email__"]', email);
    await delay(1000);
    console.log(`Filled Email: ${email}`);

    // === FILL PASSWORD ===
    await page.fill('input[name="reg_passwd__"]', password);
    await delay(1000);
    console.log(`Filled Password: [HIDDEN]`);

    // === CLICK SIGN UP ===
    await page.click('button[name="websubmit"]');
    await delay(1000);
    console.log(`Clicked Sign Up`);

    // === WAIT FOR OTP FIELD ===
    console.log(`Waiting for OTP field...`);
    await page.waitForSelector('input#code_in_cliff', { state: 'visible', timeout: 30000 });

    // === OTP RETRIEVAL FUNCTION ===
    const getOtp = async () => {
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const cmd = `python3 zohomail.py inbox ${email}`;
          console.log(`[OTP Attempt ${attempt}] Running: ${cmd}`);
          const output = execSync(cmd, { encoding: 'utf8' }).trim();
          console.log(`Raw output:\n${output}`);

          const match = output.match(/\b(\d{5,6})\b/);
          if (match) {
            const otp = match[1];
            console.log(`OTP FOUND: ${otp}`);
            return otp;
          } else {
            console.log(`No OTP in output`);
          }
        } catch (err) {
          console.log(`Error: ${err.message}`);
        }
        if (attempt < 4) {
          console.log(`Waiting 5s before retry...`);
          await page.waitForTimeout(5000);
        }
      }
      return null;
    };

    let otp = null;
    let resendCount = 0;

    while (!otp && resendCount <= 1) {
      otp = await getOtp();
      if (!otp && resendCount === 0) {
        console.log(`OTP not found. Resending email...`);
        try {
          await page.click('a:has-text("Send Email Again")', { timeout: 10000 });
          await delay(2000);
          console.log(`Clicked "Send Email Again"`);
        } catch (e) {
          console.log(`Resend link not found`);
        }
        resendCount++;
      }
    }

    if (!otp) throw new Error('Failed to get OTP');

    // === ENTER OTP ===
    await page.fill('input#code_in_cliff', otp);
    await delay(1000);
    console.log(`OTP inserted: ${otp}`);

    // === CLICK CONTINUE ===
    await page.click('button[name="confirm"]');
    await delay(1000);
    console.log(`Clicked Continue`);

    // === AUTO DETECT ANY POPUP / MODAL / OVERLAY ===
    console.log(`Waiting for any popup/modal after OTP...`);
    const modalDetected = await page.waitForFunction(() => {
      const modals = document.querySelectorAll('div[role="dialog"], div[data-pagelet="RegistrationForm"], div._9o-k, div._4-i0, div._5lnf');
      return modals.length > 0 && Array.from(modals).some(m => m.offsetParent !== null);
    }, { timeout: 30000 }).catch(() => false);

    if (!modalDetected) {
      console.log(`No popup detected. Proceeding anyway...`);
    } else {
      console.log(`Popup/modal detected!`);
    }

    // === SAVE CREDENTIALS IMMEDIATELY ===
    let accounts = [];
    if (fs.existsSync('FB_account.json')) {
      const data = fs.readFileSync('FB_account.json', 'utf-8');
      try {
        accounts = JSON.parse(data);
        if (!Array.isArray(accounts)) {
          accounts = [accounts];
        }
      } catch (parseErr) {
        console.error(`Failed to parse existing FB_account.json: ${parseErr.message}. Starting new array.`);
        accounts = [];
      }
    }
    accounts.push({ email, password });
    fs.writeFileSync('FB_account.json', JSON.stringify(accounts, null, 2));
    console.log(`Appended credentials to FB_account.json`);

    // === OPEN PROFILE PAGE ===
    const profileUrl = 'https://www.facebook.com/profile.php?id=61581353993309';
    console.log(`Opening profile: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // === CLICK FOLLOW BUTTON ===
    console.log(`Looking for Follow button...`);
    try {
      await page.waitForSelector('span:has-text("Follow")', { state: 'visible', timeout: 15000 });
      await page.click('span:has-text("Follow")');
      await delay(1000);
      console.log(`Clicked Follow`);
    } catch (e) {
      console.log(`Follow button not found or already followed`);
    }

    // === FINAL SUCCESS ===
    console.log(`\n=== ACCOUNT CREATED, SAVED & FOLLOWED ===`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Browser will close in 3 seconds...\n`);

    await delay(3000);
    console.log("SUCCESS: Closing browser...");
    await browser.close();
    process.exit(0);

  } catch (error) {
    console.error(`\nSCRIPT FAILED: ${error.message}`);
    if (error.stack) console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    console.log(`Closing browser due to error...\n`);
    
    // Close browser on error
    try {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (closeErr) {
      console.error(`Error closing browser: ${closeErr.message}`);
    }

    process.exit(1);

  } finally {
    // Final safeguard
    try {
      if (browser && !browser.isConnected()) return;
      if (browser) await browser.close().catch(() => {});
    } catch (e) {}
  }
})();

// === 1-SECOND DELAY ===
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});