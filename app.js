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

function render(i) {
  const line = lines[i];
  const el = lineEls[i];
  el.textContent = line.text;
  el.style.setProperty("--c", line.color);
  el.style.setProperty("--w", line.bold ? "700" : "400");
  el.style.setProperty("--sc", line.strokeColor);
  el.style.setProperty("--sw", `${line.strokeWidth}px`);
  el.style.setProperty("--s", line.size / 100);
}

/* ---------- Line controls ---------- */

const template = document.getElementById("line-template");
const lineControls = document.getElementById("line-controls");

lines.forEach((line, i) => {
  const group = template.content.firstElementChild.cloneNode(true);
  const q = (cls) => group.querySelector(cls);
  const strokeOut = q(".f-stroke-out");
  const sizeOut = q(".f-size-out");

  q("legend").textContent = line.label;
  q(".f-text").value = line.text;
  q(".f-bold").checked = line.bold;
  q(".f-color").value = line.color;
  q(".f-stroke-color").value = line.strokeColor;
  q(".f-stroke-width").value = line.strokeWidth;
  strokeOut.textContent = line.strokeWidth;
  q(".f-size").value = line.size;
  sizeOut.textContent = `${line.size}%`;

  const bind = (cls, event, apply) =>
    q(cls).addEventListener(event, (e) => {
      apply(e.target);
      render(i);
      saveLines();
    });

  bind(".f-text", "input", (t) => (line.text = t.value));
  bind(".f-bold", "change", (t) => (line.bold = t.checked));
  bind(".f-color", "input", (t) => (line.color = t.value));
  bind(".f-stroke-color", "input", (t) => (line.strokeColor = t.value));
  bind(".f-stroke-width", "input", (t) => {
    line.strokeWidth = Number(t.value);
    strokeOut.textContent = t.value;
  });
  bind(".f-size", "input", (t) => {
    line.size = Number(t.value);
    sizeOut.textContent = `${t.value}%`;
  });

  lineControls.append(group);
  render(i);
});

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
