import fs from "fs"; import { spawn } from "child_process";
export async function launch(w = 430, h = 900) {
  const port = +process.env.BIO_PORT || 9351;
  const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=C:/tmp/bio/cards/prof" + (process.env.BIO_PORT ? process.env.BIO_PORT : ""), "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--window-size=" + w + "," + h, "about:blank"], { stdio: "ignore" });
  await new Promise(r => setTimeout(r, 2500));
  const pages = await (await fetch("http://localhost:" + port + "/json")).json();
  const pg = pages.find(p => p.type === "page");
  const ws = new WebSocket(pg.webSocketDebuggerUrl); let id = 0; const pend = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (file, clip) => { const r = await send("Page.captureScreenshot", { format: "png", clip: clip ? { ...clip, scale: 2 } : undefined }); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); };
  const close = () => { try { ws.close(); } catch (e) {} try { process.kill(proc.pid); } catch (e) {} };
  return { send, ev, sleep, shot, close, pid: proc.pid };
}
