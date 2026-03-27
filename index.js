/**
 * Picasso: Lightweight Device Class Fingerprinting for Web Clients
 *
 * Client-side implementation of the canvasHash algorithm.
 * Uses HTML5 canvas primitives to produce device-class-specific fingerprints
 * based on rendering differences across browser/OS/GPU stacks.
 *
 * The core idea: identical drawing instructions produce subtly different pixel
 * outputs on different platforms due to differences in font rasterizers,
 * anti-aliasing, curve interpolation, and GPU shaders. Hashing the canvas
 * pixels turns these micro-differences into a deterministic device class signal.
 *
 * Reference: Bursztein et al., SPSM '16 (ACM CCS Workshop)
 */

"use strict";

// --- Algorithm constants ---

// Mulberry32 PRNG constants
var MULBERRY32_INCREMENT = 0x6d2b79f5;
var MULBERRY32_MIX_FACTOR = 61;
var UINT32_RANGE = 4294967296; // 2^32, used to normalize output to [0, 1)

// FNV-1a hash constants (32-bit variant)
var FNV_OFFSET_BASIS = 0x811c9dc5;
var FNV_PRIME = 0x01000193;

// Hash combining constants (Murmur-inspired mixing)
var MURMUR_MIX_CONSTANT = 0x5bd1e995;

// --- Seeded PRNG (Mulberry32) ---
// Returns a deterministic pseudo-random number generator seeded by the
// server-provided seed. This ensures every client draws the exact same
// primitives for a given challenge, so rendering differences come only
// from the underlying platform.
function createSeededRandom(seed) {
  var state = seed | 0;
  return function nextRandom() {
    state = (state + MULBERRY32_INCREMENT) | 0;
    var mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), MULBERRY32_MIX_FACTOR | mixed)) ^ mixed;
    // Convert to unsigned float in [0, 1)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

// --- Random value helpers ---
// All randomness flows through the seeded PRNG so results are reproducible.

function randomInt(rand, minValue, maxValue) {
  return Math.floor(rand() * (maxValue - minValue + 1)) + minValue;
}

function randomFloat(rand, minValue, maxValue) {
  return rand() * (maxValue - minValue) + minValue;
}

// Generate a random RGBA color string using the seeded PRNG.
// Alpha is kept above 0.1 to ensure the color is always visible.
function randomColor(rand) {
  var red = randomInt(rand, 0, 255);
  var green = randomInt(rand, 0, 255);
  var blue = randomInt(rand, 0, 255);
  var alpha = randomFloat(rand, 0.1, 1.0).toFixed(2);
  return "rgba(" + red + "," + green + "," + blue + "," + alpha + ")";
}

// --- Primitive types ---
// These four HTML5 canvas operations were chosen because each introduces
// aliasing artifacts and divergent rendering logic across platforms.
// See Section 4 of the paper for the rationale behind each choice.
var PRIMITIVE_TYPES = ["arc", "strokeText", "bezier", "quadratic"];

function selectRandomPrimitive(rand) {
  return PRIMITIVE_TYPES[randomInt(rand, 0, PRIMITIVE_TYPES.length - 1)];
}

// --- Drawing primitives ---
// Each function draws one graphical element on the canvas. The parameters
// (position, size, angles, control points) are all derived from the seeded
// PRNG so every client produces the same drawing commands.

// Draw a circular arc. Arc rendering exercises the browser's circle
// rasterizer and anti-aliasing, which varies across platforms.
function drawArc(context, rand, canvasWidth, canvasHeight) {
  var centerX = randomFloat(rand, 0, canvasWidth);
  var centerY = randomFloat(rand, 0, canvasHeight);
  var radius = randomFloat(rand, 1, Math.min(canvasWidth, canvasHeight) / 2);
  var startAngle = randomFloat(rand, 0, Math.PI * 2);
  var endAngle = randomFloat(rand, 0, Math.PI * 2);
  var lineWidth = randomFloat(rand, 1, 10);
  // Randomly choose clockwise vs counter-clockwise direction
  var counterClockwise = rand() > 0.5;

  context.beginPath();
  context.arc(centerX, centerY, radius, startAngle, endAngle, counterClockwise);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

// Draw stroked text. Font rendering is highly platform-dependent —
// different OS font rasterizers (CoreText, DirectWrite, FreeType) produce
// visibly different glyph shapes, making this the most discriminative primitive.
function drawStrokeText(context, rand, canvasWidth, canvasHeight) {
  var availableFonts = [
    "Arial", "Verdana", "Times New Roman", "Courier New",
    "Georgia", "Trebuchet MS", "Impact", "Comic Sans MS",
    "Palatino", "Garamond", "Bookman", "Helvetica"
  ];

  // Build a random text string from alphanumeric characters
  var alphanumericChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var textLength = randomInt(rand, 3, 12);
  var textContent = "";
  for (var charIndex = 0; charIndex < textLength; charIndex++) {
    textContent += alphanumericChars[randomInt(rand, 0, alphanumericChars.length - 1)];
  }

  var fontSize = randomInt(rand, 10, 60);
  var fontIndex = randomInt(rand, 0, availableFonts.length - 1);
  var textX = randomFloat(rand, 0, canvasWidth);
  // Ensure text baseline is within canvas (offset by font size from top)
  var textY = randomFloat(rand, fontSize, canvasHeight);
  var lineWidth = randomFloat(rand, 0.5, 5);

  context.font = fontSize + "px " + availableFonts[fontIndex];
  context.lineWidth = lineWidth;
  context.strokeText(textContent, textX, textY);
}

// Draw a cubic Bezier curve. The curve interpolation and anti-aliasing
// of the two control points exercises the browser's path rendering engine.
function drawBezierCurve(context, rand, canvasWidth, canvasHeight) {
  var startX = randomFloat(rand, 0, canvasWidth);
  var startY = randomFloat(rand, 0, canvasHeight);
  var controlPoint1X = randomFloat(rand, 0, canvasWidth);
  var controlPoint1Y = randomFloat(rand, 0, canvasHeight);
  var controlPoint2X = randomFloat(rand, 0, canvasWidth);
  var controlPoint2Y = randomFloat(rand, 0, canvasHeight);
  var endX = randomFloat(rand, 0, canvasWidth);
  var endY = randomFloat(rand, 0, canvasHeight);
  var lineWidth = randomFloat(rand, 1, 10);

  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, endX, endY);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

// Draw a quadratic curve (single control point). Similar to Bezier but
// with a simpler interpolation path that still surfaces platform differences.
function drawQuadraticCurve(context, rand, canvasWidth, canvasHeight) {
  var startX = randomFloat(rand, 0, canvasWidth);
  var startY = randomFloat(rand, 0, canvasHeight);
  var controlPointX = randomFloat(rand, 0, canvasWidth);
  var controlPointY = randomFloat(rand, 0, canvasHeight);
  var endX = randomFloat(rand, 0, canvasWidth);
  var endY = randomFloat(rand, 0, canvasHeight);
  var lineWidth = randomFloat(rand, 1, 10);

  context.beginPath();
  context.moveTo(startX, startY);
  context.quadraticCurveTo(controlPointX, controlPointY, endX, endY);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

// Map primitive type names to their drawing functions
var PRIMITIVE_DRAW_FUNCTIONS = {
  arc: drawArc,
  strokeText: drawStrokeText,
  bezier: drawBezierCurve,
  quadratic: drawQuadraticCurve
};

// --- Styling: gradient + shadow ---
// Each primitive gets a random radial gradient and shadow applied before
// drawing. These style operations (createRadialGradient, shadowBlur,
// shadowColor) introduce additional rendering entropy that varies by platform.

function applyRandomStyle(context, rand, canvasWidth, canvasHeight) {
  // Create a radial gradient between two random circles
  var gradientStartX = randomFloat(rand, 0, canvasWidth);
  var gradientStartY = randomFloat(rand, 0, canvasHeight);
  var gradientStartRadius = randomFloat(rand, 0, Math.min(canvasWidth, canvasHeight) / 4);
  var gradientEndX = randomFloat(rand, 0, canvasWidth);
  var gradientEndY = randomFloat(rand, 0, canvasHeight);
  var gradientEndRadius = randomFloat(rand, gradientStartRadius, Math.min(canvasWidth, canvasHeight) / 2);

  var gradient = context.createRadialGradient(
    gradientStartX, gradientStartY, gradientStartRadius,
    gradientEndX, gradientEndY, gradientEndRadius
  );
  gradient.addColorStop(0, randomColor(rand));
  gradient.addColorStop(1, randomColor(rand));
  context.strokeStyle = gradient;

  // Apply shadow — shadow rendering is another source of cross-platform divergence
  context.shadowBlur = randomFloat(rand, 0, 20);
  context.shadowColor = randomColor(rand);
  context.shadowOffsetX = randomFloat(rand, -10, 10);
  context.shadowOffsetY = randomFloat(rand, -10, 10);
}

// --- Canvas pixel hashing ---
// We use FNV-1a (32-bit) to hash the raw RGBA pixel data from the canvas.
// This is fast, has good avalanche properties (a single pixel difference
// flips ~50% of the output bits), and produces a compact 8-hex-char digest.

function hashCanvasPixels(canvas) {
  var context = canvas.getContext("2d");
  var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  var pixelData = imageData.data; // Uint8ClampedArray of RGBA values

  // FNV-1a 32-bit: start with the FNV offset basis
  var hashValue = FNV_OFFSET_BASIS;
  for (var pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
    hashValue ^= pixelData[pixelIndex];
    hashValue = Math.imul(hashValue, FNV_PRIME);
  }

  // Convert to unsigned 32-bit hex string
  return (hashValue >>> 0).toString(16).padStart(8, "0");
}

// Combine two hash strings into one by XOR-rotating and mixing.
// This chains round hashes together so the final response depends
// on every intermediate canvas state (avalanche across rounds).
function combineHashes(previousHash, currentHash) {
  var previousValue = parseInt(previousHash, 16) >>> 0;
  var currentValue = parseInt(currentHash, 16) >>> 0;

  // XOR with a 13-bit rotation of the current hash
  var combined = (previousValue ^ ((currentValue << 13) | (currentValue >>> 19))) >>> 0;
  // Multiply by a mixing constant (Murmur-inspired) for better distribution
  combined = Math.imul(combined, MURMUR_MIX_CONSTANT) >>> 0;
  // Final XOR-shift to improve avalanche
  combined ^= combined >>> 15;

  return combined.toString(16).padStart(8, "0");
}

// --- Main canvasHash algorithm (Algorithm 1 from the paper) ---
//
// For each round:
//   1. Pick a random primitive type (arc, text, bezier, quadratic)
//   2. Apply random gradient and shadow styling
//   3. Draw the primitive with random parameters
//   4. Hash the entire canvas pixel buffer
//   5. Chain this round's hash with the accumulated response
//
// The final response is a single hash that encodes the cumulative
// rendering output across all rounds. Because each round's hash feeds
// into the next, any per-pixel difference in any round propagates to
// the final result.

/**
 * @param {number} seed - Server-provided random seed for deterministic drawing
 * @param {number} rounds - Number of drawing rounds (controls computation cost)
 * @param {number} canvasSize - Canvas dimension in pixels (canvasSize x canvasSize)
 * @param {HTMLCanvasElement} [existingCanvas] - Optional canvas element to draw on.
 *   If provided, draws visibly on this canvas. If omitted, creates a hidden offscreen canvas.
 * @returns {string} 8-character hex fingerprint response
 */
function canvasHash(seed, rounds, canvasSize, existingCanvas) {
  var rand = createSeededRandom(seed);

  // Use the provided canvas or create a hidden offscreen one
  var canvas = existingCanvas || document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  var context = canvas.getContext("2d");

  // Accumulator for chained round hashes
  var response = "00000000";

  for (var roundIndex = 0; roundIndex < rounds; roundIndex++) {
    // Select which primitive to draw this round
    var primitiveType = selectRandomPrimitive(rand);

    // Apply random gradient and shadow before drawing
    applyRandomStyle(context, rand, canvasSize, canvasSize);

    // Draw the selected primitive with random parameters
    PRIMITIVE_DRAW_FUNCTIONS[primitiveType](context, rand, canvasSize, canvasSize);

    // Hash the current canvas state and chain with previous rounds
    var roundHash = hashCanvasPixels(canvas);
    response = combineHashes(response, roundHash);
  }

  return response;
}

// --- Public API ---

/**
 * Solve a challenge issued by the server.
 * Executes the canvasHash algorithm locally and returns the result
 * along with client metadata for device class labeling.
 *
 * @param {Object} challenge - { seed, rounds, canvasSize }
 * @param {HTMLCanvasElement} [existingCanvas] - Optional canvas to draw on visibly.
 * @returns {Object} Solution with response hash and client metadata
 */
exports.solve = function (challenge, existingCanvas) {
  var startTime = performance.now();
  var response = canvasHash(challenge.seed, challenge.rounds, challenge.canvasSize, existingCanvas);
  var elapsedMs = performance.now() - startTime;

  return {
    seed: challenge.seed,
    rounds: challenge.rounds,
    canvasSize: challenge.canvasSize,
    response: response,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    elapsed: Math.round(elapsedMs),
    timestamp: Date.now()
  };
};

/**
 * Full challenge-response flow: fetch a challenge from the server,
 * solve it locally, and submit the response for verification.
 *
 * @param {string} serverUrl - Base URL of the Picasso server (empty for same-origin)
 * @returns {Promise<Object>} Verification result from the server
 */
exports.run = function (serverUrl) {
  var baseUrl = serverUrl || "";

  return fetch(baseUrl + "/api/challenge")
    .then(function (challengeResponse) { return challengeResponse.json(); })
    .then(function (challenge) {
      var solution = exports.solve(challenge);
      return fetch(baseUrl + "/api/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solution)
      });
    })
    .then(function (verificationResponse) { return verificationResponse.json(); });
};

// Also export the low-level canvasHash for direct use
exports.canvasHash = canvasHash;
