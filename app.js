const lines = [
  { label: "Title line 1", text: "သီတင်းကျွတ်ပွဲတော်", bold: true },
  { label: "Title line 2", text: "ဆရာ၊ မိဘ၊ သက်ကြီးဝါကြီးများ", bold: true },
  { label: "Title line 3", text: "ပူဇော်ကန်တော့ပွဲ", bold: true },
  { label: "Title line 4", text: "၂၀၂၆ ခုနှစ်", bold: true },
  { label: "Date line", text: "နေ့စွဲ · နေရာ", bold: false },
].map((line) => ({ size: 100, color: "#ffffff", strokeColor: "#14532d", strokeWidth: 0, dx: 0, dy: 0, ...line }));

/* ---------- Persistence: line settings → localStorage, background Blob → IndexedDB ---------- */

const LINES_KEY = "ceremony-poster:lines";

try {
  const saved = JSON.parse(localStorage.getItem(LINES_KEY));
  if (Array.isArray(saved)) {
    lines.forEach((line, i) => {
      for (const key of ["text", "bold", "color", "strokeColor", "strokeWidth", "size", "dx", "dy"]) {
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

async function fileStore(mode, op) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const req = op(db.transaction("files", mode).objectStore("files"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

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
  // Offset from the default slot, in % of poster width / height
  el.style.setProperty("--dx", line.dx);
  el.style.setProperty("--dy", line.dy);
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
  enableDrag(el, i);
  applyStyle(i);
});

/* ---------- Drag to move (unfocused line: drag moves, click edits) ---------- */

function enableDrag(el, i) {
  // Stop the browser from focusing / selecting on press; we decide on release.
  el.addEventListener("mousedown", (e) => {
    if (document.activeElement !== el) e.preventDefault();
  });

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || document.activeElement === el) return;
    e.preventDefault();
    const line = lines[i];
    const box = poster.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, dx: line.dx, dy: line.dy };
    let moved = false;
    el.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      const mx = ev.clientX - start.x;
      const my = ev.clientY - start.y;
      if (!moved) {
        if (Math.hypot(mx, my) < 4) return;
        moved = true;
        document.activeElement?.blur();
        closeToolbar();
        el.classList.add("dragging");
      }
      line.dx = start.dx + (mx / box.width) * 100;
      line.dy = start.dy + (my / box.height) * 100;
      applyStyle(i);
    };

    const onUp = (ev) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.classList.remove("dragging");
      if (moved) {
        saveLines();
      } else {
        el.focus();
        placeCaret(el, ev.clientX, ev.clientY);
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  });
}

function placeCaret(el, x, y) {
  let range = null;
  const pos = document.caretPositionFromPoint?.(x, y);
  if (pos) {
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
  } else {
    range = document.caretRangeFromPoint?.(x, y);
  }
  if (!range || !el.contains(range.startContainer)) return;
  range.collapse(true);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

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
bind(".f-reset-pos", "click", (line) => {
  line.dx = 0;
  line.dy = 0;
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

/* ---------- Image slots: background photo and frame art (e.g. kanote border) ---------- */

function imageSlot({ key, inputId, clearId, apply }) {
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);
  let url = null;

  const set = (next) => {
    if (url) URL.revokeObjectURL(url);
    url = next;
    apply(url);
    clearBtn.hidden = !url;
  };
  const warn = (what) => (err) => console.warn(`Could not ${what} ${key}`, err);

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const next = URL.createObjectURL(file);
    // Some formats (e.g. iPhone HEIC in Chrome/Firefox) pass the picker but can't be decoded.
    const probe = new Image();
    probe.onload = () => {
      set(next);
      fileStore("readwrite", (s) => s.put(file, key)).catch(warn("save"));
    };
    probe.onerror = () => {
      URL.revokeObjectURL(next);
      input.value = "";
      alert(`"${file.name}" can't be displayed in this browser (HEIC photos only work in Safari).\nPlease use a JPG, PNG or WebP image.`);
    };
    probe.src = next;
  });

  clearBtn.addEventListener("click", () => {
    set(null);
    input.value = "";
    fileStore("readwrite", (s) => s.delete(key)).catch(warn("delete"));
  });

  fileStore("readonly", (s) => s.get(key))
    .then((blob) => blob && !url && set(URL.createObjectURL(blob)))
    .catch(warn("load"));
}

imageSlot({
  key: "background",
  inputId: "bg-input",
  clearId: "bg-clear",
  apply: (url) => poster.style.setProperty("--bg-image", url ? `url("${url}")` : "none"),
});

imageSlot({
  key: "frame",
  inputId: "frame-input",
  clearId: "frame-clear",
  apply: (url) => {
    poster.style.setProperty("--frame-image", url ? `url("${url}")` : "none");
    poster.classList.toggle("has-frame-art", !!url);
  },
});

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
