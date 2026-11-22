// Optical shader adapted from moonhotline/retro-hotline, frontend/home/MistAtmosphere.tsx at 445c9c4378.
const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform vec2 u_res;
uniform float u_time;
const vec2 u_pointer = vec2(0.0);
uniform float u_beat;
uniform float u_dispersion;
uniform float u_intensity;
uniform float u_reveal;
uniform float u_surge;
uniform float u_atmosphere;
uniform float u_orbit;
uniform float u_temperature;
const float u_spin = 0.0;

const float PI = 3.14159265359;

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

// Curated luxury iridescent spectrum: ruby rose -> warm gold -> pearl emerald -> electric ice cyan -> cobalt -> amethyst
vec3 luxurySpectrum(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(1.00, 0.16, 0.48);
  vec3 c1 = vec3(1.00, 0.66, 0.22);
  vec3 c2 = vec3(0.24, 0.98, 0.78);
  vec3 c3 = vec3(0.10, 0.86, 1.00);
  vec3 c4 = vec3(0.36, 0.48, 1.00);
  vec3 c5 = vec3(0.82, 0.28, 1.00);

  float x = t * 5.0;
  if (x < 1.0) return mix(c0, c1, smoothstep(0.0, 1.0, x));
  if (x < 2.0) return mix(c1, c2, smoothstep(0.0, 1.0, x - 1.0));
  if (x < 3.0) return mix(c2, c3, smoothstep(0.0, 1.0, x - 2.0));
  if (x < 4.0) return mix(c3, c4, smoothstep(0.0, 1.0, x - 3.0));
  return mix(c4, c5, smoothstep(0.0, 1.0, x - 4.0));
}

// 2D Equilateral Triangle SDF (always preserves iconic jewel-like prism silhouette)
float sdEquilateralTriangle(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
  float t = u_time;

  float narrow = smoothstep(1.15, 0.72, aspect);
  // Floating prism anchored cleanly in right-center golden focal zone
  vec2 bob = vec2(sin(t * 0.65) * 0.012, sin(t * 1.05) * 0.022);
  vec2 prismPos = mix(vec2(0.22 * aspect, -0.01), vec2(0.008, 0.13), narrow) + bob + u_pointer * vec2(0.032, -0.024);
  float prismScale = mix(0.245, 0.158, narrow) * (0.86 + 0.14 * u_reveal) * (1.0 + u_atmosphere * 0.028);

  // Subtle rhythmic luxury breath synced to music tempo + GSAP hover surge
  float beatPhase = u_beat * 2.0 * PI;
  float pulse = 0.92 + 0.08 * sin(beatPhase) + u_surge * 0.45;

  // 1. Deep Obsidian Sapphire Night Sky with slowly drifting ambient aurora mist
  vec3 col = mix(vec3(0.012, 0.018, 0.042), vec3(0.022, 0.034, 0.072), smoothstep(0.6, -0.55, uv.y));
  vec2 driftA = vec2(sin(t * 0.42) * 0.10, cos(t * 0.34) * 0.07);
  vec2 driftB = vec2(cos(t * 0.36) * 0.12, sin(t * 0.48) * 0.08);
  col += vec3(0.03, 0.14, 0.28) * exp(-length((uv - prismPos + driftA) * vec2(0.8, 1.15)) * 2.2) * (0.85 + u_surge * 0.35 + u_atmosphere * 0.18);
  col += vec3(0.20, 0.05, 0.28) * exp(-length(uv - prismPos - vec2(0.32, 0.08) + driftB) * 2.0) * (0.58 + u_surge * 0.35 + u_atmosphere * 0.26);

  vec2 p2 = uv - prismPos;

  // Gentle 3D-like faceted tilt (keeps the iconic crystal triangle razor-sharp, never turning sideways)
  float tilt = sin(t * 0.55) * 0.055 + u_pointer.x * 0.06 + u_spin * 0.08 + u_orbit * 0.1;
  vec2 pt = rot2(tilt) * p2;
  // Back-depth offset creates true 3D crystal thickness / chamfered rear edge
  vec2 depthOff = vec2(0.042 + sin(t * 0.72) * 0.014 + u_pointer.x * 0.024, 0.022 + cos(t * 0.62) * 0.010 - u_pointer.y * 0.016) * (prismScale / 0.245);

  float dFront = sdEquilateralTriangle(pt, prismScale);
  float dBack  = sdEquilateralTriangle(pt - depthOff, prismScale * 0.96);

  // Entry point on left slope & exit point on right slope
  vec2 entryPt = rot2(-tilt) * vec2(-prismScale * 0.48, -prismScale * 0.06);
  vec2 exitPt  = rot2(-tilt) * vec2( prismScale * 0.48, -prismScale * 0.03);

  // 2. Focused Pearlescent Incident Laser Beam with fast traveling light packets
  vec2 beamStart = vec2(-0.98 * aspect, -0.22);
  float dBeam = sdSegment(p2, beamStart, entryPt);
  float beamProg = smoothstep(-0.80 * aspect, entryPt.x, p2.x);
  float revealClip = smoothstep(beamProg - 0.10, beamProg + 0.02, u_reveal * 1.18);
  float beamWave = (fbm(vec2(p2.x * 4.5 - t * 1.45, p2.y * 9.0)) - 0.5) * 0.014 * (1.0 - beamProg * 0.65);
  float dBW = abs(dBeam + beamWave);

  float packet1 = exp(-pow(fract(beamProg * 1.25 - t * 0.78) - 0.5, 2.0) * 32.0);
  float packet2 = exp(-pow(fract(beamProg * 2.10 - t * 1.22 + 0.35) - 0.5, 2.0) * 44.0);
  float incCore = exp(-dBW * 135.0) * (0.30 + 0.70 * beamProg) * (1.0 + packet1 * 1.15 + packet2 * 0.65);
  float incGlow = exp(-dBW * 20.0) * (0.14 + 0.56 * beamProg) * (1.0 + packet1 * 0.65);
  float incMist = exp(-dBW * 5.8) * (0.05 + 0.22 * beamProg);

  vec3 incColor = mix(vec3(0.45, 0.88, 1.0), vec3(0.98, 0.99, 1.0), clamp(incCore, 0.0, 1.0));
  float leftFade = smoothstep(-0.66 * aspect, -0.06 * aspect, uv.x);
  col += incColor * (incCore * 1.35 + incGlow * 0.48 + incMist * 0.20) * mix(0.32, 1.0, leftFade) * revealClip * pulse;

  // 3. Flowing Liquid Volumetric Spectral Dispersion Fan (流光溢彩)
  vec2 dExit = p2 - exitPt;
  float rExit = length(dExit);
  float fanReveal = smoothstep(rExit * 0.82, rExit * 0.82 + 0.22, u_reveal * 1.38);
  float fanMask = smoothstep(-0.03, 0.08, dExit.x) * fanReveal;

  if (fanMask > 0.001) {
    float baseAngle = atan(dExit.y, max(dExit.x, 0.001));
    // Alive silk-aurora curvature sweeping smoothly outward
    float silkCurve = sin(rExit * 3.9 - t * 1.65) * 0.095 * smoothstep(0.0, 0.45, rExit)
                    + cos(rExit * 2.2 - t * 1.05) * 0.048 * rExit
                    + u_pointer.y * 0.16 * rExit;
    float adjAngle = baseAngle - silkCurve;

    float halfSpread = (0.14 + smoothstep(0.0, 0.88, rExit) * 0.44) * mix(0.90, 1.13, u_dispersion);
    float specCoord = (adjAngle / max(halfSpread, 0.001)) * 0.5 + 0.5;
    float inFan = smoothstep(-0.16, 0.10, specCoord) * smoothstep(1.16, 0.90, specCoord);

    // Multi-octave fluid silk domain warp flowing rapidly outward
    vec2 flowUv = vec2(rExit * 2.7 - t * 1.15, specCoord * 4.6);
    float warp = fbm(flowUv + vec2(0.0, t * 0.42));
    float silkField = fbm(flowUv * vec2(1.5, 2.5) + vec2(warp * 1.5 - t * 0.72, warp * 1.2));
    float filaments = pow(0.5 + 0.5 * sin((specCoord * 18.0 + warp * 4.5 - t * 1.85) * PI * 0.5), 3.4);
    float causticRipples = pow(clamp(silkField, 0.0, 1.0), 1.75);

    // Dual traveling luminous light waves racing through the rainbow silk
    float waveA = exp(-pow(fract(rExit * 0.78 - t * 0.68) - 0.5, 2.0) * 20.0);
    float waveB = exp(-pow(fract(rExit * 1.35 - t * 1.08 + specCoord * 0.3) - 0.5, 2.0) * 30.0);
    float surgeWave = 1.0 + waveA * 0.65 + waveB * 0.42 + u_surge * 0.62;

    float waveT = clamp(specCoord + (warp - 0.5) * 0.24 + sin(t * 0.75 - rExit * 2.0) * 0.06, 0.0, 1.0);
    vec3 specCol = luxurySpectrum(waveT);
    vec3 specShift = luxurySpectrum(clamp(waveT + 0.14, 0.0, 1.0));
    vec3 richSpec = mix(specCol, specShift, silkField * 0.6);

    float distFade = exp(-rExit * 0.72) * (0.50 + 0.50 * smoothstep(0.0, 0.10, rExit));
    float velvetBody = inFan * (0.38 + 0.62 * causticRipples) * distFade;
    float silkThreads = inFan * filaments * (0.45 + 0.55 * silkField) * exp(-rExit * 0.44);
    float auroraCore = exp(-pow((specCoord - 0.5) * 2.4, 2.0)) * inFan * exp(-rExit * 0.52);

    col += richSpec * velvetBody * 1.30 * fanMask * surgeWave * pulse;
    col += mix(richSpec, vec3(0.98, 0.99, 1.0), 0.52) * silkThreads * 0.96 * fanMask * surgeWave;
    col += (richSpec * 0.62 + vec3(0.25, 0.72, 1.0) * 0.26) * auroraCore * 0.50 * fanMask;
  }

  // 4. Crystal-Clear Obsidian Triangular Glass Prism (Dark transparent interior + razor-sharp iridescent edges)
  float outerHalo = exp(-max(dFront, 0.0) * 32.0);
  col += luxurySpectrum(fract(0.55 + pt.y * 1.6 + t * 0.18)) * outerHalo * (0.36 + u_surge * 0.28) * u_reveal * pulse;

  // Rear 3D chamfered crystal facet edge (gives true jewel depth)
  float backEdge = exp(-abs(dBack) * 145.0) * smoothstep(-0.02, 0.005, dFront);
  col += mix(vec3(0.45, 0.85, 1.0), vec3(0.85, 0.48, 1.0), 0.5 + 0.5 * sin(pt.y * 7.0 + t * 1.2)) * backEdge * 0.62 * u_reveal;

  // Connecting 3D crystal corner bevel ridges (top, bottom-left, bottom-right vertices)
  vec2 vTop = vec2(0.0, prismScale * 1.1547);
  vec2 vBL  = vec2(-prismScale, -prismScale * 0.57735);
  vec2 vBR  = vec2( prismScale, -prismScale * 0.57735);
  float ridgeA = exp(-sdSegment(pt, vTop, vTop * 0.96 + depthOff) * 165.0);
  float ridgeB = exp(-sdSegment(pt, vBL,  vBL  * 0.96 + depthOff) * 165.0);
  float ridgeC = exp(-sdSegment(pt, vBR,  vBR  * 0.96 + depthOff) * 165.0);
  col += vec3(0.75, 0.94, 1.0) * (ridgeA + ridgeB + ridgeC) * 0.55 * u_reveal;

  if (dFront < 0.0) {
    // Transparent dark obsidian sapphire glass interior (never opaque grey!)
    float innerDepth = clamp(-dFront / (prismScale * 0.55), 0.0, 1.0);
    float fresnelRim = pow(1.0 - innerDepth, 3.2);

    // Internal refracted rainbow dispersion fan visibly bending from entry to exit inside the glass!
    vec2 pIn = p2 - entryPt;
    vec2 beamAxis = normalize(exitPt - entryPt);
    vec2 beamPerp = vec2(-beamAxis.y, beamAxis.x);
    float along = dot(pIn, beamAxis) / max(length(exitPt - entryPt), 0.001);
    float across = dot(pIn, beamPerp);
    float spreadIn = mix(0.016, 0.088, clamp(along, 0.0, 1.0));
    float internalBand = exp(-pow(across / spreadIn, 2.0)) * smoothstep(-0.08, 0.12, along) * smoothstep(1.12, 0.88, along);
    float internalWave = 0.8 + 0.4 * sin(along * 16.0 - t * 4.2);
    float specInT = clamp((across / (spreadIn * 1.6)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 internalDisp = mix(vec3(0.85, 0.96, 1.0), luxurySpectrum(specInT), smoothstep(0.15, 0.85, along));

    // Subtle internal crystal caustic shimmer
    float caustic = fbm(pt * 14.0 + vec2(t * 0.9, -t * 0.65));
    // Sweeping specular gleam racing diagonally across the glass surface
    float sweepPos = fract(t * 0.28) * 1.8 - 0.9;
    float sheenSweep = exp(-pow((pt.x * 0.8 + pt.y * 0.6 - sweepPos) * 11.0, 2.0)) * 0.42;

    // Preserve dark luxury translucency over background
    vec3 glassTint = mix(vec3(0.02, 0.06, 0.14), vec3(0.06, 0.15, 0.28), caustic * 0.75);
    vec3 glass = col * 0.52 + glassTint * 0.58;
    // Add luminous internal refraction beam
    glass += internalDisp * internalBand * internalWave * 1.35 * u_reveal * pulse;
    // Add iridescent Fresnel inner rim
    vec3 rimCol = luxurySpectrum(fract(0.58 + pt.y * 1.8 + pt.x * 1.2 + t * 0.22));
    glass += rimCol * fresnelRim * (0.72 + u_surge * 0.45);
    // Add diagonal crystal sheen sweep
    glass += vec3(0.85, 0.96, 1.0) * sheenSweep * (0.35 + fresnelRim * 0.85);
    // Internal facet fold line (gives jewel-cut 3D prism geometry)
    float facetFold = exp(-sdSegment(pt, vTop, vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0)
                    + exp(-sdSegment(pt, vBL,  vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0)
                    + exp(-sdSegment(pt, vBR,  vec2(0.02 * prismScale, -0.08 * prismScale)) * 130.0);
    glass += vec3(0.70, 0.94, 1.0) * facetFold * 0.28;

    col = glass;
  }

  // Razor-sharp liquid-silver & iridescent front prism bevel outline with traveling edge glint
  float frontEdge = exp(-abs(dFront) * 170.0);
  float edgeAngle = atan(pt.y, pt.x);
  float edgeGlint = pow(0.5 + 0.5 * sin(edgeAngle * 3.0 - t * 2.8), 5.0);
  vec3 edgeColor = mix(vec3(0.68, 0.94, 1.0), luxurySpectrum(fract(edgeAngle / (2.0 * PI) + t * 0.2)), 0.55);
  col += (edgeColor * 0.95 + vec3(1.0) * edgeGlint * 1.35) * frontEdge * u_reveal * pulse;

  // 5. Entry & Exit Focal Caustic Blooms + Sweeping Anamorphic Flare
  float dEntryGlow = length(p2 - entryPt);
  float dExitGlow  = length(p2 - exitPt);
  col += vec3(0.75, 0.96, 1.0) * exp(-dEntryGlow * 24.0) * 0.92 * u_reveal * pulse;
  col += vec3(1.0, 0.88, 0.97) * exp(-dExitGlow * 18.0) * 0.78 * u_reveal * pulse;
  float flareWidth = 3.0 - u_surge * 1.3;
  float anamorphic = exp(-abs(p2.y - exitPt.y) * 90.0) * exp(-abs(p2.x - exitPt.x) * max(flareWidth, 1.2));
  col += mix(vec3(0.55, 0.94, 1.0), vec3(1.0, 0.45, 0.86), smoothstep(-0.18, 0.32, p2.x)) * anamorphic * (0.58 + u_surge * 0.58) * u_reveal;

  // 6. Rising Spectrum-Lit Luminous Bokeh Dust (strictly positive brightness, zero dark specks)
  for (int layer = 0; layer < 2; layer++) {
    float scaleG = layer == 0 ? 9.5 : 16.5;
    vec2 drift = vec2(-t * (layer == 0 ? 0.16 : 0.25), -t * (layer == 0 ? 0.09 : 0.15));
    vec2 gUv = (uv + drift) * scaleG;
    vec2 id = floor(gUv);
    vec2 f = fract(gUv) - 0.5;
    float rnd = hash21(id + float(layer) * 41.3);
    if (rnd > 0.68) {
      vec2 offset = (vec2(hash21(id + 7.1), hash21(id + 19.3)) - 0.5) * 0.62;
      float dMote = length(f - offset);
      float twinkle = 0.35 + 0.65 * (0.5 + 0.5 * sin(t * (2.2 + rnd * 3.6) + rnd * 30.0));
      float size = layer == 0 ? 0.048 : 0.032;
      float mote = smoothstep(size, 0.0, dMote) * twinkle;
      float localSpec = clamp((uv.y - prismPos.y) * 1.15 + 0.5, 0.0, 1.0);
      vec3 moteCol = mix(vec3(0.75, 0.94, 1.0), luxurySpectrum(localSpec), smoothstep(-0.08, 0.38, p2.x));
      col += moteCol * mote * (layer == 0 ? 0.72 : 0.48) * u_reveal;
    }
  }

  // 7. Left-Side Typography Safe Zone + Cinematic Vignette + Subtle Film Grain
  float vignette = smoothstep(1.45, 0.24, length(uv * vec2(0.72, 0.95)));
  col *= mix(0.66, 1.0, vignette);
  float safeVeil = smoothstep(0.02 * aspect, -0.46 * aspect, uv.x);
  col = mix(col, col * 0.50 + vec3(0.010, 0.018, 0.038), safeVeil * 0.66);

  vec3 tint = u_temperature > 0.0 ? vec3(1.18, 1.03, 0.91) : vec3(0.89, 1.07, 1.19);
  col *= u_intensity * mix(vec3(1.0), tint, abs(u_temperature));
  col = acesFilm(col * 1.14);

  float grain = (hash21(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * 0.012;
  col = max(col + grain, 0.0);

  gl_FragColor = vec4(col, 1.0);
}
`

type OpticalCue = { beat: number; preset: "mist" | "dispersion"; transitionBeats?: number };
type Piece = { bpm: number; cues: readonly OpticalCue[]; look?: "warm" | "cool" };
type Scene = { time: number; beat: number; dispersion: number; surge: number; atmosphere?: number; orbit?: number; temperature?: number };

export function prismFrame(seconds: number, bpm: number, cues: readonly OpticalCue[], reducedMotion = false): Scene {
  const beat = Math.max(0, seconds) * bpm / 60;
  let current: OpticalCue | undefined;
  let previous: OpticalCue | undefined;
  for (const cue of cues) {
    if (cue.beat > beat + 1e-8) break;
    previous = current;
    current = cue;
  }
  const target = Number(current?.preset === "dispersion");
  const from = Number(previous?.preset === "dispersion");
  const phase = current ? Math.min(1, Math.max(0, (beat - current.beat) / 0.72)) : 1;
  const eased = reducedMotion ? 1 : 1 - (1 - phase) ** 3;
  const accent = current?.preset === "dispersion" && !reducedMotion
    ? eased * Math.exp(-Math.max(0, beat - current.beat) / 0.95) * 0.52 : 0;
  return { time: reducedMotion ? 1.5 : 1.5 + seconds, beat: reducedMotion ? 0 : beat,
    dispersion: from + (target - from) * eased, surge: accent };
}

export function createPrismChoreography(animator: typeof import("gsap").gsap, piece: Piece) {
  const { bpm, cues, look } = piece;
  const temperature = look === "warm" ? 0.78 : look === "cool" ? -0.78 : 0;
  function optics(open: boolean) {
    return { dispersion: Number(open), atmosphere: open ? 0.92 : 0.06,
      orbit: open ? (temperature < 0 ? -0.83 : 0.67) : 0 };
  }

  const state = optics(cues[0]?.beat === 0 && cues[0]?.preset === "dispersion");
  const timeline = animator.timeline({ paused: true });
  cues.forEach((cue, index) => {
    if (cue.beat === 0) return;
    const available = (cues[index + 1]?.beat ?? Infinity) - cue.beat;
    timeline.to(state, { ...optics(cue.preset === "dispersion"),
      duration: Math.min(cue.transitionBeats ?? 0.72, available) * 60 / bpm, ease: "sine.inOut" }, cue.beat * 60 / bpm);
  });

  return {
    frame(seconds: number, reducedMotion = false): Scene {
      const base = prismFrame(seconds, bpm, cues, reducedMotion);
      if (reducedMotion) return { ...base, atmosphere: optics(base.dispersion === 1).atmosphere, temperature };
      timeline.seek(seconds);
      return { ...base, dispersion: state.dispersion, atmosphere: state.atmosphere, orbit: state.orbit, temperature };
    },
    kill() { timeline.kill(); },
  };
}

function compile(gl: WebGLRenderingContext, kind: number, text: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, text);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function connectPrism(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (program) {
    gl.attachShader(program, vertex!);
    gl.attachShader(program, fragment!);
    gl.linkProgram(program);
  }
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
  if (!program) return null;
  const buffer = gl.getProgramParameter(program, gl.LINK_STATUS) ? gl.createBuffer() : null;
  if (!buffer) {
    gl.deleteProgram(program);
    return null;
  }

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = (name: string) => gl.getUniformLocation(program, "u_" + name);
  const resolution = uniform("res");
  const time = uniform("time");
  const beat = uniform("beat");
  const dispersion = uniform("dispersion");
  const surge = uniform("surge");
  const reveal = uniform("reveal");
  const atmosphere = uniform("atmosphere");
  const orbit = uniform("orbit");
  const temperature = uniform("temperature");
  gl.uniform1f(uniform("intensity"), 1.06);

  return (scene: Scene, width: number, height: number) => {
    gl.viewport(0, 0, width, height);
    gl.uniform2f(resolution, width, height);
    gl.uniform1f(time, scene.time);
    gl.uniform1f(beat, scene.beat);
    gl.uniform1f(dispersion, scene.dispersion);
    gl.uniform1f(reveal, 0.95 + scene.dispersion * 0.05);
    gl.uniform1f(surge, scene.surge);
    gl.uniform1f(atmosphere, scene.atmosphere ?? 0);
    gl.uniform1f(orbit, scene.orbit ?? 0);
    gl.uniform1f(temperature, scene.temperature ?? 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

export function createPrism(canvas: HTMLCanvasElement) {
  let gl: WebGLRenderingContext | null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const context = gl;
  let draw = connectPrism(context);
  if (!draw) return null;
  let lastFrame: Scene | undefined;
  function render(scene: Scene) {
    lastFrame = scene;
    if (!draw || context.isContextLost()) return;
    draw(scene, canvas.width, canvas.height);
    canvas.dataset.ready = "true";
  }
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    delete canvas.dataset.ready;
    draw = null;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    draw = connectPrism(context);
    if (lastFrame) render(lastFrame);
  });
  return render;
}
