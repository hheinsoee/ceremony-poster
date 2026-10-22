const lines = [
  { label: "Title line 1", text: "ဆေးတက္ကသိုလ်(၂) ရန်ကုန်", bold: true, color: "#f4f1d0", size: 60 },
  { label: "Title line 2", text: "ကလေးကျန်းမာ ပညာဌာန", bold: false, color: "#ffffff", size: 50 },
  { label: "Title line 3", text: "ဆရာကြီး၊ ဆရာမကြီး များအား", bold: false, color: "#fff27a", size: 50 },
  { label: "Title line 4", text: "သီတင်းကျွတ်ဂါရဝ ဆရာကန်တော့ပွဲ", bold: true, color: "#ffbf1f", size: 120 },
  { label: "Date line", text: "၂၃၊ ၁၀၊ ၂၀၂၆", bold: false },
].map((line) => ({ size: 100, color: "#ffffff", strokeColor: "#14532d", strokeWidth: 0, dx: 0, dy: 0, ...line }));

/* ---------- Persistence: line settings → localStorage ---------- */

// Versioned so changed defaults replace older saved layouts.
const LINES_KEY = "ceremony-poster:lines:v8";
for (const old of ["", ":v2", ":v3", ":v4", ":v5", ":v6", ":v7"]) localStorage.removeItem(`ceremony-poster:lines${old}`);

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

/* ---------- Image slots: background photo and frame art (e.g. kanote border) ----------
   Stored as base64 data URLs in localStorage. localStorage holds ~5 MB per site and base64
   adds ~33%, so uploads are downscaled before saving. */

function toDataUrl(img, { maxSide, type, quality }) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(type, quality);
}

function imageSlot({ key, inputId, clearId, encode, apply }) {
  const storageKey = `ceremony-poster:image:${key}`;
  const input = document.getElementById(inputId);
  const clearBtn = document.getElementById(clearId);

  const set = (url) => {
    apply(url);
    clearBtn.hidden = !url;
  };

  input.addEventListener("change", () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const dataUrl = toDataUrl(img, encode);
      try {
        localStorage.setItem(storageKey, dataUrl);
      } catch {
        localStorage.removeItem(storageKey); // don't resurrect the previous image on reload
        alert("Browser storage is full, so this image won't be kept after reload.\nRemove the other image or use a smaller one.");
      }
      set(dataUrl);
    };
    // Some formats (e.g. iPhone HEIC in Chrome/Firefox) pass the picker but can't be decoded.
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert(`"${file.name}" can't be displayed in this browser (HEIC photos only work in Safari).\nPlease use a JPG, PNG or WebP image.`);
    };
    img.src = objectUrl;
  });

  clearBtn.addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    set(null);
  });

  set(localStorage.getItem(storageKey));
}

// Drop storage from earlier versions: IndexedDB images and the removed frame-image slot.
indexedDB.deleteDatabase("ceremony-poster");
localStorage.removeItem("ceremony-poster:image:frame");

imageSlot({
  key: "background",
  inputId: "bg-input",
  clearId: "bg-clear",
  encode: { maxSide: 1920, type: "image/jpeg", quality: 0.85 },
  apply: (url) => poster.style.setProperty("--bg-image", url ? `url("${url}")` : "none"),
});

/* ---------- Thadingyut lights (shown only while presenting; see #festival CSS) ---------- */

// Cloudflare Worker (worker/) relaying text messages from the ceremony Telegram group.
const WISHES_URL = "https://ceremony-wishes.hheinsoee.workers.dev/messages";

{
  const festival = document.getElementById("festival");
  const rand = (min, max) => min + Math.random() * (max - min);
  const add = (cls, vars, inner = false) => {
    const el = document.createElement("div");
    el.className = cls;
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(`--${k}`, v);
    if (inner) el.append(document.createElement("i"));
    festival.append(el);
  };

  // Sky lanterns: negative delays so some are already mid-flight when presenting starts.
  for (let i = 0; i < 6; i++) {
    const dur = rand(16, 30);
    add("lantern", {
      x: `${rand(4, 94)}%`,
      size: rand(0.6, 1.3).toFixed(2),
      dur: `${dur}s`,
      delay: `${-rand(0, dur)}s`,
      sway: `${rand(1, 3).toFixed(1)}cqmin`,
    }, true);
  }

  // Hanging lamps swinging from the top border, kept clear of the centred title.
  for (const [x, len, style] of [[18, 9, "fan"], [27, 15, "cylinder"], [73, 13, "fan"], [82, 8, "cylinder"]]) {
    add(`hanging-lamp lamp-${style}`, {
      x: `${x}%`,
      len: `${len}cqh`,
      dur: `${rand(2.8, 4).toFixed(2)}s`,
      delay: `${-rand(0, 4).toFixed(2)}s`,
    }, true);
  }

  // Oil lamps either side of the date plate, clear of the corner ornaments.
  for (const x of [19, 24.5, 30, 70, 75.5, 81]) {
    add("oil-lamp", { x: `${x}%`, dur: `${rand(0.25, 0.45).toFixed(2)}s`, delay: `${-rand(0, 1).toFixed(2)}s` });
  }

  // Sparkles scattered along the kanote border band.
  for (let i = 0; i < 28; i++) {
    const along = `${rand(2, 98)}%`;
    const across = `calc(var(--k) * ${rand(0.1, 0.9).toFixed(2)})`;
    const edge = i % 4;
    const [x, y] = [
      [along, across],
      [along, `calc(100% - ${across})`],
      [across, along],
      [`calc(100% - ${across})`, along],
    ][edge];
    add("sparkle", { x, y, size: rand(0.6, 1.2).toFixed(2), dur: `${rand(1.8, 3.6).toFixed(2)}s`, delay: `${-rand(0, 4).toFixed(2)}s` });
  }

  // Telegram wishes: polled only while presenting, each shown on a large rising lantern.
  const isPresenting = () => !!document.fullscreenElement || document.body.classList.contains("fs-fallback");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_WISHES = 4;
  const LAUNCH_GAP = 3000;
  let lastId = null; // null = next poll only records the baseline, so earlier messages never show
  const queue = [];
  let lastLaunch = 0;
  let inFlight = false;
  let failing = false;

  const poll = async () => {
    if (!isPresenting()) {
      lastId = null;
      queue.length = 0;
      return;
    }
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await fetch(`${WISHES_URL}?after=${lastId ?? 0}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      failing = false;
      if (!isPresenting()) return;
      if (lastId === null) {
        lastId = data.latest;
      } else {
        queue.push(...data.messages);
        lastId = Math.max(lastId, data.latest);
      }
    } catch (err) {
      if (!failing) console.warn("Wishes poll failed; retrying.", err);
      failing = true;
    } finally {
      inFlight = false;
    }
  };

  const launchWish = ({ text }) => {
    const el = document.createElement("div");
    el.className = "lantern wish";
    for (const [k, v] of Object.entries({ x: `${rand(12, 80)}%`, size: "1.4", dur: "26s", delay: "0s", sway: "1.5cqmin" })) {
      el.style.setProperty(`--${k}`, v);
    }
    const label = document.createElement("span");
    label.className = "wish-text";
    label.textContent = text;
    el.append(document.createElement("i"), label);
    // Remove after the rise (not the inner sway); with reduced motion nothing animates, so use a timer.
    el.addEventListener("animationend", (e) => { if (e.target === el) el.remove(); });
    if (reducedMotion.matches) setTimeout(() => el.remove(), 8000);
    festival.append(el);
  };

  const launchNext = () => {
    if (!isPresenting() || !queue.length) return;
    if (Date.now() - lastLaunch < LAUNCH_GAP) return;
    if (festival.querySelectorAll(".lantern.wish").length >= MAX_WISHES) return;
    lastLaunch = Date.now();
    launchWish(queue.shift());
  };

  setInterval(poll, 4000);
  setInterval(launchNext, 1000);
}

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
