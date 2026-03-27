const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory store for challenge-response pairs ---
// Maps: response hash -> { deviceClass, count, firstSeen, lastSeen }
const fingerprintDB = new Map();
// Maps: seed -> { challenge, issued }
const pendingChallenges = new Map();
// Recent submissions for the dashboard
const recentSubmissions = [];
const MAX_RECENT = 200;

// --- Configuration ---
const CANVAS_SIZE = 200;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 4;
const SEED_RANGE = 1000;

// --- Challenge generation ---

function generateChallenge() {
  const seed = crypto.randomInt(0, SEED_RANGE);
  const rounds = crypto.randomInt(MIN_ROUNDS, MAX_ROUNDS + 1);
  const challenge = { seed, rounds, canvasSize: CANVAS_SIZE };
  const id = crypto.randomUUID();
  pendingChallenges.set(id, { challenge, issued: Date.now() });

  // Prune old pending challenges (>5 minutes)
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of pendingChallenges) {
    if (val.issued < cutoff) pendingChallenges.delete(key);
  }

  return { ...challenge, challengeId: id };
}

// --- Device class extraction from User-Agent ---

function parseDeviceClass(userAgent, platform) {
  let browser = "Unknown";
  let os = "Unknown";

  // OS detection
  if (/iPhone|iPad|iPod/.test(userAgent)) os = "iOS";
  else if (/Android/.test(userAgent)) os = "Android";
  else if (/Mac OS X/.test(userAgent)) os = "Mac OSX";
  else if (/Windows NT 10/.test(userAgent)) os = "Windows 10+";
  else if (/Windows NT 6\.3/.test(userAgent)) os = "Windows 8.1";
  else if (/Windows NT 6\.2/.test(userAgent)) os = "Windows 8";
  else if (/Windows NT 6\.1/.test(userAgent)) os = "Windows 7";
  else if (/Windows/.test(userAgent)) os = "Windows";
  else if (/Linux/.test(userAgent)) os = "Linux";
  else if (/CrOS/.test(userAgent)) os = "ChromeOS";

  // Browser detection
  if (/Edg\//.test(userAgent)) browser = "Edge";
  else if (/OPR\/|Opera/.test(userAgent)) browser = "Opera";
  else if (/Firefox\//.test(userAgent)) browser = "Firefox";
  else if (/Chrome\//.test(userAgent)) browser = "Chrome";
  else if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) browser = "Safari";
  else if (/Safari\//.test(userAgent)) browser = "Safari";

  return { browser, os, reported: `${browser} / ${os}` };
}

// --- API Routes ---

// GET /api/challenge - Issue a new challenge
app.get("/api/challenge", (req, res) => {
  const challenge = generateChallenge();
  res.json(challenge);
});

// POST /api/response - Submit a challenge response
app.post("/api/response", (req, res) => {
  const { seed, rounds, canvasSize, response, userAgent, platform, elapsed, challengeId } = req.body;

  if (!response || typeof response !== "string") {
    return res.status(400).json({ error: "Missing or invalid response" });
  }

  const deviceClass = parseDeviceClass(userAgent || "", platform || "");

  // Build a fingerprint key: seed + response
  const fpKey = `${seed}:${rounds}:${response}`;

  // Store/update fingerprint
  if (fingerprintDB.has(fpKey)) {
    const entry = fingerprintDB.get(fpKey);
    entry.count++;
    entry.lastSeen = Date.now();
  } else {
    fingerprintDB.set(fpKey, {
      deviceClass: deviceClass.reported,
      userAgent: userAgent || "Unknown",
      count: 1,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    });
  }

  // Check if this response matches a known device class
  // In a production system, we'd verify against the bootstrap dictionary
  const knownEntries = [];
  for (const [key, val] of fingerprintDB) {
    if (key.endsWith(`:${response}`) && key.startsWith(`${seed}:`)) {
      knownEntries.push(val);
    }
  }

  const isKnown = knownEntries.length > 0;
  const matchesReported = knownEntries.some(e => e.deviceClass === deviceClass.reported);

  // Track recent submissions
  const submission = {
    time: new Date().toISOString(),
    seed,
    rounds,
    response,
    deviceClass: deviceClass.reported,
    userAgent: (userAgent || "").substring(0, 120),
    elapsed,
    verified: matchesReported,
    totalMatches: knownEntries.reduce((s, e) => s + e.count, 0)
  };
  recentSubmissions.unshift(submission);
  if (recentSubmissions.length > MAX_RECENT) recentSubmissions.length = MAX_RECENT;

  // Remove from pending
  if (challengeId) pendingChallenges.delete(challengeId);

  res.json({
    fingerprint: response,
    deviceClass: deviceClass,
    known: isKnown,
    consistent: matchesReported,
    totalObservations: knownEntries.reduce((s, e) => s + e.count, 0),
    elapsed
  });
});

// GET /api/stats - Dashboard data
app.get("/api/stats", (req, res) => {
  // Aggregate by device class
  const classCounts = {};
  for (const [, val] of fingerprintDB) {
    classCounts[val.deviceClass] = (classCounts[val.deviceClass] || 0) + val.count;
  }

  res.json({
    totalFingerprints: fingerprintDB.size,
    totalSubmissions: [...fingerprintDB.values()].reduce((s, e) => s + e.count, 0),
    deviceClasses: classCounts,
    recentSubmissions: recentSubmissions.slice(0, 50)
  });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Picasso fingerprinting server running on http://localhost:${PORT}`);
});
