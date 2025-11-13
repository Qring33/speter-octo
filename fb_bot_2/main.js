const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Dropbox = require('dropbox').Dropbox;
global.fetch = require('node-fetch'); // Required for Dropbox

// === USER AGENT LOADER ===
const uaPath = path.resolve(__dirname, 'user_agents.txt');
if (!fs.existsSync(uaPath)) throw new Error('user_agents.txt not found');

let rawUserAgents = fs.readFileSync(uaPath, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean);

const uniqueUAs = [...new Set(
  rawUserAgents.map(ua => ua.replace(/^(Chrome|Edge|Firefox):\s*/i, '').trim())
)];

const validUAs = uniqueUAs.filter(ua => {
  if (ua.toLowerCase().includes('android')) return false;
  const oldPatterns = [
    /Windows NT 5\./, /Windows NT 6\.0/, /Windows NT 6\.1/,
    /rv:1[0-1]\./, /Firefox\/[1-4]\d\./, /Chrome\/[1-4]\d\./,
    /Safari\/53[0-4]\./, /Edge\/1[0-7]\./
  ];
  return !oldPatterns.some(p => p.test(ua));
});

if (validUAs.length === 0) throw new Error('No valid user agents found.');
console.log(`Loaded ${validUAs.length} valid modern desktop UAs.`);

// === MAIN ===
(async () => {
  let browser = null;
  let tempSessionPath = null;
  let sessionExpired = false;

  const cleanup = async () => {
    if (tempSessionPath && fs.existsSync(tempSessionPath)) {
      try { fs.unlinkSync(tempSessionPath); } catch (e) {}
    }
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  };

  try {
    // === Load Dropbox Token ===
    const tokenPath = path.resolve(__dirname, 'token.txt');
    if (!fs.existsSync(tokenPath)) throw new Error('token.txt not found');
    const accessToken = fs.readFileSync(tokenPath, 'utf8').trim();
    const dbx = new Dropbox({ accessToken });

    // === Load used sessions path ===
    const usedPath = path.resolve(__dirname, 'session_used.txt');

    // === MAIN SESSION LOOP: Retry until we get a valid unused session ===
    let randomSession = null;
    let emailFromSession = null;
    let email = null;
    let password = null;

    while (!randomSession) {
      try {
        // === List JSON files in /session ===
        const folderResponse = await dbx.filesListFolder({ path: '/session' });
        const jsonFiles = folderResponse.result.entries
          .filter(e => e['.tag'] === 'file' && e.name.endsWith('.json'))
          .map(e => e.name);

        if (jsonFiles.length === 0) throw new Error('No session files in /session');

        // === Load used sessions ===
        let usedSessions = [];
        if (fs.existsSync(usedPath)) {
          usedSessions = fs.readFileSync(usedPath, 'utf8')
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);
        }

        const availableSessions = jsonFiles.filter(f => !usedSessions.includes(f));
        if (availableSessions.length === 0) {
          console.log('No unused sessions. Resetting session_used.txt and restarting...');
          if (fs.existsSync(usedPath)) {
            fs.unlinkSync(usedPath);
            console.log('session_used.txt deleted. Starting fresh.');
          }
          continue; // Retry loop
        }

        randomSession = availableSessions[Math.floor(Math.random() * availableSessions.length)];
        console.log(`Selected session: ${randomSession}`);

        // === Extract email from filename ===
        emailFromSession = randomSession.replace('.json', '');
        console.log(`Extracted email: ${emailFromSession}`);

        // === Load FB_account.json ===
        const accountPath = path.resolve(__dirname, 'FB_account.json');
        if (!fs.existsSync(accountPath)) throw new Error('FB_account.json not found');
        const accounts = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
        const account = accounts.find(a => a.email === emailFromSession);
        if (!account) throw new Error(`No account found for ${emailFromSession}`);

        email = account.email;
        password = account.password;
        console.log(`Found credentials for ${email}`);

        break; // Exit loop — we have a valid session

      } catch (err) {
        console.error('Session selection error:', err.message);
        if (err.message.includes('No unused sessions')) {
          console.log('Resetting session_used.txt...');
          if (fs.existsSync(usedPath)) fs.unlinkSync(usedPath);
        }
        await new Promise(r => setTimeout(r, 3000)); // Avoid tight loop
      }
    }

    // === Download session to temp file ===
    tempSessionPath = path.join(os.tmpdir(), `playwright_session_${Date.now()}.json`);
    const downloadResponse = await dbx.filesDownload({ path: `/session/${randomSession}` });
    const fileBuffer = downloadResponse.result.fileBuffer || Buffer.from(downloadResponse.result.fileBinary, 'binary');
    fs.writeFileSync(tempSessionPath, fileBuffer);

    // === Launch browser with full storage state ===
    browser = await firefox.launch({ headless: false });
    const context = await browser.newContext({
      viewport: null,
      bypassCSP: true,
      storageState: tempSessionPath
    });

    const page = await context.newPage();

    // === Hide webdriver ===
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // === Set initial User Agent ===
    let currentUA = validUAs[Math.floor(Math.random() * validUAs.length)];
    await context.addInitScript((ua) => {
      Object.defineProperty(navigator, 'userAgent', {
        get: () => ua,
        configurable: true
      });
    }, currentUA);
    console.log(`Initial User Agent: ${currentUA}`);

    // === Target Profile URL ===
    const profileUrl = 'https://web.facebook.com/profile.php?id=61581353993309';
    console.log(`Navigating to: ${profileUrl}`);

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // === CHECK FOR SESSION EXPIRED DIALOG ===
    const expiredDialog = await page.$('div[role="dialog"].x1n2onr6.x1ja2u2z.x1afcbsf');
    if (expiredDialog) {
      console.log('SESSION EXPIRED: Dialog detected. Starting login flow...');
      sessionExpired = true;

      await page.goto('https://web.facebook.com/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

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
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(5000);

      const currentProfileUrl = page.url();
      if (!currentProfileUrl.includes('profile.php')) {
        console.log(`Not on profile page. Current URL: ${currentProfileUrl}. Exiting.`);
        await cleanup();
        return;
      }
      console.log('Confirmed on profile page after login.');

    } else {
      console.log('Session valid. Proceeding...');
    }

    // === Check for "This browser is not supported" ===
    const unsupportedBanner = await page.$(
      'div > img[src*="MpdfZ1mwXmC.png"] ~ h1:has-text("This browser is not supported")'
    );

    if (unsupportedBanner) {
      console.log('Detected: "This browser is not supported" to Changing User Agent...');
      let newUA;
      do {
        newUA = validUAs[Math.floor(Math.random() * validUAs.length)];
      } while (newUA === currentUA && validUAs.length > 1);
      currentUA = newUA;
      console.log(`Switching to: ${currentUA}`);
      await context.addInitScript((ua) => {
        Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
      }, currentUA);
      await context.setExtraHTTPHeaders({ 'User-Agent': currentUA });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);
      const stillBlocked = await page.$('div > img[src*="MpdfZ1mwXmC.png"] ~ h1:has-text("This browser is not supported")');
      if (stillBlocked) throw new Error('Still blocked after UA change.');
      console.log('Success: Page loaded after UA change.');
    } else {
      console.log('No browser warning. Proceeding...');
    }

    // === FOLLOW BUTTON (Using your XPath) ===
    const followButtonXPath = `/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div/div[1]/div[2]/div/div/div/div[4]/div/div/div[2]/div/div/div/div/div[1]/div[2]/span/span`;
    const buttonTextEl = await page.waitForSelector(`xpath=${followButtonXPath}`, { timeout: 10000 }).catch(() => null);

    if (buttonTextEl) {
      const buttonText = await buttonTextEl.innerText();
      console.log(`Follow button text: "${buttonText}"`);
      if (buttonText.trim() === 'Follow') {
        console.log('Clicking Follow...');
        const parentButton = await page.$('xpath=/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div/div[1]/div[2]/div/div/div/div[4]/div/div/div[2]/div/div/div/div/div[1]');
        if (parentButton) {
          await parentButton.click();
          await page.waitForTimeout(2000);
          console.log('Followed successfully.');
        }
      } else {
        console.log('Already following. Skipping.');
      }
    } else {
      console.log('Follow button not found. Continuing...');
    }

    // === PROCESS VIDEOS 1 to 5 USING aria-posinset (FORCE SWITCH) ===
    const processedVideos = new Set(); // Prevent re-processing

    for (let pos = 1; pos <= 2; pos++) {
      const block = await page.$(`div[aria-posinset="${pos}"]`);
      if (!block) {
        console.log(`\n--- Video ${pos}/2: aria-posinset="${pos}" not found. Skipping. ---`);
        continue;
      }

      console.log(`\n--- Processing Video ${pos}/2 (aria-posinset="${pos}") ---`);

      try {
        // === Get caption (first line only for like tracking) ===
        const captionDiv = await block.$('div[dir="auto"]');
        let firstLine = 'No caption';
        if (captionDiv) {
          const fullText = await captionDiv.innerText();
          const seeMore = await captionDiv.$('div[role="button"]:has-text("See more")');
          if (seeMore) {
            await seeMore.click();
            await page.waitForTimeout(500);
          }
          firstLine = fullText.split('\n')[0].trim();
        }

        const videoKey = `pos_${pos}_line_${firstLine}`;
        if (processedVideos.has(videoKey)) {
          console.log('Video already processed. Skipping.');
          continue;
        }

        // === Click Play Button ===
        const playButton = await block.$('div[aria-label="Play Video"]');
        if (playButton) {
          console.log('Clicking Play...');
          await playButton.click({ force: true });
        } else {
          console.log('Play button not found. Skipping.');
          continue;
        }

        // === Random wait 10–30s ===
        const watchTime = 10000 + Math.floor(Math.random() * 20000);
        console.log(`Watching for ${watchTime / 1000} seconds...`);
        await page.waitForTimeout(watchTime);

        // === DYNAMIC LIKE LOGIC: Use pos in XPath ===
        let likeClicked = false;

        // 1. Try primary selector (global)
        const likeContainer1 = await page.$('div.xbmvrgn.x1diwwjn');
        if (likeContainer1) {
          const likeButton1 = await likeContainer1.$('div[aria-label="Like"]');
          if (likeButton1) {
            await likeButton1.click({ force: true });
            likeClicked = true;
          }
        }

        // 2. Fallback: Use dynamic XPath based on current pos
        if (!likeClicked) {
          // === DYNAMIC STATE CHECK: div[pos] ===
          const likeStateXPath = `/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div/div[4]/div[2]/div/div[2]/div[3]/div[${pos}]/div/div/div/div/div/div/div/div/div/div/div/div[13]/div/div/div[4]/div/div/div[1]/div/div[2]/div/div[1]/div[1]`;
          const likeStateEl = await page.$(`xpath=${likeStateXPath}`);

          if (likeStateEl) {
            const ariaLabel = await likeStateEl.getAttribute('aria-label');
            console.log(`Like button state (pos ${pos}): "${ariaLabel}"`);

            if (ariaLabel === 'Remove Like') {
              console.log('Already liked. Skipping.');
              processedVideos.add(videoKey);
              continue;
            }

            if (ariaLabel === 'Like') {
              // === DYNAMIC CLICK: div[pos] ===
              const likeClickXPath = `/html/body/div[1]/div/div[1]/div/div[3]/div/div/div[1]/div[1]/div/div/div[4]/div[2]/div/div[2]/div[3]/div[${pos}]/div/div/div/div/div/div/div/div/div/div/div/div[13]/div/div/div[4]/div/div/div[1]/div/div[2]/div/div[1]`;
              const likeButtonXPath = await page.$(`xpath=${likeClickXPath}`);

              if (likeButtonXPath) {
                let attempts = 0;
                while (attempts < 3) {
                  console.log(`Attempt ${attempts + 1}: Clicking Like via dynamic XPath (pos ${pos})...`);
                  await likeButtonXPath.click({ force: true });
                  await page.waitForTimeout(800);

                  const newState = await likeStateEl.getAttribute('aria-label');
                  if (newState === 'Remove Like') {
                    console.log('Like confirmed: now shows "Remove Like"');
                    likeClicked = true;
                    break;
                  }
                  attempts++;
                }

                if (!likeClicked) {
                  console.log('Failed to confirm like after 3 attempts.');
                }
              }
            }
          } else {
            console.log(`Like state element not found for pos ${pos}.`);
          }
        }

        if (likeClicked) {
          processedVideos.add(videoKey);
          console.log('Like successful and verified.');
        } else {
          console.log('Like failed or skipped.');
        }

      } catch (err) {
        console.log(`Error in video ${pos}: ${err.message}`);
      }
    }

    // === SAVE UPDATED SESSION BACK TO DROPBOX ===
    const updatedSessionPath = path.join(os.tmpdir(), `updated_${randomSession}`);
    await context.storageState({ path: updatedSessionPath });
    console.log(`Saving updated session: ${randomSession}`);

    const fileContent = fs.readFileSync(updatedSessionPath);
    await dbx.filesUpload({
      path: `/session/${randomSession}`,
      contents: fileContent,
      mode: { '.tag': 'overwrite' }
    });
    console.log(`Session ${randomSession} saved back to Dropbox.`);

    // === Mark session as used ===
    fs.appendFileSync(usedPath, `${randomSession}\n`);
    console.log(`\nSession ${randomSession} marked as used.`);

    console.log('All tasks completed. Closing browser...');
    await cleanup();

  } catch (err) {
    console.error('Error:', err.message);
    if (err.stack) console.error(err.stack);
    console.log('Closing browser due to error...');
    await cleanup();
  }
})();