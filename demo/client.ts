// Uses the package the same way an npm consumer would:
// import { canvasHash } from "picasso-fingerprint";
// Resolved via package.json "main" field.
import { canvasHash } from "picasso-fingerprint";

interface HistoryEntry {
  seed: number;
  rounds: number;
  response: string;
  elapsed: number;
}

const runHistory: HistoryEntry[] = [];

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown";
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  if (/CrOS/.test(ua)) return "ChromeOS";
  return "Unknown";
}

function runPicasso(): void {
  const btn = document.getElementById("run-btn") as HTMLButtonElement;
  const status = document.getElementById("status")!;
  const seedInput = document.getElementById("seed-input") as HTMLInputElement;
  const roundsInput = document.getElementById("rounds-input") as HTMLInputElement;
  const hiddenToggle = document.getElementById("hidden-toggle") as HTMLInputElement;
  btn.disabled = true;
  status.textContent = "Generating fingerprint...";

  const seed = seedInput.value.trim() !== ""
    ? parseInt(seedInput.value.trim(), 10)
    : Math.floor(Math.random() * 1000);

  const rounds = roundsInput.value.trim() !== ""
    ? parseInt(roundsInput.value.trim(), 10)
    : Math.floor(Math.random() * 4) + 1;

  const canvasSize = 200;
  const previewCanvas = hiddenToggle.checked
    ? null
    : document.getElementById("canvas-preview") as HTMLCanvasElement;

  const startTime = performance.now();
  const hash = canvasHash(seed, rounds, canvasSize, previewCanvas);
  const elapsed = Math.round(performance.now() - startTime);

  if (hiddenToggle.checked) {
    const ctx = (document.getElementById("canvas-preview") as HTMLCanvasElement).getContext("2d")!;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.fillStyle = "#888";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("(hidden canvas mode)", canvasSize / 2, canvasSize / 2);
  }

  document.getElementById("fp-display")!.textContent = hash;
  document.getElementById("meta-browser")!.textContent = detectBrowser();
  document.getElementById("meta-os")!.textContent = detectOS();
  document.getElementById("meta-class")!.textContent = `${detectBrowser()} / ${detectOS()}`;
  document.getElementById("meta-time")!.textContent = `${elapsed} ms`;
  document.getElementById("meta-challenge")!.textContent = `${seed} / ${rounds} rounds`;
  document.getElementById("meta-ua")!.textContent = navigator.userAgent;

  status.textContent = "Fingerprint computed locally.";

  runHistory.unshift({ seed, rounds, response: hash, elapsed });
  renderHistory();

  btn.disabled = false;
}

function renderHistory(): void {
  const card = document.getElementById("history-card")!;
  const tbody = document.getElementById("history-body")!;
  if (runHistory.length === 0) { card.style.display = "none"; return; }
  card.style.display = "block";
  tbody.innerHTML = runHistory.map((entry) =>
    `<tr><td>${entry.seed}</td><td>${entry.rounds}</td><td>${entry.response}</td><td>${entry.elapsed}ms</td></tr>`
  ).join("");
}

(window as any).runPicasso = runPicasso;
runPicasso();
