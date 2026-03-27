/**
 * Picasso: Lightweight Device Class Fingerprinting for Web Clients
 *
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

// --- Algorithm constants ---

const MULBERRY32_INCREMENT = 0x6d2b79f5;
const MULBERRY32_MIX_FACTOR = 61;
const UINT32_RANGE = 4294967296; // 2^32, used to normalize output to [0, 1)

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const MURMUR_MIX_CONSTANT = 0x5bd1e995;

// --- Types ---

export interface Challenge {
  seed: number;
  rounds: number;
  canvasSize: number;
}

export interface Solution {
  seed: number;
  rounds: number;
  canvasSize: number;
  response: string;
  userAgent: string;
  platform: string;
  elapsed: number;
  timestamp: number;
}

type RandomFn = () => number;

// --- Seeded PRNG (Mulberry32) ---
// Returns a deterministic pseudo-random number generator seeded by the
// server-provided seed. This ensures every client draws the exact same
// primitives for a given challenge, so rendering differences come only
// from the underlying platform.
function createSeededRandom(seed: number): RandomFn {
  let state = seed | 0;
  return function nextRandom(): number {
    state = (state + MULBERRY32_INCREMENT) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), MULBERRY32_MIX_FACTOR | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

// --- Random value helpers ---

function randomInt(rand: RandomFn, minValue: number, maxValue: number): number {
  return Math.floor(rand() * (maxValue - minValue + 1)) + minValue;
}

function randomFloat(rand: RandomFn, minValue: number, maxValue: number): number {
  return rand() * (maxValue - minValue) + minValue;
}

// Generate a random RGBA color string. Alpha is kept above 0.1 so the color is visible.
function randomColor(rand: RandomFn): string {
  const red = randomInt(rand, 0, 255);
  const green = randomInt(rand, 0, 255);
  const blue = randomInt(rand, 0, 255);
  const alpha = randomFloat(rand, 0.1, 1.0).toFixed(2);
  return `rgba(${red},${green},${blue},${alpha})`;
}

// --- Primitive types ---
// These four HTML5 canvas operations each introduce aliasing artifacts and
// divergent rendering logic across platforms (Section 4 of the paper).
const PRIMITIVE_TYPES = ["arc", "strokeText", "bezier", "quadratic"] as const;
type PrimitiveType = typeof PRIMITIVE_TYPES[number];

function selectRandomPrimitive(rand: RandomFn): PrimitiveType {
  return PRIMITIVE_TYPES[randomInt(rand, 0, PRIMITIVE_TYPES.length - 1)];
}

// --- Drawing primitives ---

// Draw a circular arc. Exercises the browser's circle rasterizer and anti-aliasing.
function drawArc(context: CanvasRenderingContext2D, rand: RandomFn, canvasWidth: number, canvasHeight: number): void {
  const centerX = randomFloat(rand, 0, canvasWidth);
  const centerY = randomFloat(rand, 0, canvasHeight);
  const radius = randomFloat(rand, 1, Math.min(canvasWidth, canvasHeight) / 2);
  const startAngle = randomFloat(rand, 0, Math.PI * 2);
  const endAngle = randomFloat(rand, 0, Math.PI * 2);
  const lineWidth = randomFloat(rand, 1, 10);
  const counterClockwise = rand() > 0.5;

  context.beginPath();
  context.arc(centerX, centerY, radius, startAngle, endAngle, counterClockwise);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

// Draw stroked text. Font rendering is highly platform-dependent —
// CoreText, DirectWrite, and FreeType produce visibly different glyphs.
function drawStrokeText(context: CanvasRenderingContext2D, rand: RandomFn, canvasWidth: number, canvasHeight: number): void {
  const availableFonts = [
    "Arial", "Verdana", "Times New Roman", "Courier New",
    "Georgia", "Trebuchet MS", "Impact", "Comic Sans MS",
    "Palatino", "Garamond", "Bookman", "Helvetica"
  ];

  const alphanumericChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const textLength = randomInt(rand, 3, 12);
  let textContent = "";
  for (let charIndex = 0; charIndex < textLength; charIndex++) {
    textContent += alphanumericChars[randomInt(rand, 0, alphanumericChars.length - 1)];
  }

  const fontSize = randomInt(rand, 10, 60);
  const fontIndex = randomInt(rand, 0, availableFonts.length - 1);
  const textX = randomFloat(rand, 0, canvasWidth);
  const textY = randomFloat(rand, fontSize, canvasHeight);
  const lineWidth = randomFloat(rand, 0.5, 5);

  context.font = `${fontSize}px ${availableFonts[fontIndex]}`;
  context.lineWidth = lineWidth;
  context.strokeText(textContent, textX, textY);
}

// Draw a cubic Bezier curve. Exercises the browser's path rendering engine.
function drawBezierCurve(context: CanvasRenderingContext2D, rand: RandomFn, canvasWidth: number, canvasHeight: number): void {
  const startX = randomFloat(rand, 0, canvasWidth);
  const startY = randomFloat(rand, 0, canvasHeight);
  const controlPoint1X = randomFloat(rand, 0, canvasWidth);
  const controlPoint1Y = randomFloat(rand, 0, canvasHeight);
  const controlPoint2X = randomFloat(rand, 0, canvasWidth);
  const controlPoint2Y = randomFloat(rand, 0, canvasHeight);
  const endX = randomFloat(rand, 0, canvasWidth);
  const endY = randomFloat(rand, 0, canvasHeight);
  const lineWidth = randomFloat(rand, 1, 10);

  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(controlPoint1X, controlPoint1Y, controlPoint2X, controlPoint2Y, endX, endY);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

// Draw a quadratic curve (single control point).
function drawQuadraticCurve(context: CanvasRenderingContext2D, rand: RandomFn, canvasWidth: number, canvasHeight: number): void {
  const startX = randomFloat(rand, 0, canvasWidth);
  const startY = randomFloat(rand, 0, canvasHeight);
  const controlPointX = randomFloat(rand, 0, canvasWidth);
  const controlPointY = randomFloat(rand, 0, canvasHeight);
  const endX = randomFloat(rand, 0, canvasWidth);
  const endY = randomFloat(rand, 0, canvasHeight);
  const lineWidth = randomFloat(rand, 1, 10);

  context.beginPath();
  context.moveTo(startX, startY);
  context.quadraticCurveTo(controlPointX, controlPointY, endX, endY);
  context.lineWidth = lineWidth;
  context.stroke();
  context.closePath();
}

type DrawFn = (context: CanvasRenderingContext2D, rand: RandomFn, w: number, h: number) => void;

const PRIMITIVE_DRAW_FUNCTIONS: Record<PrimitiveType, DrawFn> = {
  arc: drawArc,
  strokeText: drawStrokeText,
  bezier: drawBezierCurve,
  quadratic: drawQuadraticCurve
};

// --- Styling: gradient + shadow ---
// Applies random radial gradient and shadow before each primitive draw.
// These operations introduce additional cross-platform rendering entropy.

function applyRandomStyle(context: CanvasRenderingContext2D, rand: RandomFn, canvasWidth: number, canvasHeight: number): void {
  const gradientStartX = randomFloat(rand, 0, canvasWidth);
  const gradientStartY = randomFloat(rand, 0, canvasHeight);
  const gradientStartRadius = randomFloat(rand, 0, Math.min(canvasWidth, canvasHeight) / 4);
  const gradientEndX = randomFloat(rand, 0, canvasWidth);
  const gradientEndY = randomFloat(rand, 0, canvasHeight);
  const gradientEndRadius = randomFloat(rand, gradientStartRadius, Math.min(canvasWidth, canvasHeight) / 2);

  const gradient = context.createRadialGradient(
    gradientStartX, gradientStartY, gradientStartRadius,
    gradientEndX, gradientEndY, gradientEndRadius
  );
  gradient.addColorStop(0, randomColor(rand));
  gradient.addColorStop(1, randomColor(rand));
  context.strokeStyle = gradient;

  context.shadowBlur = randomFloat(rand, 0, 20);
  context.shadowColor = randomColor(rand);
  context.shadowOffsetX = randomFloat(rand, -10, 10);
  context.shadowOffsetY = randomFloat(rand, -10, 10);
}

// --- Canvas pixel hashing (FNV-1a 32-bit) ---
// Fast, good avalanche (single pixel difference flips ~50% of bits),
// compact 8-hex-char digest.

function hashCanvasPixels(context: CanvasRenderingContext2D, width: number, height: number): string {
  const imageData = context.getImageData(0, 0, width, height);
  const pixelData = imageData.data;

  let hashValue = FNV_OFFSET_BASIS;
  for (let pixelIndex = 0; pixelIndex < pixelData.length; pixelIndex++) {
    hashValue ^= pixelData[pixelIndex];
    hashValue = Math.imul(hashValue, FNV_PRIME);
  }

  return (hashValue >>> 0).toString(16).padStart(8, "0");
}

// Combine two hash strings by XOR-rotating and Murmur-mixing.
// Chains round hashes so the final response depends on every intermediate canvas state.
function combineHashes(previousHash: string, currentHash: string): string {
  const previousValue = parseInt(previousHash, 16) >>> 0;
  const currentValue = parseInt(currentHash, 16) >>> 0;

  let combined = (previousValue ^ ((currentValue << 13) | (currentValue >>> 19))) >>> 0;
  combined = Math.imul(combined, MURMUR_MIX_CONSTANT) >>> 0;
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

/**
 * @param seed - Server-provided random seed for deterministic drawing
 * @param rounds - Number of drawing rounds (controls computation cost)
 * @param canvasSize - Canvas dimension in pixels (canvasSize x canvasSize)
 * @param existingCanvas - Optional canvas to draw on visibly. If null/omitted, uses an OffscreenCanvas.
 * @returns 8-character hex fingerprint response
 */
export function canvasHash(seed: number, rounds: number, canvasSize: number, existingCanvas?: HTMLCanvasElement): string {
  const rand = createSeededRandom(seed);

  // Use the provided canvas for visible rendering, otherwise use an OffscreenCanvas
  // which never attaches to the DOM and avoids layout/reflow overhead.
  const canvas: HTMLCanvasElement | OffscreenCanvas = existingCanvas || new OffscreenCanvas(canvasSize, canvasSize);
  if (existingCanvas) {
    canvas.width = canvasSize;
    canvas.height = canvasSize;
  }
  const context = canvas.getContext("2d")! as CanvasRenderingContext2D;

  let response = "00000000";

  for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
    const primitiveType = selectRandomPrimitive(rand);
    applyRandomStyle(context, rand, canvasSize, canvasSize);
    PRIMITIVE_DRAW_FUNCTIONS[primitiveType](context, rand, canvasSize, canvasSize);

    const roundHash = hashCanvasPixels(context, canvasSize, canvasSize);
    response = combineHashes(response, roundHash);
  }

  return response;
}

/**
 * Solve a challenge. Runs canvasHash and returns the result with client metadata.
 */
export function solve(challenge: Challenge, existingCanvas?: HTMLCanvasElement): Solution {
  const startTime = performance.now();
  const response = canvasHash(challenge.seed, challenge.rounds, challenge.canvasSize, existingCanvas);
  const elapsedMs = performance.now() - startTime;

  return {
    seed: challenge.seed,
    rounds: challenge.rounds,
    canvasSize: challenge.canvasSize,
    response,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    elapsed: Math.round(elapsedMs),
    timestamp: Date.now()
  };
}
