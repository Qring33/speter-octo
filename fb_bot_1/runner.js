const { exec } = require('child_process');

const scripts = ['main.js'];
const totalRunsPerScript = 5;        // main.js repeats
const timeoutMs = 10 * 60 * 1000;
const delayBetweenRuns = 2000;

let currentScriptIndex = 0;
let currentRun = 0;

console.log("Starting sequence — downloader.py → main.js loops → upload.py → push.py\n");

// ---------------------------
// STEP 1 — Run downloader.py ONCE
// ---------------------------
function runDownloader() {
  console.log("Running downloader.py (only once)...\n");

  const p = exec("python3 downloader.py", { timeout: 5 * 60 * 1000 });
  p.stdout.on("data", (d) => process.stdout.write(d));
  p.stderr.on("data", (d) => process.stderr.write(d));

  p.on("close", () => {
    console.log("downloader.py completed.\n");
    runMainScripts();
  });

  p.on("error", (err) => {
    console.error("downloader.py failed:", err);
    runMainScripts(); // Continue anyway
  });
}

// ---------------------------
// STEP 2 — Loop main.js N times
// ---------------------------
function runMainScripts() {
  const script = scripts[currentScriptIndex];

  if (!script) {
    return runUploadFinal();
  }

  if (currentRun >= totalRunsPerScript) {
    currentRun = 0;
    currentScriptIndex++;

    if (!scripts[currentScriptIndex]) {
      return runUploadFinal();
    }

    return setTimeout(runMainScripts, 1000);
  }

  currentRun++;
  console.log(`\n[${script}] Run ${currentRun} of ${totalRunsPerScript} starting...`);

  const instance = exec(`node ${script}`, { timeout: timeoutMs });
  instance.stdout.on("data", (d) => process.stdout.write(d));
  instance.stderr.on("data", (d) => process.stderr.write(d));

  instance.on("close", () => {
    setTimeout(runMainScripts, delayBetweenRuns);
  });

  instance.on("error", () => {
    setTimeout(runMainScripts, delayBetweenRuns);
  });
}

// ---------------------------
// STEP 3 — Run upload.py ONCE
// ---------------------------
function runUploadFinal() {
  console.log("\nRunning upload.py (only once)...\n");

  const up = exec("python3 upload.py", { timeout: 5 * 60 * 1000 });
  up.stdout.on("data", (d) => process.stdout.write(d));
  up.stderr.on("data", (d) => process.stderr.write(d));

  up.on("close", () => {
    runPushFinal();
  });

  up.on("error", (err) => {
    console.error("upload.py failed:", err);
    runPushFinal();
  });
}

// ---------------------------
// STEP 4 — Run push.py ONCE (final step)
// ---------------------------
function runPushFinal() {
  console.log("\nRunning push.py (final step, only once)...\n");

  const pp = exec("python3 push.py", { timeout: 5 * 60 * 1000 });
  pp.stdout.on("data", (d) => process.stdout.write(d));
  pp.stderr.on("data", (d) => process.stderr.write(d));

  pp.on("close", (code) => {
    if (code === 0) {
      console.log("\nAll tasks completed successfully!\n");
    } else {
      console.log(`\npush.py exited with code ${code}\n`);
    }
  });

  pp.on("error", (err) => {
    console.error("\nFailed to start push.py:", err);
    console.log("\nSequence finished with errors.\n");
  });
}

// Start execution
runDownloader();