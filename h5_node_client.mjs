#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8875;
const DEFAULT_TTS_WS_PORT = 8876;

function parseArgs(argv) {
  const result = {
    host: process.env.H5_HOST || DEFAULT_HOST,
    port: Number(process.env.H5_PORT || DEFAULT_PORT),
    ttsWsUrl: process.env.TTS_WS_URL || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      result.host = argv[index + 1] || result.host;
      index += 1;
    } else if (arg === "--port") {
      result.port = Number(argv[index + 1] || result.port);
      index += 1;
    } else if (arg === "--tts-ws-url") {
      result.ttsWsUrl = argv[index + 1] || result.ttsWsUrl;
      index += 1;
    }
  }

  return result;
}

const args = parseArgs(process.argv.slice(2));

const MEDIA = {
  idle: firstExisting([
    path.join(BASE_DIR, ".live_cache", "idle_h264_muted.mp4"),
    path.join(BASE_DIR, "不说话.mp4"),
  ]),
  talk: firstExisting([
    path.join(BASE_DIR, ".live_cache", "speaking_h264_muted.mp4"),
    path.join(BASE_DIR, "说话.mp4"),
  ]),
};

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate)) || paths[paths.length - 1];
}

function publicHost(host) {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

function html() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>H5 数字人音频流 Demo</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101114;
      --panel: #191b20;
      --panel-2: #20232a;
      --text: #f5f7fb;
      --muted: #a8b0bd;
      --line: #343944;
      --accent: #2dd4bf;
      --warn: #f59e0b;
      --danger: #ef4444;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button,
    textarea {
      font: inherit;
    }

    .app {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 360px;
      gap: 18px;
      padding: 18px;
    }

    .stage-shell {
      min-width: 0;
      display: grid;
      place-items: center;
    }

    .stage {
      position: relative;
      width: min(100%, calc((100dvh - 36px) * 9 / 16));
      max-width: 720px;
      aspect-ratio: 9 / 16;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid #2a2f38;
      background: #050507;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.42);
    }

    .media {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #050507;
    }

    .idle {
      z-index: 1;
    }

    .talk {
      z-index: 2;
      opacity: 0;
      pointer-events: none;
      transition: opacity 420ms ease;
    }

    .stage.is-speaking .talk {
      opacity: 1;
    }

    .badge {
      position: absolute;
      z-index: 3;
      left: 12px;
      top: 12px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(8, 10, 14, 0.72);
      color: var(--text);
      font-size: 13px;
      font-weight: 750;
      backdrop-filter: blur(12px);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(45, 212, 191, 0.18);
    }

    .stage.is-speaking .dot {
      background: var(--warn);
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18);
    }

    .panel {
      min-width: 0;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: var(--panel);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: 0;
    }

    label,
    .metric-label {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.25;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    textarea {
      width: 100%;
      min-height: 112px;
      max-height: 240px;
      resize: vertical;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--line);
      outline: none;
      color: var(--text);
      background: var(--panel-2);
      line-height: 1.5;
    }

    textarea:focus {
      border-color: rgba(45, 212, 191, 0.72);
      box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12);
    }

    .button-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    button {
      min-height: 42px;
      border-radius: 8px;
      border: 1px solid var(--line);
      cursor: pointer;
      font-size: 14px;
      font-weight: 760;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .primary {
      color: #06110f;
      border-color: transparent;
      background: var(--accent);
    }

    .secondary {
      color: var(--text);
      background: var(--panel-2);
    }

    .danger {
      color: #fff;
      border-color: rgba(239, 68, 68, 0.38);
      background: rgba(239, 68, 68, 0.18);
    }

    .metrics {
      display: grid;
      gap: 8px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #2d313a;
      background: #14161b;
    }

    .metric {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      min-height: 22px;
      font-size: 14px;
    }

    .metric-value {
      color: var(--text);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    .status {
      min-height: 44px;
      margin: 0;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #2d313a;
      color: var(--muted);
      background: #14161b;
      font-size: 14px;
      line-height: 1.45;
    }

    .status strong {
      color: var(--text);
    }

    @media (max-width: 860px) {
      .app {
        min-height: 100dvh;
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 12px;
      }

      .stage {
        width: min(100%, calc((100dvh - 330px) * 9 / 16));
        min-width: 250px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <main class="stage-shell">
      <section id="stage" class="stage" aria-label="视频画面">
        <video id="idleVideo" class="media idle" src="/media/idle.mp4" muted autoplay loop playsinline webkit-playsinline="true" x5-playsinline="true" x5-video-player-type="h5" x5-video-orientation="portrait" x-webkit-airplay="deny" preload="auto"></video>
        <video id="talkVideo" class="media talk" src="/media/talk.mp4" muted loop playsinline webkit-playsinline="true" x5-playsinline="true" x5-video-player-type="h5" x5-video-orientation="portrait" x-webkit-airplay="deny" preload="auto"></video>
        <div class="badge" aria-live="polite">
          <span class="dot" aria-hidden="true"></span>
          <span id="modeLabel">待机</span>
        </div>
      </section>
    </main>

    <aside class="panel">
      <h1>H5 音频流数字人</h1>

      <div class="field">
        <label for="textInput">播报文本</label>
        <textarea id="textInput" maxlength="900" placeholder="输入文本后通过 WebSocket 发给 Python 后端，后端把 TTS PCM 音频流推回来">欢迎来到直播间，今天给大家介绍一件臻品。</textarea>
      </div>

      <div class="button-row">
        <button id="unlockButton" class="secondary" type="button">启用声音</button>
        <button id="sendButton" class="primary" type="button">发送并播报</button>
      </div>

      <button id="stopButton" class="danger" type="button">停止播放</button>

      <div class="metrics">
        <div class="metric">
          <span class="metric-label">Python 后端</span>
          <span id="wsStatus" class="metric-value">连接中</span>
        </div>
        <div class="metric">
          <span class="metric-label">音频格式</span>
          <span id="audioFormat" class="metric-value">pcm_s16le</span>
        </div>
        <div class="metric">
          <span class="metric-label">采样率</span>
          <span id="sampleRate" class="metric-value">--</span>
        </div>
        <div class="metric">
          <span class="metric-label">已收音频</span>
          <span id="byteCount" class="metric-value">0 KB</span>
        </div>
        <div class="metric">
          <span class="metric-label">讲话素材</span>
          <span id="talkDuration" class="metric-value">加载中</span>
        </div>
      </div>

      <p id="status" class="status">待机视频循环中。</p>
      <p id="lastText" class="status">等待文本。</p>
    </aside>
  </div>

  <script>
    const CONFIG_TTS_WS_URL = ${JSON.stringify(args.ttsWsUrl || "")};
    const DEFAULT_TTS_WS_PORT = ${DEFAULT_TTS_WS_PORT};

    const stage = document.getElementById("stage");
    const idleVideo = document.getElementById("idleVideo");
    const talkVideo = document.getElementById("talkVideo");
    const textInput = document.getElementById("textInput");
    const unlockButton = document.getElementById("unlockButton");
    const sendButton = document.getElementById("sendButton");
    const stopButton = document.getElementById("stopButton");
    const wsStatus = document.getElementById("wsStatus");
    const audioFormat = document.getElementById("audioFormat");
    const sampleRateEl = document.getElementById("sampleRate");
    const byteCountEl = document.getElementById("byteCount");
    const talkDurationEl = document.getElementById("talkDuration");
    const statusEl = document.getElementById("status");
    const lastText = document.getElementById("lastText");
    const modeLabel = document.getElementById("modeLabel");

    const state = {
      socket: null,
      retryDelay: 900,
      retryTimer: 0,
      audioContext: null,
      sampleRate: 24000,
      channels: 1,
      byteCount: 0,
      streamActive: false,
      streamEnded: false,
      nextStartTime: 0,
      pendingSources: 0,
      pendingPcmChunks: [],
      sources: new Set(),
      finishTimer: 0,
      forceFinishTimer: 0,
      pauseTalkTimer: 0,
      currentText: "",
    };

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
      const total = Math.floor(seconds);
      const mins = String(Math.floor(total / 60)).padStart(2, "0");
      const secs = String(total % 60).padStart(2, "0");
      return mins + ":" + secs;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char];
      });
    }

    function setStatus(message) {
      statusEl.innerHTML = message;
    }

    function setMode(label) {
      modeLabel.textContent = label;
    }

    function setWsStatus(label) {
      wsStatus.textContent = label;
    }

    function updateBytes() {
      byteCountEl.textContent = Math.round(state.byteCount / 1024) + " KB";
    }

    function forceMuted(video) {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.addEventListener("volumechange", function () {
        if (!video.muted || video.volume !== 0) {
          video.muted = true;
          video.volume = 0;
        }
      });
    }

    function once(target, eventName, timeoutMs) {
      return new Promise(function (resolve) {
        let done = false;
        const timer = window.setTimeout(finish, timeoutMs || 1200);
        function finish() {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          target.removeEventListener(eventName, finish);
          resolve();
        }
        target.addEventListener(eventName, finish, { once: true });
      });
    }

    function delay(ms) {
      return new Promise(function (resolve) {
        window.setTimeout(resolve, ms);
      });
    }

    async function ensureIdlePlayback() {
      try {
        await idleVideo.play();
      } catch (error) {
        setStatus("浏览器拦截了视频自动播放，点击页面按钮后会恢复。");
      }
    }

    async function seekTalkToStart() {
      if (!Number.isFinite(talkVideo.duration) || talkVideo.readyState < 1) {
        await once(talkVideo, "loadedmetadata", 1600);
      }
      try {
        talkVideo.currentTime = 0;
        await once(talkVideo, "seeked", 900);
      } catch (error) {
        talkVideo.currentTime = 0;
      }
    }

    function seekTalkToClosePose() {
      if (!Number.isFinite(talkVideo.duration) || talkVideo.duration <= 1) return;
      try {
        talkVideo.currentTime = Math.max(0, talkVideo.duration - 0.55);
      } catch (error) {
        return;
      }
    }

    async function ensureAudioContext() {
      if (!state.audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        state.audioContext = new AudioContextClass();
      }
      if (state.audioContext.state !== "running") {
        await Promise.race([state.audioContext.resume(), delay(700)]);
      }
      return state.audioContext;
    }

    function buildWsUrl() {
      const params = new URLSearchParams(window.location.search);
      const override = params.get("tts_ws") || CONFIG_TTS_WS_URL;
      if (override) return override;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return protocol + "//" + window.location.hostname + ":" + DEFAULT_TTS_WS_PORT + "/tts";
    }

    function connectBackend() {
      window.clearTimeout(state.retryTimer);
      setWsStatus("连接中");

      const socket = new WebSocket(buildWsUrl());
      socket.binaryType = "arraybuffer";
      state.socket = socket;

      socket.addEventListener("open", function () {
        state.retryDelay = 900;
        setWsStatus("已连接");
        setStatus("Python 后端已连接。");
      });

      socket.addEventListener("message", async function (event) {
        if (typeof event.data === "string") {
          handleJsonMessage(event.data);
          return;
        }
        await handleAudioChunk(event.data);
      });

      socket.addEventListener("close", function () {
        if (state.socket !== socket) return;
        setWsStatus("重连中");
        state.retryTimer = window.setTimeout(connectBackend, state.retryDelay);
        state.retryDelay = Math.min(8000, Math.floor(state.retryDelay * 1.7));
      });

      socket.addEventListener("error", function () {
        setWsStatus("连接异常");
      });
    }

    function handleJsonMessage(raw) {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        return;
      }

      if (payload.type === "ready") {
        setWsStatus("已连接");
        return;
      }
      if (payload.type === "audio_start") {
        beginAudioStream(payload);
        return;
      }
      if (payload.type === "audio_end") {
        state.streamEnded = true;
        scheduleFinishAfterDrain();
        setStatus("音频流接收完成，等待播放队列清空。");
        return;
      }
      if (payload.type === "error") {
        resetAudioStream();
        finishSpeaking();
        setStatus(escapeHtml(payload.error || "Python 后端返回错误。"));
      }
    }

    async function beginAudioStream(payload) {
      resetAudioStream();
      state.sampleRate = Number(payload.sample_rate || 24000);
      state.channels = Number(payload.channels || 1);
      state.currentText = payload.text || "";
      state.streamActive = true;
      state.streamEnded = false;
      state.byteCount = 0;
      sampleRateEl.textContent = String(state.sampleRate);
      audioFormat.textContent = payload.audio_format || "pcm_s16le";
      updateBytes();
      lastText.innerHTML = "收到文本：<strong>" + escapeHtml(state.currentText.slice(0, 80)) + "</strong>";

      await ensureIdlePlayback();
      await seekTalkToStart();
      try {
        await talkVideo.play();
      } catch (error) {
        setStatus("讲话视频暂时无法播放，请点击发送并播报。");
      }
      stage.classList.add("is-speaking");
      setMode("说话");
      setStatus("正在接收 Python 推送的音频流。");
    }

    function resetAudioStream() {
      window.clearTimeout(state.finishTimer);
      window.clearTimeout(state.forceFinishTimer);
      state.finishTimer = 0;
      state.forceFinishTimer = 0;
      state.pendingPcmChunks = [];
      state.pendingSources = 0;
      state.nextStartTime = 0;
      state.streamActive = false;
      state.streamEnded = false;
      for (const source of state.sources) {
        try {
          source.stop();
        } catch (error) {
          continue;
        }
      }
      state.sources.clear();
    }

    async function handleAudioChunk(arrayBuffer) {
      state.byteCount += arrayBuffer.byteLength;
      updateBytes();

      if (!state.audioContext || state.audioContext.state !== "running") {
        state.pendingPcmChunks.push(arrayBuffer);
        setStatus("已收到音频流。移动端需要先点击启用声音，之后会继续播放。");
        return;
      }

      schedulePcm(arrayBuffer);
    }

    function schedulePcm(arrayBuffer) {
      if (!state.audioContext || arrayBuffer.byteLength < 2) return;

      const frameCount = Math.floor(arrayBuffer.byteLength / 2);
      const view = new DataView(arrayBuffer);
      const samples = new Float32Array(frameCount);
      for (let index = 0; index < frameCount; index += 1) {
        const value = view.getInt16(index * 2, true);
        samples[index] = Math.max(-1, Math.min(1, value / 32768));
      }

      const buffer = state.audioContext.createBuffer(1, frameCount, state.sampleRate);
      buffer.copyToChannel(samples, 0);

      const source = state.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(state.audioContext.destination);

      const startAt = Math.max(state.audioContext.currentTime + 0.03, state.nextStartTime || state.audioContext.currentTime + 0.08);
      state.nextStartTime = startAt + buffer.duration;
      state.pendingSources += 1;
      state.sources.add(source);

      source.onended = function () {
        state.sources.delete(source);
        state.pendingSources = Math.max(0, state.pendingSources - 1);
        maybeFinishSpeaking();
      };

      try {
        source.start(startAt);
      } catch (error) {
        state.sources.delete(source);
        state.pendingSources = Math.max(0, state.pendingSources - 1);
      }
    }

    function flushPendingPcm() {
      if (!state.audioContext || state.audioContext.state !== "running") return;
      const chunks = state.pendingPcmChunks.splice(0);
      for (const chunk of chunks) {
        schedulePcm(chunk);
      }
      scheduleFinishAfterDrain();
    }

    function scheduleFinishAfterDrain() {
      window.clearTimeout(state.finishTimer);
      window.clearTimeout(state.forceFinishTimer);
      if (!state.streamEnded) return;
      if (!state.audioContext) {
        maybeFinishSpeaking();
        return;
      }
      const waitMs = Math.max(100, Math.ceil((state.nextStartTime - state.audioContext.currentTime) * 1000) + 220);
      state.finishTimer = window.setTimeout(maybeFinishSpeaking, waitMs);
      state.forceFinishTimer = window.setTimeout(function () {
        if (!state.streamEnded) return;
        finishSpeaking();
      }, waitMs + 1500);
    }

    function maybeFinishSpeaking() {
      if (!state.streamEnded) return;
      if (state.pendingSources > 0) return;
      if (state.pendingPcmChunks.length > 0) return;
      finishSpeaking();
    }

    function finishSpeaking() {
      window.clearTimeout(state.finishTimer);
      window.clearTimeout(state.forceFinishTimer);
      state.finishTimer = 0;
      state.forceFinishTimer = 0;
      state.streamActive = false;
      state.streamEnded = false;
      seekTalkToClosePose();
      stage.classList.remove("is-speaking");
      setMode("待机");
      setStatus("待机视频循环中。");
      window.clearTimeout(state.pauseTalkTimer);
      state.pauseTalkTimer = window.setTimeout(function () {
        talkVideo.pause();
        seekTalkToStart();
      }, 460);
      ensureIdlePlayback();
    }

    async function unlockAudio() {
      try {
        await ensureAudioContext();
        if (state.audioContext && state.audioContext.state === "running") {
          unlockButton.disabled = true;
          setStatus("声音已启用，可以接收音频流。");
          flushPendingPcm();
        } else {
          setStatus("文本可以发送；浏览器尚未放开声音，收到音频后可再点启用声音。");
        }
      } catch (error) {
        setStatus("浏览器暂未允许声音播放，请再点击一次。");
      }
    }

    async function sendText() {
      const text = textInput.value.trim();
      if (!text) {
        setStatus("请输入要播报的文本。");
        textInput.focus();
        return;
      }
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        setStatus("Python 后端未连接。");
        return;
      }

      await unlockAudio();
      state.socket.send(JSON.stringify({ type: "speak", text }));
      setStatus("文本已发送给 Python 后端，等待音频流。");
    }

    function stopPlayback() {
      resetAudioStream();
      finishSpeaking();
      setStatus("已停止播放。");
    }

    forceMuted(idleVideo);
    forceMuted(talkVideo);
    ensureIdlePlayback();
    connectBackend();

    talkVideo.addEventListener("loadedmetadata", function () {
      talkDurationEl.textContent = formatTime(talkVideo.duration) + " 循环";
    });

    idleVideo.addEventListener("error", function () {
      setStatus("待机视频加载失败，请确认素材文件存在。");
    });

    talkVideo.addEventListener("error", function () {
      setStatus("讲话视频加载失败，请确认素材文件存在。");
    });

    unlockButton.addEventListener("click", unlockAudio);
    sendButton.addEventListener("click", sendText);
    stopButton.addEventListener("click", stopPlayback);
  </script>
</body>
</html>`;
}

function sendHtml(response) {
  const body = Buffer.from(html(), "utf8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendNotFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not Found");
}

function sendVideo(request, response, filePath) {
  if (!existsSync(filePath)) {
    sendNotFound(response);
    return;
  }

  const size = statSync(filePath).size;
  const range = request.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
    if (match) {
      if (match[1]) start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
      if (!match[1] && match[2]) {
        const suffix = Number(match[2]);
        start = Math.max(0, size - suffix);
        end = size - 1;
      }
      end = Math.min(end, size - 1);
      status = 206;
    }
  }

  if (start > end || start >= size) {
    response.writeHead(416, { "Content-Range": "bytes */" + size });
    response.end();
    return;
  }

  response.writeHead(status, {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Content-Length": end - start + 1,
    "Cache-Control": "no-store",
    ...(status === 206 ? { "Content-Range": "bytes " + start + "-" + end + "/" + size } : {}),
  });
  createReadStream(filePath, { start, end }).pipe(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/") {
    sendHtml(response);
    return;
  }
  if (url.pathname === "/media/idle.mp4") {
    sendVideo(request, response, MEDIA.idle);
    return;
  }
  if (url.pathname === "/media/talk.mp4") {
    sendVideo(request, response, MEDIA.talk);
    return;
  }
  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }
  sendNotFound(response);
});

server.listen(args.port, args.host, () => {
  const host = publicHost(args.host);
  console.log("Node H5 用户端已启动: http://" + host + ":" + args.port + "/");
  console.log("默认连接 Python TTS WebSocket: " + (args.ttsWsUrl || "ws://" + host + ":" + DEFAULT_TTS_WS_PORT + "/tts"));
  console.log("手机访问时可用: node h5_node_client.mjs --host 0.0.0.0 --tts-ws-url ws://电脑IP:" + DEFAULT_TTS_WS_PORT + "/tts");
});
