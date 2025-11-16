const { exec } = require('child_process');

const scripts = ['main.js'];          // Node scripts
const totalRunsPerScript = 0;         // main.js repeated count
const timeoutMs = 10 * 60 * 1000;
const delayBetweenRuns = 2000;

let currentScriptIndex = 0;
let currentRun = 0;

console.log("Starting sequence — main.js loops → push.py\n");

// ---------------------------
// STEP 1 — Loop main.js N times
// ---------------------------
function runMainScripts() {
  const script = scripts[currentScriptIndex];

  if (!script) {
    return runPushFinal(); // Move to push.py
  }

  if (currentRun >= totalRunsPerScript) {
    currentRun = 0;
    currentScriptIndex++;

    if (!scripts[currentScriptIndex]) {
      return runPushFinal();
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
// STEP 2 — Run push.py ONCE (final step)
// ---------------------------
function runPushFinal() {
  console.log("\nRunning push.py (final step)...\n");

  const pp = exec("python3 push.py", { timeout: 5 * 60 * 1000 });
  pp.stdout.on("data", (d) => process.stdout.write(d));
  pp.stderr.on("data", (d) => process.stderr.write(d));

  pp.on("close", () => {
    console.log("\nAll tasks completed.\n");
  });

  pp.on("error", (err) => {
    console.error("push.py encountered an error:", err);
    console.log("\nSequence finished with errors.\n");
  });
}

// Start execution
runMainScripts();
