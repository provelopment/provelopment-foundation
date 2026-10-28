// tests/browser/cdp.mjs
// UI-10 D5: a minimal Chrome DevTools Protocol (CDP) client built on Node's
// built-in WebSocket + fetch — NO Playwright/Cypress/WebdriverIO/jsdom. This
// reuses the established headless-Chrome/CDP convention (Phases K/M2) and is the
// committed, reproducible validation capability that substitutes for the
// ad-hoc browser scripts previously written to %TEMP% and discarded.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CANDIDATE_PATHS = [
  () => process.env.CHROME_PATH,
  ...(process.platform === "win32"
    ? [
        () => "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        () => "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        () => "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        () => "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : [
        () => "/usr/bin/google-chrome",
        () => "/usr/bin/google-chrome-stable",
        () => "/usr/bin/chromium-browser",
        () => "/usr/bin/chromium",
      ]),
];

/** Resolve a Chrome/Chromium/Edge binary (CI + local Windows). */
export function findChrome() {
  for (const candidate of CANDIDATE_PATHS) {
    const path = candidate();
    if (path && existsSync(path)) return path;
  }
  return null;
}

async function waitForDevToolsPort(userDataDir, timeoutMs = 60000, proc = null) {
  const end = Date.now() + timeoutMs;
  // A process that has ALREADY exited can never write DevToolsActivePort, so waiting the full budget for it
  // only delays the real diagnosis. Fail fast and say what happened (R11 A).
  let exited = null;
  proc?.once("exit", (code, signal) => {
    exited = { code, signal };
  });
  while (Date.now() < end) {
    if (exited !== null) {
      throw new Error(
        "Chrome exited before its CDP debug port became ready (code=" + String(exited.code) + ", signal=" + String(exited.signal) + ")",
      );
    }
    try {
      const content = await readFile(join(userDataDir, "DevToolsActivePort"), "utf8");
      const port = Number(content.split(/\r?\n/)[0].trim());
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // file not written yet
    }
    await sleep(100);
  }
  throw new Error("Chrome CDP debug port did not become ready within " + timeoutMs + "ms");
}

async function launchChrome(binary, { hostResolverRules } = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), "ui10-cdp-"));
  const args = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    // M18 — a TEST-ONLY hostname mapping, requested by the caller that needs one (a deployment scenario
    // that drives the REAL public hostnames against a local server). It changes no runtime semantics:
    // production hostname dispatch still matches the exact `Host` claim, and this mapping lives only in
    // this Chrome process.
    ...(typeof hostResolverRules === "string" && hostResolverRules !== ""
      ? [`--host-resolver-rules=${hostResolverRules}`]
      : []),
    "about:blank",
  ];
  const proc = spawn(binary, args, { stdio: "ignore", windowsHide: true });
  try {
    const port = await waitForDevToolsPort(userDataDir, undefined, proc);
    // Connect to a PAGE target (not the browser endpoint): Page/Emulation/Runtime/
    // Input domains only exist on a page-target session.
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = (Array.isArray(list) ? list : []).find((t) => t.type === "page");
    if (!page?.webSocketDebuggerUrl) throw new Error("no page CDP target available");
    return { proc, userDataDir, wsUrl: page.webSocketDebuggerUrl };
  } catch (error) {
    try { proc.kill(); } catch { /* already gone */ }
    throw error;
  }
}
/**
 * A tiny CDP session: method calls (id-correlated), event waiting, JS
 * evaluation, real input dispatch (keyboard/mouse), and viewport/emotion
 * emulation. Real interactions only — this never asserts static HTML.
 */
export class Cdp {
  static async connect(binary, options = {}) {
    const launched = await launchChrome(binary, options);
    const cdp = new Cdp(launched.wsUrl);
    await cdp._open();
    cdp._runtime = launched;
    return cdp;
  }

  constructor(wsUrl) {
    this._wsUrl = wsUrl;
    this._id = 0;
    this._pending = new Map();
    this._waiters = [];
    this._socket = null;
    this._runtime = null;
  }

  _open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this._wsUrl);
      this._socket = ws;
      ws.onopen = () => resolve();
      ws.onerror = (error) => reject(new Error(`WebSocket error: ${error?.message ?? "unknown"}`));
      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.id) {
          const waiter = this._pending.get(msg.id);
          if (waiter) {
            this._pending.delete(msg.id);
            if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
            else waiter.resolve(msg.result);
          }
          return;
        }
        this._waiters = this._waiters.filter(({ method, resolve }) => {
          if (method === msg.method) { resolve(msg.params); return false; }
          return true;
        });
      };
    });
  }

  send(method, params = {}) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 60000, proc = null) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
      this._waiters.push({
        method,
        resolve: (params) => { clearTimeout(timer); resolve(params); },
      });
    });
  }

  async navigate(url) {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    const loaded = this.waitEvent("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }

  async reload() {
    const loaded = this.waitEvent("Page.loadEventFired");
    await this.send("Page.reload", { ignoreCache: true });
    await loaded;
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `page JS error: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
      );
    }
    return result.result?.value;
  }

  async evalBool(expression) {
    return Boolean(await this.evaluate(expression));
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async setReducedMotion(reduce) {
    await this.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
    });
  }

  async pressKey(key, { shift = false } = {}) {
    const MAP = {
      Tab: { vk: 9, code: "Tab" },
      Escape: { vk: 27, code: "Escape" },
      Enter: { vk: 13, code: "Enter" },
      ArrowDown: { vk: 40, code: "ArrowDown" },
    };
    const def = MAP[key] ?? { vk: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, code: key };
    const modifiers = shift ? 8 : 0;
    if (shift) await this._keyEvent("keyDown", "Shift", "ShiftLeft", 16, modifiers);
    await this._keyEvent("keyDown", key, def.code, def.vk, modifiers);
    await this._keyEvent("keyUp", key, def.code, def.vk, modifiers);
    if (shift) await this._keyEvent("keyUp", "Shift", "ShiftLeft", 16, modifiers);
  }

  async _keyEvent(type, key, code, vk, modifiers) {
    await this.send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
      modifiers,
    });
  }

  async clickCenter(selector) {
    const point = await this.evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return null; return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
    );
    if (!point) return false;
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    return true;
  }

  async close() {
    try { this._socket?.close(); } catch { /* noop */ }
    try { this._runtime?.proc?.kill(); } catch { /* noop */ }
    try { if (this._runtime?.userDataDir) await rm(this._runtime.userDataDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

