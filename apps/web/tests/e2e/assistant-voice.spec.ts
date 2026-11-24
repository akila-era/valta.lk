import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * The VOLTA AI modal in a real browser: layout, language choice, clear conversation, typing indicator, and the whole voice
 * experience (microphone permission, recording with timer and waveform, stop and cancel, editable transcription, spoken replies with
 * play, pause, replay and mute).
 *
 * IMPORTANT: the website's voice routes (/api/assistant/voice/transcribe and /speak) are NOT implemented yet. These tests check the
 * USER INTERFACE only, using Playwright route interception as a clearly labelled TEST DOUBLE for those two routes (and Chromium's fake
 * microphone). They prove the UI behaves correctly; they do not prove that speech recognition or speech synthesis works, and voice
 * stays switched off in real configurations until real routes exist and pass their own end-to-end tests.
 */
const AGENT = "http://127.0.0.1:4013";
const SHOTS = path.resolve(__dirname, "../../../../docs/screenshots/assistant-voice");
const seen = async () => (await (await fetch(`${AGENT}/__seen`)).json()) as { message: string }[];

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  permissions: ["microphone"],
});

let ipCounter = Math.floor(Math.random() * 200);
test.beforeEach(async ({ context }) => {
  ipCounter = (ipCounter % 250) + 1;
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.40.${Math.floor(Math.random() * 250)}.${ipCounter}` });
  await fetch(`${AGENT}/__reset`, { method: "POST" });
});

/** A short silent WAV (8 kHz, 8-bit, mono), valid audio for the browser's player. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds, 0x80);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

interface Doubles {
  transcribeCalls: number;
  speakBodies: { text: string; lang: string }[];
}
/** TEST DOUBLES for the two voice routes. `transcript` is what the pretend recogniser "hears". */
async function voiceDoubles(page: Page, opts: { transcript?: string; transcribeStatus?: number; transcribeDelayMs?: number } = {}): Promise<Doubles> {
  const d: Doubles = { transcribeCalls: 0, speakBodies: [] };
  await page.route("**/api/assistant/voice/transcribe**", async (route) => {
    d.transcribeCalls++;
    await new Promise((r) => setTimeout(r, opts.transcribeDelayMs ?? 500));
    if (opts.transcribeStatus && opts.transcribeStatus !== 200) return route.fulfill({ status: opts.transcribeStatus, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: opts.transcript ?? "show me phones under 150000" }) });
  });
  await page.route("**/api/assistant/voice/speak", async (route) => {
    d.speakBodies.push(route.request().postDataJSON() as { text: string; lang: string });
    return route.fulfill({ status: 200, contentType: "audio/wav", body: silentWav(8) });
  });
  return d;
}

async function open(page: Page) {
  await page.goto("/");
  await page.getByTestId("assistant-launcher").click();
  const panel = page.getByRole("dialog", { name: /VOLTA AI/ });
  await expect(panel).toBeVisible();
  return panel;
}
const ask = async (page: Page, text: string) => {
  await page.getByLabel("Message the shopping assistant").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
};
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

test.describe("VOLTA AI modal", () => {
  test("is branded, welcomes the shopper and offers starters, a language choice and a microphone", async ({ page }) => {
    const panel = await open(page);
    await expect(panel.getByRole("heading", { name: /VOLTA AI/ }).first()).toBeVisible();
    await expect(panel.getByTestId("assistant-welcome")).toContainText("Hi, I'm VOLTA AI");
    await expect(panel.getByRole("radiogroup", { name: "Language" })).toBeVisible();
    await expect(panel.getByTestId("mic-button")).toBeVisible();
    await expect(panel.getByTestId("clear-conversation")).toBeDisabled(); // nothing to clear yet
  });

  test("shows an AI processing indicator while the reply is on its way, then the answer with cards", async ({ page }) => {
    await page.route("**/api/assistant/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const panel = await open(page);
    await ask(page, "show me phones");
    await expect(panel.getByTestId("typing-indicator")).toBeVisible();
    await expect(panel.getByTestId("typing-indicator")).toContainText("VOLTA AI is thinking");
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
    await expect(panel.getByTestId("typing-indicator")).toHaveCount(0);
  });

  test("language choice: Sinhala changes the words on screen and is sent to the assistant; Auto is the default", async ({ page }) => {
    let body: { locale?: string } = {};
    await page.route("**/api/assistant/chat", async (route) => {
      body = route.request().postDataJSON() as { locale?: string };
      await route.continue();
    });
    const panel = await open(page);
    await expect(panel.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    await panel.getByRole("radio", { name: "සිංහල" }).click();
    await expect(page.getByPlaceholder("නිෂ්පාදන, තොග, උපාංග ගැන අහන්න")).toBeVisible();
    await page.getByLabel("Message the shopping assistant").fill("phones පෙන්වන්න");
    await page.getByRole("button", { name: "යවන්න" }).click();
    await expect(panel.locator("[data-native-review=pending]").first()).toBeVisible();
    expect(body.locale).toBe("si");
  });

  test("clear conversation asks first: Keep chatting changes nothing, Clear empties it and returns to the welcome", async ({ page }) => {
    const panel = await open(page);
    await ask(page, "show me phones");
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
    await panel.getByTestId("clear-conversation").click();
    const confirm = page.getByTestId("clear-confirm");
    await expect(confirm).toContainText("Clear this conversation?");
    await confirm.getByRole("button", { name: "Keep chatting" }).click();
    await expect(page.getByTestId("clear-confirm")).toHaveCount(0);
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
    await panel.getByTestId("clear-conversation").click();
    await page.getByTestId("clear-confirm").getByRole("button", { name: "Clear", exact: true }).click();
    await expect(panel.getByTestId("assistant-welcome")).toBeVisible();
    await expect(panel.getByTestId("product-card")).toHaveCount(0);
  });

  test("the cart is untouched by clearing the conversation", async ({ page }) => {
    const panel = await open(page);
    await ask(page, "add the earbuds to my cart");
    await page.getByTestId("cart-confirm").getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Added to your cart.")).toBeVisible();
    await panel.getByTestId("clear-conversation").click();
    await page.getByTestId("clear-confirm").getByRole("button", { name: "Clear", exact: true }).click();
    expect(JSON.parse((await page.evaluate(() => window.localStorage.getItem("volta.cart.v1"))) ?? "[]")).toHaveLength(1);
  });
});

test.describe("voice input (UI against test doubles for the not-yet-implemented transcription route)", () => {
  test("records with a timer and waveform, transcribes on stop, lets the shopper edit the text, and sends only the edited text through the normal chat", async ({ page }) => {
    const d = await voiceDoubles(page, { transcript: "show me phones under 150000" });
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    const rec = page.getByTestId("voice-recording");
    await expect(rec).toBeVisible();
    await expect(rec.getByTestId("waveform").locator("span")).toHaveCount(24);
    await page.waitForTimeout(1300);
    await expect(rec.getByTestId("voice-timer")).toHaveText(/^0:0[1-9]$/);
    await rec.getByLabel("Stop recording and transcribe").click();
    await expect(page.getByTestId("voice-transcribing")).toBeVisible();
    const preview = page.getByTestId("voice-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByRole("textbox")).toHaveValue("show me phones under 150000");
    expect(d.transcribeCalls).toBe(1);
    expect(await seen()).toEqual([]); // nothing reaches the assistant until the shopper confirms
    await preview.getByRole("textbox").fill("show me laptops");
    await preview.getByRole("button", { name: "Send" }).click();
    await expect(panel.getByText("show me laptops", { exact: true }).first()).toBeVisible();
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
    expect((await seen()).map((c) => c.message)).toEqual(["show me laptops"]);
    await expect(page.getByTestId("voice-preview")).toHaveCount(0);
    await expect(panel.getByLabel("Message the shopping assistant")).toBeVisible(); // back to the text box
  });

  test("Discard and Record again leave the chat untouched", async ({ page }) => {
    await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await page.waitForTimeout(900);
    await page.getByLabel("Stop recording and transcribe").click();
    await expect(page.getByTestId("voice-preview")).toBeVisible();
    await page.getByTestId("voice-preview").getByRole("button", { name: "Discard" }).click();
    await expect(page.getByTestId("voice-preview")).toHaveCount(0);
    expect(await seen()).toEqual([]);
    await expect(panel.getByTestId("mic-button")).toBeVisible();
  });

  test("cancel during recording discards the audio: no transcription request, no message, back to the text box", async ({ page }) => {
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await expect(page.getByTestId("voice-recording")).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByLabel("Cancel recording").click();
    await expect(page.getByTestId("voice-recording")).toHaveCount(0);
    await expect(panel.getByLabel("Message the shopping assistant")).toBeVisible();
    await page.waitForTimeout(500);
    expect(d.transcribeCalls).toBe(0);
    expect(await seen()).toEqual([]);
  });

  test("Escape cancels a recording before it closes the modal", async ({ page }) => {
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await expect(page.getByTestId("voice-recording")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("voice-recording")).toHaveCount(0);
    await expect(panel).toBeVisible();
    expect(d.transcribeCalls).toBe(0);
  });

  test("a blocked microphone shows a clear message and never records", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await expect(page.getByTestId("voice-error")).toContainText("Microphone access was blocked");
    expect(d.transcribeCalls).toBe(0);
    await page.getByTestId("voice-error").getByLabel("Close").click();
    await expect(panel.getByLabel("Message the shopping assistant")).toBeVisible();
  });

  test("a recording that is too short is refused with advice, without a request", async ({ page }) => {
    // Time stands still in this page, so the recording lasts zero seconds however fast the test runs.
    await page.addInitScript(() => {
      const frozen = Date.now();
      Date.now = () => frozen;
    });
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await page.getByLabel("Stop recording and transcribe").click();
    await expect(page.getByTestId("voice-error")).toContainText("too short");
    expect(d.transcribeCalls).toBe(0);
  });

  test("when the transcription route does not exist (404) the modal says voice input is not available yet, and typing still works", async ({ page }) => {
    await voiceDoubles(page, { transcribeStatus: 404, transcribeDelayMs: 100 });
    const panel = await open(page);
    await panel.getByTestId("mic-button").click();
    await page.waitForTimeout(900);
    await page.getByLabel("Stop recording and transcribe").click();
    await expect(page.getByTestId("voice-error")).toContainText("Voice input is not available yet");
    await page.getByTestId("voice-error").getByLabel("Close").click();
    await ask(page, "show me phones");
    await expect(panel.getByTestId("product-card").first()).toBeVisible();
  });

  test("text-only chat is unchanged: typing and sending work with voice present", async ({ page }) => {
    const panel = await open(page);
    await ask(page, "show me phones");
    await expect(panel.getByTestId("product-card")).toHaveCount(2);
    expect((await seen()).map((c) => c.message)).toEqual(["show me phones"]);
  });
});

test.describe("spoken replies (UI against a test double for the not-yet-implemented speech route)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Audio;
      (window as unknown as { __audios: HTMLAudioElement[] }).__audios = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Audio = function (src?: string) {
        const a = new Original(src);
        (window as unknown as { __audios: HTMLAudioElement[] }).__audios.push(a);
        return a;
      };
      (window as unknown as { Audio: unknown }).Audio = Object.assign((window as unknown as { Audio: unknown }).Audio as object, { prototype: Original.prototype });
    });
  });

  test("with voice replies on, the reply is read aloud, with play, pause, replay and mute that really control the audio", async ({ page }) => {
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await panel.getByTestId("voice-output-toggle").click();
    await expect(panel.getByTestId("voice-output-toggle")).toHaveAttribute("aria-label", "Voice replies on");
    await ask(page, "show me phones");
    const player = panel.getByTestId("voice-player").last();
    await expect(player).toHaveAttribute("data-phase", "playing");
    expect(d.speakBodies).toEqual([{ text: "Here is what I found.", lang: "en" }]);
    const state = () => page.evaluate(() => { const a = (window as unknown as { __audios: HTMLAudioElement[] }).__audios.at(-1)!; return { paused: a.paused, muted: a.muted, time: a.currentTime }; });

    await player.getByLabel("Pause", { exact: true }).click();
    await expect(player).toHaveAttribute("data-phase", "paused");
    expect((await state()).paused).toBe(true);
    await player.getByLabel("Play", { exact: true }).click();
    await expect(player).toHaveAttribute("data-phase", "playing");
    expect((await state()).paused).toBe(false);
    await page.waitForTimeout(700);
    await player.getByLabel("Replay", { exact: true }).click();
    expect((await state()).time).toBeLessThan(0.5);
    await expect(player).toHaveAttribute("data-phase", "playing");
    await player.getByLabel("Mute", { exact: true }).click();
    expect((await state()).muted).toBe(true);
    await expect(player.getByLabel("Unmute", { exact: true })).toHaveAttribute("aria-pressed", "true");
    await player.getByLabel("Unmute", { exact: true }).click();
    expect((await state()).muted).toBe(false);
  });

  test("with voice replies off, nothing is fetched or played until the shopper presses Listen", async ({ page }) => {
    const d = await voiceDoubles(page);
    const panel = await open(page);
    await ask(page, "show me phones");
    const player = panel.getByTestId("voice-player").last();
    await expect(player).toHaveAttribute("data-phase", "idle");
    expect(d.speakBodies).toHaveLength(0);
    await player.getByLabel("Listen to this reply", { exact: true }).click();
    await expect(player).toHaveAttribute("data-phase", "playing");
    expect(d.speakBodies).toHaveLength(1);
  });

  test("a speech route that does not exist leaves the reply readable and shows a short note, no crash", async ({ page }) => {
    await page.route("**/api/assistant/voice/speak", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
    const panel = await open(page);
    await panel.getByTestId("voice-output-toggle").click();
    await ask(page, "show me phones");
    await expect(panel.getByText("Here is what I found.")).toBeVisible();
    await expect(panel.getByTestId("voice-player").last()).toHaveAttribute("data-phase", "error");
    await expect(panel.getByText("Could not play audio")).toBeVisible();
  });
});

async function screenshots(page: Page, tag: string) {
  const d = await voiceDoubles(page, { transcript: "show me phones under 150000", transcribeDelayMs: 1500 });
  const panel = await open(page);
  await shot(page, `${tag}-1-welcome`);
  await panel.getByRole("radio", { name: "සිංහල" }).click();
  await shot(page, `${tag}-2-sinhala-labels`);
  await panel.getByRole("radio").first().click(); // "Auto" (its name is in Sinhala while Sinhala is chosen)
  await ask(page, "compare nova x1 and orbit pro");
  await expect(panel.getByTestId("comparison-card")).toBeVisible();
  await shot(page, `${tag}-3-comparison`);
  await panel.getByTestId("voice-output-toggle").click();
  await ask(page, "show me phones");
  await expect(panel.getByTestId("voice-player").last()).toHaveAttribute("data-phase", "playing");
  await shot(page, `${tag}-4-products-with-player`);
  await panel.getByTestId("voice-output-toggle").click();
  await panel.getByTestId("mic-button").click();
  await expect(page.getByTestId("voice-recording")).toBeVisible();
  await page.waitForTimeout(1600);
  await shot(page, `${tag}-5-recording`);
  await page.getByLabel("Stop recording and transcribe").click();
  await expect(page.getByTestId("voice-transcribing")).toBeVisible();
  await shot(page, `${tag}-6-transcribing`);
  await expect(page.getByTestId("voice-preview")).toBeVisible();
  await shot(page, `${tag}-7-transcription-preview`);
  await page.getByTestId("voice-preview").getByRole("button", { name: "Discard" }).click();
  await panel.getByTestId("clear-conversation").click();
  await expect(page.getByTestId("clear-confirm")).toBeVisible();
  await shot(page, `${tag}-8-clear-confirmation`);
  await page.getByTestId("clear-confirm").getByRole("button", { name: "Clear", exact: true }).click();
  expect(d.transcribeCalls).toBe(1);
}

test("screenshot evidence, desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await screenshots(page, "desktop");
});

test("@mobile screenshot evidence, phone; the modal fills the screen and nothing overflows", async ({ page }) => {
  await voiceDoubles(page);
  await page.goto("/");
  await page.getByTestId("assistant-launcher").click();
  const box = await page.getByRole("dialog", { name: /VOLTA AI/ }).boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(box!.height).toBeGreaterThanOrEqual(vp.height - 2);
  await page.reload();
  await screenshots(page, "mobile");
});
