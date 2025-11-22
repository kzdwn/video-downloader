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
  if (!resultList || !resultBox) {
    console.warn("renderResult: missing resultList/resultBox");
    return;
  }

  // safety normalize
  if (payload && payload.ok && payload.result) payload = payload.result;
  resultList.innerHTML = "";

  const title = payload && (payload.title || payload.name || payload.desc || (payload.data && payload.data.title)) || "";
  const thumbnail = pickThumbnail(payload);

  // collect downloads (defensive)
  const downloads = [];
  if (Array.isArray(payload?.downloads) && payload.downloads.length) {
    payload.downloads.forEach(d => downloads.push({
      label: d.label || d.quality || d.name || "Video",
      url: d.url || d.link || d.src || d,
      size: d.size || d.filesize || "",
      filename: d.filename || ""
    }));
  }
  if (!downloads.length) {
    if (payload?.play) downloads.push({ label: "Video (no watermark)", url: payload.play });
    if (payload?.wmplay) downloads.push({ label: "Video (wm)", url: payload.wmplay });
    if (payload?.video?.play_addr) downloads.push({ label: "Video", url: payload.video.play_addr });
  }
  if (!downloads.length) {
    const urls = Array.from(collectUrls(payload));
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /play|video/i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u,i) => downloads.push({ label: `Detected ${i+1}`, url: u }));
  }

  // show title if any
  if (title) {
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  // Try to show player (if elements exist)
  let showedPlayer = false;
  if (downloads.length && previewVideo && playerBox) {
    const first = downloads[0].url;
    if (first && ( /\.mp4(\?|$)/i.test(first) || /play/i.test(first) || first.startsWith("http") )) {
      try {
        // cleanup previous
        previewVideo.pause();
        previewVideo.removeAttribute("src");
        previewVideo.load();

        // attributes (only if element exists)
        previewVideo.setAttribute("playsinline", "");
        previewVideo.setAttribute("controls", "");
        previewVideo.setAttribute("crossorigin", "anonymous");

        // attach error handler once
        const onError = (e) => {
          console.warn("previewVideo error:", e);
          showStatus("Preview video gagal diputar (kemungkinan CORS/redirect). Tombol download tetap tersedia.", "error");
          if (playerBox) playerBox.classList.add("hidden");
          previewVideo.removeEventListener("error", onError);
          // show thumbnail fallback
          if (thumbnail) {
            if (thumbBox && thumbImg) {
              thumbImg.src = thumbnail;
              thumbBox.classList.remove("hidden");
            } else {
              const img = document.createElement("img");
              img.src = thumbnail;
              img.alt = title || "thumbnail";
              img.style.maxWidth = "100%";
              img.style.borderRadius = "10px";
              resultList.appendChild(img);
            }
          }
        };
        previewVideo.addEventListener("error", onError, { once: true });

        // set source (may throw)
        previewVideo.src = first;
        previewVideo.load();
        // do not autoplay on mobile; show player and let user tap
        if (playerBox) playerBox.classList.remove("hidden");
        showedPlayer = true;
        hideStatus();
      } catch (err) {
        console.warn("set previewVideo failed:", err);
        showedPlayer = false;
      }
    }
  }

  // if no player or player failed -> show thumbnail
  if (!showedPlayer && thumbnail) {
    if (thumbBox && thumbImg) {
      thumbImg.src = thumbnail;
      thumbBox.classList.remove("hidden");
    } else {
      const img = document.createElement("img");
      img.src = thumbnail;
      img.alt = title || "thumbnail";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "10px";
      resultList.appendChild(img);
    }
  }

  // Always add download buttons (video / foto / audio) as fallback
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexWrap = "wrap";
  wrap.style.gap = "12px";
  wrap.style.marginTop = "14px";

  // Download Video (first download)
  if (downloads.length) {
    const a = document.createElement("a");
    a.href = downloads[0].url;
    a.className = "download-btn";
    a.textContent = "Download Video";
    a.setAttribute("download", "");
    a.setAttribute("rel", "noopener");
    wrap.appendChild(a);
  }

  // Download Foto (thumbnail)
  if (thumbnail) {
    const a2 = document.createElement("a");
    a2.href = thumbnail;
    a2.className = "download-btn";
    a2.textContent = "Download Foto";
    a2.setAttribute("download", "");
    a2.setAttribute("rel", "noopener");
    wrap.appendChild(a2);
  }

  // Try to find an audio URL from payload
  const allUrls = Array.from(collectUrls(payload));
  const audioUrl = allUrls.find(u => /\.(mp3|m4a|aac|wav|ogg)(\?|$)/i.test(u) || /audio/i.test(u));
  if (audioUrl) {
    const a3 = document.createElement("a");
    a3.href = audioUrl;
    a3.className = "download-btn";
    a3.textContent = "Download Audio";
    a3.setAttribute("download", "");
    a3.setAttribute("rel", "noopener");
    wrap.appendChild(a3);
  }

  // if no buttons created, show helpful message
  if (wrap.childElementCount === 0) {
    const msg = document.createElement("div");
    msg.textContent = "Tidak ditemukan file download langsung — coba buka hasil API langsung di tab baru.";
    msg.style.opacity = "0.9";
    wrap.appendChild(msg);
  }

  resultList.appendChild(wrap);
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
