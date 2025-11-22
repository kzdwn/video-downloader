// script.js (REPLACE seluruh file dengan ini)
// Safe version: hanya tampilkan thumbnail OR video player (tidak keduanya)

const API_BASE = "https://www.tikwm.com/api/?url=";
const API_KEY = "";
const USE_CORS_PROXY = false;
const CORS_PROXY = "https://www.tikwm.com/api/?url=";

const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("statusBox");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

const playerBox = document.getElementById("playerBox");
const previewVideo = document.getElementById("previewVideo");
const thumbBox = document.getElementById("thumbBox");
const thumbImg = document.getElementById("thumbImg");

function showStatus(msg, kind = "info") {
  if (!statusBox) return;
  statusBox.classList.remove("hidden");
  statusBox.textContent = msg;
  statusBox.dataset.type = kind;
}
function hideStatus() {
  if (!statusBox) return;
  statusBox.classList.add("hidden");
  statusBox.textContent = "";
}
function clearResults() {
  if (resultList) resultList.innerHTML = "";
  if (resultBox) resultBox.classList.add("hidden");
  if (playerBox) playerBox.classList.add("hidden");
  if (thumbBox) thumbBox.classList.add("hidden");
  hideStatus();
}

function collectUrls(obj, out = new Set()) {
  if (!obj) return out;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (/^https?:\/\//i.test(s)) out.add(s);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) collectUrls(it, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) collectUrls(obj[k], out);
  }
  return out;
}
function pickThumbnail(json) {
  if (!json) return null;
  if (json.thumbnail) return json.thumbnail;
  if (json.cover) return json.cover;
  if (json.data && (json.data.cover || json.data.thumbnail)) return json.data.cover || json.data.thumbnail;
  const urls = Array.from(collectUrls(json));
  for (const u of urls) {
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return u;
  }
  return null;
}

async function callApi(videoUrl) {
  let endpoint = API_BASE + encodeURIComponent(videoUrl);
  if (USE_CORS_PROXY && CORS_PROXY) endpoint = CORS_PROXY + encodeURIComponent(endpoint);

  const headers = { Accept: "application/json" };
  if (API_KEY && API_KEY.length) headers["Authorization"] = API_KEY;

  const res = await fetch(endpoint, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    const err = new Error(`HTTP ${res.status}`);
    err.raw = text;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json") || ct.includes("text/json")) return res.json();
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) {
    const err = new Error("Upstream returned non-JSON");
    err.raw = txt;
    throw err;
  }
}

// Ganti fungsi renderResult di script.js dengan ini
function renderResult(payload) {
  // normalize wrapper
  if (payload && payload.ok && payload.result) payload = payload.result;

  const title = payload.title || payload.name || payload.desc || (payload.data && payload.data.title) || "";
  const thumbnail = pickThumbnail(payload);

  // collect downloads (video)
  const downloads = [];
  if (Array.isArray(payload.downloads) && payload.downloads.length) {
    payload.downloads.forEach(d => {
      downloads.push({
        label: d.label || d.quality || d.name || "Video",
        url: d.url || d.link || d.src || d,
        size: d.size || d.filesize || "",
        filename: d.filename || ""
      });
    });
  }
  if (!downloads.length) {
    if (payload.play) downloads.push({ label: "Tanpa Watermark", url: payload.play, size: payload.size || "" });
    if (payload.wmplay) downloads.push({ label: "Dengan Watermark", url: payload.wmplay, size: payload.size || "" });
    if (payload.video && payload.video.play_addr) downloads.push({ label: "Play", url: payload.video.play_addr });
  }
  if (!downloads.length) {
    const urls = Array.from(collectUrls(payload));
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /\/play\/|\/video\//i.test(u) || /play/i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u, i) => downloads.push({ label: `Detected ${i+1}`, url: u, size: "" }));
  }

  // collect images/audio for extra buttons
  const allUrls = Array.from(collectUrls(payload));
  const imageUrls = allUrls.filter(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u));
  const audioUrls = allUrls.filter(u => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u) || /audio/i.test(u));
  const audioUrl = audioUrls.length ? audioUrls[0] : null;
  const photoUrl = thumbnail || (imageUrls.length ? imageUrls[0] : null);

  // clear UI
  resultList.innerHTML = "";
  if (playerBox) playerBox.classList.add("hidden");
  if (thumbBox) thumbBox.classList.add("hidden");

  // pick playable (mp4/play-like)
  let playableUrl = null;
  for (const d of downloads) {
    if (d.url && ( /\.mp4(\?|$)/i.test(d.url) || /\/play\/|\/video\//i.test(d.url) )) {
      playableUrl = d.url;
      break;
    }
  }
  if (!playableUrl && downloads.length) {
    const firstCandidate = downloads.find(d => typeof d.url === "string" && /^https?:\/\//i.test(d.url));
    if (firstCandidate) playableUrl = firstCandidate.url;
  }

  // If playable -> show video player (use poster if available)
  if (playableUrl && previewVideo && playerBox) {
    try { previewVideo.crossOrigin = "anonymous"; } catch(e){}
    previewVideo.src = playableUrl;
    if (photoUrl) previewVideo.poster = photoUrl;
    previewVideo.load();
    playerBox.classList.remove("hidden");
    if (thumbBox) thumbBox.classList.add("hidden");
  } else {
    // no playable: show thumbnail image if exists
    if (photoUrl) {
      if (thumbBox && thumbImg) {
        thumbImg.src = photoUrl;
        thumbBox.classList.remove("hidden");
      } else {
        const img = document.createElement("img");
        img.src = photoUrl;
        img.alt = title || "thumbnail";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "10px";
        resultList.appendChild(img);
      }
    }
  }

  // Title
  if (title) {
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  // Render only "Open" button for each detected download (if you still want Open),
  // but DO NOT render per-video Download button (we'll provide global Foto/Audio downloads instead).
  downloads.forEach(d => {
    const node = document.createElement("div");
    node.className = "result-item";
    node.innerHTML = `
      <div style="display:flex;flex-direction:column;margin-bottom:8px;">
        <div style="font-weight:600">${d.label}</div>
        <div style="opacity:.75;font-size:13px">${d.size || ""}</div>
      </div>

      <div class="download-actions">
        <a href="${d.url}" target="_blank" class="open-btn">Open</a>
      </div>
    `;
    resultList.appendChild(node);
  });

  // === HERE: add single row with Download Foto + Download Audio (if available) ===
  const extras = document.createElement("div");
  extras.className = "result-item";
  extras.style.display = "flex";
  extras.style.gap = "12px";
  extras.style.marginTop = "10px";

  if (photoUrl) {
    const aPhoto = document.createElement("a");
    aPhoto.href = photoUrl;
    aPhoto.download = "";
    aPhoto.className = "download-btn";
    aPhoto.textContent = "Download Foto";
    extras.appendChild(aPhoto);
  }

  if (audioUrl) {
    const aAudio = document.createElement("a");
    aAudio.href = audioUrl;
    aAudio.download = "";
    aAudio.className = "download-btn";
    aAudio.textContent = "Download Audio";
    extras.appendChild(aAudio);
  }

  // If neither exist, tampilkan hint kecil
  if (extras.children.length) {
    resultList.appendChild(extras);
  } else {
    const hint = document.createElement("div");
    hint.style.opacity = "0.8";
    hint.style.marginTop = "8px";
    hint.textContent = "Tidak ada file foto/audio yang tersedia untuk diunduh.";
    resultList.appendChild(hint);
  }

  resultBox.classList.remove("hidden");
}

// ---------- MAIN ----------
async function processUrl(videoUrl) {
  clearResults();
  showStatus("Menghubungi API...", "info");
  if (gasBtn){ gasBtn.disabled = true; gasBtn.textContent = "Proses..."; }

  try {
    const json = await callApi(videoUrl);
    showStatus("Sukses menerima respons. Rendering...", "success");
    renderResult(json);
  } catch (err) {
    console.error("API error", err);
    let msg = err.message || "Gagal memanggil API";
    if ((err.raw && String(err.raw).toLowerCase().includes("cors")) || msg.toLowerCase().includes("cors")) {
      msg = "Request diblokir (CORS). Gunakan server-proxy.";
    }
    showStatus("Error: " + msg, "error");
  } finally {
    if (gasBtn){ gasBtn.disabled = false; gasBtn.textContent = "Download"; }
  }
}

// ---------- EVENTS ----------
if (gasBtn) {
  gasBtn.addEventListener("click", () => {
    const u = (urlInput && urlInput.value || "").trim();
    if (!u) { showStatus("Masukkan URL video dulu.", "error"); return; }
    try { new URL(u); } catch { showStatus("Format URL tidak valid.", "error"); return; }
    processUrl(u);
  });
}
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (urlInput) urlInput.value = "";
    clearResults();
  });
}

clearResults();
hideStatus();
