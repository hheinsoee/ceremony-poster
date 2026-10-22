const lines = [
  { label: "Title line 1", text: "Title line 1", bold: true },
  { label: "Title line 2", text: "Title line 2", bold: true },
  { label: "Title line 3", text: "Title line 3", bold: true },
  { label: "Title line 4", text: "Title line 4", bold: true },
  { label: "Date line", text: "Date · Venue", bold: false },
].map((line) => ({ size: 100, color: "#ffffff", strokeColor: "#14532d", strokeWidth: 0, ...line }));

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
  if (!file || !file.type.startsWith("image/")) return;
  setBackground(URL.createObjectURL(file));
});

document.getElementById("bg-clear").addEventListener("click", () => {
  setBackground(null);
  bgInput.value = "";
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
