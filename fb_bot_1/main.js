const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// === USER AGENT LOADER: FILTERS OUT ANDROID & OLD UAs ===
const uaPath = path.resolve(__dirname, 'user_agents.txt');
if (!fs.existsSync(uaPath)) throw new Error('user_agents.txt not found');

let rawUserAgents = fs.readFileSync(uaPath, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean);

const uniqueUAs = [...new Set(rawUserAgents.map(ua => ua.replace(/^(Chrome|Edge|Firefox):\s*/i, '').trim()))];

const validUAs = uniqueUAs.filter(ua => {
  if (ua.toLowerCase().includes('android')) return false;
  const oldPatterns = [
    /Windows NT 5\./,
    /Windows NT 6\.0/,
    /Windows NT 6\.1/,
    /rv:1[0-1]\./,
    /Firefox\/[1-4]\d\./,
    /Chrome\/[1-4]\d\./,
    /Safari\/53[0-4]\./,
    /Edge\/1[0-7]\./
  ];
  return !oldPatterns.some(pattern => pattern.test(ua));
});

if (validUAs.length === 0) throw new Error('No valid user agents found after filtering. Update user_agents.txt.');

console.log(`Loaded ${validUAs.length} valid modern desktop UAs.`);

// === MAIN ASYNC FUNCTION WITH FULL ERROR HANDLING ===
(async () => {
  let browser = null;
  let context = null;
  let page = null;

  // === CLEANUP FUNCTION ===
  const cleanup = async () => {
    try {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (err) {
      console.error('Error during cleanup:', err.message);
    }
  };

  // === HELPER: SAVE EMAIL TO FB_invalid.json ===
  const markEmailAsInvalid = (email) => {
    const invalidPath = path.resolve(__dirname, 'FB_invalid.json');
    let invalidEmails = [];

    if (fs.existsSync(invalidPath)) {
      try {
        const data = fs.readFileSync(invalidPath, 'utf8');
        invalidEmails = JSON.parse(data);
        if (!Array.isArray(invalidEmails)) invalidEmails = [];
      } catch (e) {
        console.log('FB_invalid.json corrupted, resetting...');
        invalidEmails = [];
      }
    }

    if (!invalidEmails.includes(email)) {
      invalidEmails.push(email);
      fs.writeFileSync(invalidPath, JSON.stringify(invalidEmails, null, 2), 'utf8');
      console.log(`Email marked as invalid and saved to FB_invalid.json: ${email}`);
    }
  };

  // === HELPER: LOAD INVALID EMAILS ===
  const loadInvalidEmails = () => {
    const invalidPath = path.resolve(__dirname, 'FB_invalid.json');
    if (!fs.existsSync(invalidPath)) return new Set();

    try {
      const data = JSON.parse(fs.readFileSync(invalidPath, 'utf8'));
      return Array.isArray(data) ? new Set(data) : new Set();
    } catch (e) {
      console.log('Failed to read FB_invalid.json, treating as empty.');
      return new Set();
    }
  };

  try {
    const fbAccountPath = path.resolve(__dirname, 'FB_account.json');
    const fbLoginPath = path.resolve(__dirname, 'FB_login.json');
    const fbProfilePath = path.resolve(__dirname, 'fb_profile.json');

    if (!fs.existsSync(fbAccountPath)) throw new Error('FB_account.json not found');

    // === ENSURE FB_login.json EXISTS AND IS VALID ===
    let fbLoginArr = [];
    try {
      if (!fs.existsSync(fbLoginPath)) {
        const data = fs.readFileSync(fbAccountPath, 'utf8');
        fs.writeFileSync(fbLoginPath, data, 'utf8');
      }
      fbLoginArr = JSON.parse(fs.readFileSync(fbLoginPath, 'utf8'));
      if (!Array.isArray(fbLoginArr) || fbLoginArr.length === 0) {
        const data = fs.readFileSync(fbAccountPath, 'utf8');
        fs.writeFileSync(fbLoginPath, data, 'utf8');
        fbLoginArr = JSON.parse(data);
      }
    } catch (err) {
      throw new Error('Failed preparing FB_login.json: ' + err.message);
    }

    // === LOAD EXISTING EMAILS FROM fb_profile.json AND FB_invalid.json ===
    let processedEmails = new Set();
    if (fs.existsSync(fbProfilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(fbProfilePath, 'utf8'));
        if (Array.isArray(data)) {
          processedEmails = new Set(data.map(item => item.email));
        }
      } catch (err) {
        console.log('fb_profile.json corrupted. Starting fresh.');
      }
    }

    const invalidEmails = loadInvalidEmails();

    // === FILTER OUT ALREADY PROCESSED + INVALID ACCOUNTS ===
    const availableAccounts = fbLoginArr.filter(acc => 
      !processedEmails.has(acc.email) && 
      !invalidEmails.has(acc.email)
    );
    
    // === RECOPY FB_account.json → FB_login.json IF NO ACCOUNTS LEFT ===
    if (availableAccounts.length === 0) {
      console.log('No new valid accounts to process. Recopying FB_account.json to FB_login.json...');
      const data = fs.readFileSync(fbAccountPath, 'utf8');
      fs.writeFileSync(fbLoginPath, data, 'utf8');
      console.log('Recopy complete. Ready for next cycle.');
      return; // Exit cleanly
    }

    const idx = Math.floor(Math.random() * availableAccounts.length);
    const { email, password } = availableAccounts[idx];
    console.log(`Selected new account: ${email}`);

    // === REMOVE FROM FB_login.json ===
    fbLoginArr = fbLoginArr.filter(acc => acc.email !== email);
    fs.writeFileSync(fbLoginPath, JSON.stringify(fbLoginArr, null, 2), 'utf8');

    // === FRESH LOGIN + UA DETECTION LOOP (NO REPEAT) ===
    let usedUAs = new Set();
    let currentUA = null;

    while (true) {
      const availableUAs = validUAs.filter(ua => !usedUAs.has(ua));
      if (availableUAs.length === 0) {
        throw new Error('All valid user agents failed. Update user_agents.txt with modern desktop UAs.');
      }

      currentUA = availableUAs[Math.floor(Math.random() * availableUAs.length)];
      usedUAs.add(currentUA);
      console.log(`Trying User Agent: ${currentUA}`);

      browser = await firefox.launch({ headless: false });
      context = await browser.newContext({
        userAgent: currentUA,
        viewport: null,
        bypassCSP: true,
      });
      page = await context.newPage();

      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      await page.goto('https://web.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

      const outdatedBanner = page.locator('div.pam.fbPageBanner.uiBoxYellow.noborder[role="alert"] span.fsl.fwb').first();
      const isOutdated = await outdatedBanner.isVisible({ timeout: 8000 }).catch(() => false);

      if (isOutdated) {
        console.log('OUTDATED USER AGENT DETECTED! Switching to next...');
        await cleanup();
        continue;
      } else {
        console.log('User Agent is GOOD. Proceeding...');
        break;
      }
    }

    // === LOGIN ===
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="pass"]', password);

    const loginBtn = page.locator('button[name="login"]');
    if (await loginBtn.isVisible({ timeout: 5000 })) {
      await loginBtn.click();
    } else {
      await page.locator('xpath=/html/body/div[1]/div/div[1]/div/div[1]/div/div/div[1]/div[1]/form/div/div/div/div[5]').click();
    }

    await page.waitForTimeout(5000);

    // === CHECK FOR 2FA PAGE ===
    const currentUrl = page.url();
    if (currentUrl.includes('two_step_verification/authentication')) {
      console.log('2FA detected. Waiting for verification and redirect...');
      await page.waitForURL('https://web.facebook.com/', { timeout: 120000 });
      console.log('Redirected to home after 2FA.');
    } else {
      console.log('No 2FA. Proceeding...');
    }

    // === GO TO PROFILE & CONFIRM URL ===
    const profileUrl = 'https://web.facebook.com/profile.php';
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);

    const currentProfileUrl = page.url();
    if (!currentProfileUrl.includes('profile.php')) {
      console.log(`Not on profile page. Current URL: ${currentProfileUrl}. Exiting.`);
      markEmailAsInvalid(email);  // ← NEW: Save to FB_invalid.json
      await cleanup();
      return;
    }
    console.log('Confirmed on profile page.');

    // === CLICK "EDIT PROFILE" AND CONFIRM DIALOG ===
    const clickEditProfile = async () => {
      const editProfileBtn = page.locator('div[role="button"][aria-label="Edit profile"]');
      for (let i = 0; i < 3; i++) {
        try {
          await editProfileBtn.waitFor({ state: 'visible', timeout: 10000 });
          await editProfileBtn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          await Promise.all([
            page.waitForEvent('dialog', { timeout: 15000 }).catch(() => {}),
            editProfileBtn.click({ force: true, timeout: 10000 })
          ]);

          const editDialog = page.locator('div[role="dialog"][aria-label="Edit profile"]');
          if (await editDialog.isVisible({ timeout: 10000 })) {
            console.log('"Edit profile" clicked and dialog opened.');
            return true;
          }
        } catch (err) {
          console.log(`Edit profile click attempt ${i + 1} failed, retrying...`);
          await page.waitForTimeout(2000);
        }
      }
      return false;
    };

    let editProfileClicked = await clickEditProfile();
    if (!editProfileClicked) {
      console.log('"Edit profile" failed after 3 attempts.');
      throw new Error('Failed to open Edit Profile dialog');
    }

    // === PROFILE PICTURE ===
    console.log('Checking profile picture button text...');

    const profilePicContainer = page.locator('div[role="button"][aria-label="Add profile picture"], div[role="button"][aria-label="Edit profile picture"]');
    let profileAddClicked = false;
    let profileStatus = "no";

    try {
      await profilePicContainer.waitFor({ state: 'visible', timeout: 60000 });

      const innerText = await profilePicContainer.locator('span.x1lliihq').first().innerText();
      console.log(`Profile picture button text: "${innerText}"`);

      if (innerText.trim() === 'Add') {
        for (let i = 0; i < 3; i++) {
          try {
            await profilePicContainer.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);

            await Promise.all([
              page.waitForEvent('dialog', { timeout: 15000 }).catch(() => {}),
              profilePicContainer.click({ force: true, timeout: 10000 })
            ]);

            const choosePicDialog = page.locator('div[role="dialog"][aria-label="Choose profile picture"]');
            if (await choosePicDialog.isVisible({ timeout: 10000 })) {
              console.log('"Add profile picture" clicked to dialog opened.');
              profileAddClicked = true;
              break;
            }
          } catch (err) {
            console.log(`Profile Add click attempt ${i + 1} failed, retrying...`);
            await page.waitForTimeout(1500);
          }
        }
      } else {
        console.log('Profile picture already exists (text: "Edit"). Skipping.');
        profileStatus = "yes";
      }
    } catch (err) {
      console.log('Profile picture button not found in 60s.');
    }

    // === PROFILE UPLOAD IF CLICKED ===
    if (profileAddClicked) {
      const choosePicDialog = page.locator('div[role="dialog"][aria-label="Choose profile picture"]');

      let imagePath;
      try {
        const output = execSync('python3 img.py', { encoding: 'utf8', timeout: 30000 });
        imagePath = output.trim();
        if (!fs.existsSync(imagePath)) throw new Error('Image not found');
        console.log(`Profile image: ${imagePath}`);
      } catch (err) {
        throw new Error('Failed to generate profile image');
      }

      const uploadBtn = choosePicDialog.locator('div[role="button"][aria-label="Upload Photo"]');
      try {
        await uploadBtn.waitFor({ state: 'visible', timeout: 20000 });
        await uploadBtn.click({ force: true });
        console.log('"Upload Photo" clicked (profile).');
      } catch (err) {
        console.log('"Upload Photo" not found (profile).');
      }

      const fileInput = choosePicDialog.locator('input[type="file"]');
      try {
        await fileInput.setInputFiles(imagePath);
        console.log('Profile image uploaded.');
      } catch (err) {
        console.log('Profile upload failed.');
      }

      const saveBtn = choosePicDialog.locator('span').filter({ hasText: 'Save' }).first();
      try {
        await saveBtn.waitFor({ state: 'visible', timeout: 10000 });
        await saveBtn.click({ force: true });
        console.log('Profile saved.');
        profileStatus = "yes";
      } catch (err) {
        console.log('Profile Save not found.');
      }

      await page.waitForTimeout(3000);
    }

    // === RE-OPEN "EDIT PROFILE" DIALOG FOR COVER PHOTO ===
    console.log('Re-opening "Edit profile" dialog for cover photo...');
    editProfileClicked = await clickEditProfile();
    if (!editProfileClicked) {
      throw new Error('Failed to re-open Edit profile dialog for cover photo.');
    }

    // === COVER PHOTO — USING XPATH DIRECTLY (NO CSS FALLBACK) ===
    console.log('Looking for cover photo edit button via XPath...');

    let coverButton = null;
    let buttonText = '';
    let coverStatus = "no";

    try {
      coverButton = page.locator('xpath=/html/body/div[1]/div/div[1]/div/div[4]/div/div/div[1]/div/div[2]/div/div/div/div[4]/div/div[1]/div/div/div/div/div/span/div/div[2]/div/div[2]/div/div/span/span');
      await coverButton.waitFor({ state: 'visible', timeout: 10000 });
      buttonText = await coverButton.innerText();
      console.log(`Cover button text: "${buttonText}"`);
    } catch (err) {
      console.log('Cover button not found via XPath.');
    }

    let coverAddClicked = false;
    if (coverButton && buttonText.trim() === 'Add') {
      for (let i = 0; i < 3; i++) {
        try {
          await coverButton.scrollIntoViewIfNeeded();
          await page.waitForTimeout(800);

          await Promise.all([
            page.waitForSelector('div[role="dialog"][aria-label="Update cover photo"]', { timeout: 15000 }).catch(() => {}),
            coverButton.click({ force: true, timeout: 10000 })
          ]);

          const updateDialog = page.locator('div[role="dialog"][aria-label="Update cover photo"]');
          if (await updateDialog.isVisible({ timeout: 10000 })) {
            console.log('"Add cover photo" clicked → Update dialog opened.');
            coverAddClicked = true;
            break;
          }
        } catch (err) {
          console.log(`Cover Add click attempt ${i + 1} failed, retrying...`);
          await page.waitForTimeout(2000);
        }
      }
    } else if (coverButton && buttonText.trim() === 'Edit') {
      console.log('Cover already exists (text: "Edit"). Skipping.');
      coverStatus = "yes";
    }

    // === COVER UPLOAD WITH ROBUST SAVE BUTTON + XPATH FALLBACK ===
    if (coverAddClicked) {
      const updateDialog = page.locator('div[role="dialog"][aria-label="Update cover photo"]');

      const fileInput = updateDialog.locator('input.x1s85apg[type="file"]');
      try {
        await fileInput.waitFor({ state: 'attached', timeout: 20000 });
        console.log('File input found in dialog.');
      } catch (err) {
        throw new Error('File input not found in cover dialog.');
      }

      let coverPath;
      let imageReady = false;
      for (let attempt = 0; attempt < 5 && !imageReady; attempt++) {
        try {
          const output = execSync('python3 img.py', { encoding: 'utf8', timeout: 30000 });
          coverPath = output.trim();
          if (fs.existsSync(coverPath)) {
            console.log(`Cover image ready: ${coverPath}`);
            imageReady = true;
          } else {
            console.log(`Image not found, retrying... (${attempt + 1}/5)`);
            await page.waitForTimeout(2000);
          }
        } catch (err) {
          console.log(`img.py failed (${attempt + 1}/5), retrying...`);
          await page.waitForTimeout(2000);
        }
      }

      if (!imageReady) {
        throw new Error('Failed to generate cover image after retries.');
      }

      try {
        await fileInput.setInputFiles(coverPath);
        console.log('Cover image uploaded via direct input.');

        let saveBtn = updateDialog.locator('div[aria-label="Save"][role="button"]');
        let saveClicked = false;

        try {
          await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
          await saveBtn.click({ force: true });
          console.log('Save button clicked via aria-label="Save".');
          saveClicked = true;
        } catch (err) {
          console.log('aria-label Save button not found, trying XPath fallback...');
          saveBtn = page.locator('xpath=/html/body/div[1]/div/div[1]/div/div[4]/div/div[2]/div[1]/div/div[2]/div/div/div/div[3]/div/div[3]/div[2]/div/div/div[1]/div/span/span/span/span');
          try {
            await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
            await saveBtn.click({ force: true });
            console.log('Save button clicked via XPath fallback.');
            saveClicked = true;
          } catch (xpathErr) {
            console.log('XPath Save button also failed.');
          }
        }

        if (saveClicked) {
          try {
            await updateDialog.waitFor({ state: 'hidden', timeout: 15000 });
            console.log('Cover photo saved successfully — dialog closed.');
            coverStatus = "yes";
          } catch {
            console.log('Dialog did not close, but save may have succeeded.');
            coverStatus = "yes";
          }
        } else {
          console.log('Failed to click Save button via both methods.');
        }
      } catch (err) {
        console.log('Cover upload or save failed:', err.message);
      }

      await page.waitForTimeout(3000);
    }

    // === SAVE SESSION ONLY AFTER "EDIT PROFILE" SUCCESSFULLY OPENED ===
    const sessionFile = path.resolve(__dirname, `session/${email}.json`);
    const sessionDir = path.dirname(sessionFile);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    try {
      const storageState = await context.storageState();
      fs.writeFileSync(sessionFile, JSON.stringify(storageState, null, 2), 'utf8');
      console.log(`Session saved: ${sessionFile}`);
    } catch (err) {
      console.error('Failed to save session:', err.message);
    }

    // === SAVE TO fb_profile.json ===
    const profileData = {
      email,
      password,
      profile: profileStatus
    };

    let existingData = [];
    if (fs.existsSync(fbProfilePath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(fbProfilePath, 'utf8'));
        if (!Array.isArray(existingData)) existingData = [];
      } catch (err) {
        console.log('Corrupted fb_profile.json, starting fresh.');
        existingData = [];
      }
    }

    existingData = existingData.filter(item => item.email !== email);
    existingData.push(profileData);

    fs.writeFileSync(fbProfilePath, JSON.stringify(existingData, null, 2), 'utf8');
    console.log(`Profile data saved to ${fbProfilePath}`);

    console.log('All tasks completed successfully.');

    // === WAIT 3 SECONDS AND CLOSE BROWSER ===
    console.log('Waiting 3 seconds before closing browser...');
    await page.waitForTimeout(3000);
    await cleanup();

  } catch (error) {
    // === ANY ERROR: LOG + CLEANUP ===
    console.error('Automation failed:', error.message);
    await cleanup();
  }
})();