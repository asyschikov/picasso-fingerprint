var Picasso = require("../index");

var runHistory = [];

function drawPreview(seed, rounds, size) {
  var result = Picasso.canvasHash(seed, rounds, size, document.getElementById("canvas-preview"));
  // canvasHash already drew on the preview canvas as a side effect
}

function runPicasso() {
  var btn = document.getElementById("run-btn");
  var status = document.getElementById("status");
  var seedInput = document.getElementById("seed-input");
  var roundsInput = document.getElementById("rounds-input");
  var hiddenToggle = document.getElementById("hidden-toggle");
  btn.disabled = true;
  status.textContent = "Generating fingerprint...";

  fetch("/api/challenge")
    .then(function (res) { return res.json(); })
    .then(function (challenge) {
      var manualSeed = seedInput.value.trim();
      if (manualSeed !== "") {
        challenge.seed = parseInt(manualSeed, 10);
      }
      var manualRounds = roundsInput.value.trim();
      if (manualRounds !== "") {
        challenge.rounds = parseInt(manualRounds, 10);
      }

      // Solve the challenge — optionally render on a visible canvas
      var previewCanvas = hiddenToggle.checked ? null : document.getElementById("canvas-preview");
      var solution = Picasso.solve(challenge, previewCanvas);

      // If using hidden canvas, clear the preview
      if (hiddenToggle.checked) {
        var previewCtx = document.getElementById("canvas-preview").getContext("2d");
        previewCtx.clearRect(0, 0, challenge.canvasSize, challenge.canvasSize);
        previewCtx.fillStyle = "#888";
        previewCtx.font = "14px sans-serif";
        previewCtx.textAlign = "center";
        previewCtx.fillText("(hidden canvas mode)", challenge.canvasSize / 2, challenge.canvasSize / 2);
      }

      return fetch("/api/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solution)
      })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        document.getElementById("fp-display").textContent = result.fingerprint;
        document.getElementById("meta-browser").textContent = result.deviceClass.browser;
        document.getElementById("meta-os").textContent = result.deviceClass.os;
        document.getElementById("meta-class").textContent = result.deviceClass.reported;
        document.getElementById("meta-time").textContent = result.elapsed + " ms";
        document.getElementById("meta-challenge").textContent = challenge.seed + " / " + challenge.rounds + " rounds";
        document.getElementById("meta-observations").textContent = result.totalObservations;

        status.textContent = result.consistent
          ? "Fingerprint consistent with reported device class."
          : "New fingerprint recorded.";

        runHistory.unshift({
          seed: challenge.seed,
          rounds: challenge.rounds,
          response: result.fingerprint,
          elapsed: result.elapsed,
          consistent: result.consistent
        });
        renderHistory();
      });
    })
    .catch(function (err) {
      status.textContent = "Error: " + err.message;
    })
    .finally(function () {
      btn.disabled = false;
      loadStats();
    });
}

function renderHistory() {
  var card = document.getElementById("history-card");
  var tbody = document.getElementById("history-body");
  if (runHistory.length === 0) { card.style.display = "none"; return; }
  card.style.display = "block";
  tbody.innerHTML = runHistory.map(function (entry) {
    var badge = entry.consistent
      ? '<span class="badge badge-ok">consistent</span>'
      : '<span class="badge badge-new">new</span>';
    return "<tr><td>" + entry.seed + "</td><td>" + entry.rounds + "</td><td>" +
      entry.response + "</td><td>" + entry.elapsed + "ms</td><td>" + badge + "</td></tr>";
  }).join("");
}

function loadStats() {
  fetch("/api/stats")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var card = document.getElementById("stats-card");
      var grid = document.getElementById("stats-grid");
      card.style.display = "block";

      var classes = Object.entries(data.deviceClasses || {});
      var html = '<div class="meta-item"><div class="label">Unique Fingerprints</div><div class="value">' +
        data.totalFingerprints + '</div></div>' +
        '<div class="meta-item"><div class="label">Total Submissions</div><div class="value">' +
        data.totalSubmissions + '</div></div>';

      classes.forEach(function (entry) {
        html += '<div class="meta-item"><div class="label">' + entry[0] + '</div><div class="value highlight">' + entry[1] + ' observations</div></div>';
      });

      grid.innerHTML = html;
    });
}

// Expose to HTML onclick handlers
window.runPicasso = runPicasso;

// Auto-run on load
runPicasso();
