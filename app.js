const lines = [
  { label: "Title line 1", text: "Title line 1", bold: true },
  { label: "Title line 2", text: "Title line 2", bold: true },
  { label: "Title line 3", text: "Title line 3", bold: true },
  { label: "Title line 4", text: "Title line 4", bold: true },
  { label: "Date line", text: "Date · Venue", bold: false },
].map((line) => ({ size: 100, color: "#ffffff", strokeColor: "#14532d", strokeWidth: 0, ...line }));

/* ---------- Persistence: line settings → localStorage, background Blob → IndexedDB ---------- */

const LINES_KEY = "ceremony-poster:lines";

try {
  const saved = JSON.parse(localStorage.getItem(LINES_KEY));
  if (Array.isArray(saved)) {
    lines.forEach((line, i) => {
      for (const key of ["text", "bold", "color", "strokeColor", "strokeWidth", "size"]) {
        if (typeof saved[i]?.[key] === typeof line[key]) line[key] = saved[i][key];
      }
    });
  }
} catch {
  // Corrupt or unavailable storage: keep defaults.
}

function saveLines() {
  try {
    localStorage.setItem(LINES_KEY, JSON.stringify(lines.map(({ label, ...rest }) => rest)));
  } catch (err) {
    console.warn("Could not save settings", err);
  }
}

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open("ceremony-poster", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("files");
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function bgStore(mode, op) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const req = op(db.transaction("files", mode).objectStore("files"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const loadBg = () => bgStore("readonly", (s) => s.get("background"));
const saveBg = (blob) =>
  bgStore("readwrite", (s) => s.put(blob, "background")).catch((err) =>
    console.warn("Could not save background", err),
  );
const deleteBg = () =>
  bgStore("readwrite", (s) => s.delete("background")).catch((err) =>
    console.warn("Could not delete background", err),
  );

const poster = document.getElementById("poster");
const stage = document.getElementById("stage");
const lineEls = poster.querySelectorAll(".line");
const exitBtn = document.getElementById("exit-btn");

function applyStyle(i) {
  const line = lines[i];
  const el = lineEls[i];
  el.style.setProperty("--c", line.color);
  el.style.setProperty("--w", line.bold ? "700" : "400");
  el.style.setProperty("--sc", line.strokeColor);
  el.style.setProperty("--sw", `${line.strokeWidth}px`);
  el.style.setProperty("--s", line.size / 100);
}

/* ---------- Inline text editing on the poster ---------- */

lineEls.forEach((el, i) => {
  el.textContent = lines[i].text;
  el.contentEditable = "plaintext-only";
  if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  el.spellcheck = false;
  el.addEventListener("input", () => {
    lines[i].text = el.textContent;
    if (!lines[i].text) el.replaceChildren(); // drop stray <br> so :empty matches
    saveLines();
    placeToolbar();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      el.blur();
      closeToolbar();
    }
  });
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
    document.execCommand("insertText", false, text);
  });
  el.addEventListener("focus", () => openToolbar(i));
  applyStyle(i);
});

/* ---------- Floating style toolbar for the line being edited ---------- */

const toolbar = document.getElementById("line-toolbar");
const tq = (cls) => toolbar.querySelector(cls);
let current = -1;

function openToolbar(i) {
  current = i;
  const line = lines[i];
  tq("#toolbar-title").textContent = line.label;
  tq(".f-bold").checked = line.bold;
  tq(".f-color").value = line.color;
  tq(".f-stroke-color").value = line.strokeColor;
  tq(".f-stroke-width").value = line.strokeWidth;
  tq(".f-stroke-out").textContent = line.strokeWidth;
  tq(".f-size").value = line.size;
  tq(".f-size-out").textContent = `${line.size}%`;
  toolbar.hidden = false;
  placeToolbar();
}

function closeToolbar() {
  current = -1;
  toolbar.hidden = true;
}

// Below the line if it fits, otherwise above; clamped to the viewport.
function placeToolbar() {
  if (current < 0) return;
  const gap = 12;
  const margin = 8;
  const line = lineEls[current].getBoundingClientRect();
  const { width, height } = toolbar.getBoundingClientRect();
  let top = line.bottom + gap;
  if (top + height > innerHeight - margin) top = line.top - gap - height;
  const left = line.left + line.width / 2 - width / 2;
  toolbar.style.top = `${Math.max(margin, top)}px`;
  toolbar.style.left = `${Math.min(Math.max(margin, left), innerWidth - width - margin)}px`;
}

const bind = (cls, event, apply) =>
  tq(cls).addEventListener(event, (e) => {
    if (current < 0) return;
    apply(lines[current], e.target);
    applyStyle(current);
    saveLines();
    placeToolbar();
  });

bind(".f-bold", "change", (line, t) => (line.bold = t.checked));
bind(".f-color", "input", (line, t) => (line.color = t.value));
bind(".f-stroke-color", "input", (line, t) => (line.strokeColor = t.value));
bind(".f-stroke-width", "input", (line, t) => {
  line.strokeWidth = Number(t.value);
  tq(".f-stroke-out").textContent = t.value;
});
bind(".f-size", "input", (line, t) => {
  line.size = Number(t.value);
  tq(".f-size-out").textContent = `${t.value}%`;
});

// Close when interacting with anything other than the toolbar or another poster line.
document.addEventListener("pointerdown", (e) => {
  if (current >= 0 && !toolbar.contains(e.target) && !e.target.closest(".line[contenteditable]")) {
    closeToolbar();
  }
});
toolbar.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeToolbar();
});
addEventListener("resize", placeToolbar);
addEventListener("scroll", placeToolbar, true);

/* ---------- Background ---------- */

const bgInput = document.getElementById("bg-input");
let bgUrl = null;

function setBackground(url) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = url;
  poster.style.setProperty("--bg-image", url ? `url("${url}")` : "none");
}

bgInput.addEventListener("change", () => {
  const file = bgInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  // Some formats (e.g. iPhone HEIC in Chrome/Firefox) pass the picker but can't be decoded.
  const probe = new Image();
  probe.onload = () => {
    setBackground(url);
    saveBg(file);
  };
  probe.onerror = () => {
    URL.revokeObjectURL(url);
    bgInput.value = "";
    alert(`"${file.name}" can't be displayed in this browser (HEIC photos only work in Safari).\nPlease use a JPG, PNG or WebP image.`);
  };
  probe.src = url;
});

document.getElementById("bg-clear").addEventListener("click", () => {
  setBackground(null);
  bgInput.value = "";
  deleteBg();
});

loadBg()
  .then((blob) => blob && !bgUrl && setBackground(URL.createObjectURL(blob)))
  .catch((err) => console.warn("Could not load background", err));

/* ---------- Start / presentation ---------- */

function enterFallback() {
  document.body.classList.add("fs-fallback");
  exitBtn.hidden = false;
}

function exitFallback() {
  document.body.classList.remove("fs-fallback");
  exitBtn.hidden = true;
}

document.getElementById("start-btn").addEventListener("click", () => {
  document.activeElement?.blur();
  closeToolbar();
  if (stage.requestFullscreen) {
    stage.requestFullscreen().catch(enterFallback);
  } else {
    enterFallback();
  }
});

exitBtn.addEventListener("click", exitFallback);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") exitFallback();
});
