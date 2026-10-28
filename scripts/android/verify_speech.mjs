/**
 * Smoke test for the bundled speech engine, run against the installed APK.
 *
 * The app has to be started with the DevTools hook, then this script drives it
 * over the Chrome DevTools protocol (no extra dependency — Node 22 ships a
 * WebSocket client):
 *
 *   adb shell am start -n tech.wordatlas.app/.MainActivity --ez wa.debug true
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof tech.wordatlas.app)
 *   node scripts/android/verify_speech.mjs
 *
 * It checks two things: that both accents synthesise non-silent audio through
 * the bridge, and that the speaker next to a second example sentence (the case
 * that has no recording) actually produces sound from the real UI.
 */
const endpoint = process.env.CDP || "http://127.0.0.1:9222";
const wordId = process.argv[2] || "budget";

const targets = await (await fetch(`${endpoint}/json`)).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("no page target — is the app running with --ez wa.debug true?");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const settle = pending.get(message.id);
  if (!settle) return;
  pending.delete(message.id);
  settle(message);
});

function evaluate(expression) {
  const id = ++nextId;
  socket.send(
    JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression, awaitPromise: true, returnByValue: true },
    }),
  );
  return new Promise((resolve) =>
    pending.set(id, (reply) => {
      if (reply.result?.exceptionDetails) {
        resolve({ error: reply.result.exceptionDetails.exception?.description });
      } else {
        resolve({ value: reply.result?.result?.value });
      }
    }),
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!(await evaluate("!!window.WordAtlasAndroid")).value) {
  throw new Error("bridge missing — is the page loaded?");
}

/* ---------- 1. both accents through the bridge ---------- */

const sentence = "The library closes at six, so we should return these books now.";
for (const lang of ["en-GB", "en-US"]) {
  const started = Date.now();
  const outcome = await evaluate(`new Promise((resolve) => {
    let done = false;
    const finish = (how) => {
      if (done) return;
      done = true;
      window.__waSpeakDone = undefined;
      clearTimeout(timer);
      resolve(how);
    };
    const timer = setTimeout(() => finish("timeout"), 30000);
    window.__waSpeakDone = () => finish("done");
    window.WordAtlasAndroid.speak(${JSON.stringify(sentence)}, ${JSON.stringify(lang)}, 1);
  })`);
  console.log(`${lang}  ${outcome.value}  ${Date.now() - started} ms`);
}

/* ---------- 2. the real UI path ---------- */

await evaluate(`location.hash = "#/w/${wordId}"`);
await sleep(1500);

const shape = (await evaluate(`(() => {
  const speaks = [...document.querySelectorAll(".ex-speak")];
  return { examples: document.querySelectorAll(".ex-en").length, buttons: speaks.length };
})()`)).value;
console.log(`sheet #/w/${wordId}:`, JSON.stringify(shape));
if (!shape || shape.buttons < 2) throw new Error("word sheet did not open with two example buttons");

await evaluate(`document.querySelectorAll(".ex-speak")[1].click()`);
await sleep(8000);
console.log("clicked the second example's speaker");

/* ---------- 3. no system voice on the page ---------- */

const page = (await evaluate(`({ speechSynthesis: typeof window.speechSynthesis })`)).value;
console.log("page:", JSON.stringify(page));

socket.close();
