export const vertexShader = `
    void main() {
        gl_Position = vec4(position, 1.0);
    }
`;

export const fragmentShader = `
    precision highp float;

    uniform float time;
    uniform vec2 resolution;
    uniform float cameraDistance;
    uniform float cameraAngle;
    uniform float cameraPhi;
    uniform float diskInner;
    uniform float diskOuter;
    uniform float spin;
    uniform sampler2D starfield;

    const float PI = 3.14159265359;
    const float STAR_GAIN = 1.18;

    float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise21(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
        float value = 0.0;
        value += 0.5 * noise21(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        value += 0.25 * noise21(p);
        p = p * 2.01 + vec2(11.4, 3.7);
        value += 0.125 * noise21(p);
        p = p * 2.02 + vec2(7.3, 15.8);
        value += 0.0625 * noise21(p);
        return value / 0.9375;
    }

    float gaussianBand(float value, float center, float width) {
        return exp(-pow((value - center) / max(width, 1e-4), 2.0));
    }

    float ribbonNoise(float x, float seed) {
        float drift = fbm(vec2(x * 2.2 + seed * 1.6, seed * 0.41));
        float ribbon = 0.5 + 0.5 * sin(x * 18.0 + drift * 4.0 + seed * 5.7);
        float thread = 0.5 + 0.5 * sin(x * 41.0 - drift * 4.8 + seed * 2.6);
        float composite = ribbon * 0.72 + thread * 0.28;
        return mix(0.8, 1.12, smoothstep(0.2, 0.88, composite));
    }

    vec3 sampleStars(vec3 dir) {
        float phi = atan(dir.y, dir.x);
        float theta = acos(clamp(dir.z, -1.0, 1.0));
        vec2 uv = vec2(phi / (2.0 * PI) + 0.5, theta / PI);
        uv.x = fract(uv.x);
        vec3 col = texture2D(starfield, uv).rgb;
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        float starMask = smoothstep(0.04, 0.16, luma);
        float haze = smoothstep(0.008, 0.04, luma) * 0.15;
        vec3 stars = col * starMask;
        vec3 band = col * haze;
        vec3 outCol = stars + band;
        outCol = pow(outCol, vec3(0.84));
        return outCol * STAR_GAIN;
    }

    vec3 diskPalette(float radial, float beam, float heat) {
        vec3 ember = vec3(0.22, 0.08, 0.025);
        vec3 rust = vec3(0.58, 0.23, 0.08);
        vec3 whiteHot = vec3(1.0, 0.985, 0.965);
        vec3 col = mix(rust, ember, smoothstep(0.28, 1.0, radial));
        col = mix(col, whiteHot, clamp(heat, 0.0, 1.0));
        col *= mix(0.72, 1.9, beam);
        return col;
    }

    void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

        float theta = radians(cameraAngle);
        float phi = radians(cameraPhi);
        vec3 camPos = vec3(
            cameraDistance * sin(theta) * cos(phi),
            cameraDistance * sin(theta) * sin(phi),
            cameraDistance * cos(theta)
        );

        vec3 forward = normalize(-camPos);
        vec3 worldUp = vec3(0.0, 0.0, 1.0);
        vec3 right = normalize(cross(forward, worldUp));
        if (length(right) < 0.001) {
            right = vec3(1.0, 0.0, 0.0);
        }
        vec3 up = cross(right, forward);
        vec3 rd = normalize(forward + uv.x * right * 0.82 + uv.y * up * 0.82);

        vec3 finalColor = sampleStars(rd) * 0.88;

        float distanceNorm = clamp((cameraDistance - 8.0) / 24.0, 0.0, 1.0);
        // Keep vertical orbit tied to viewpoint geometry instead of re-lighting the disk.
        float presentationAngleNorm = clamp((82.0 - 20.0) / 70.0, 0.0, 1.0);
        float spinNorm = clamp(spin, 0.0, 1.0);

        float orbitRad = radians(cameraPhi);
        float orbitSwing = sin(orbitRad);
        float orbitDepth = cos(orbitRad);

        float shadowRadius = mix(0.21, 0.14, distanceNorm);
        float frontThickness = mix(0.020, 0.0062, pow(presentationAngleNorm, 1.3));
        float outerReach = mix(0.86, 1.26, clamp((diskOuter - 8.0) / 17.0, 0.0, 1.0));
        float innerTightness = clamp((diskInner - 2.4) / 4.8, 0.0, 1.0);
        vec2 compositionUv = uv;
        compositionUv.x += orbitSwing * 0.018;
        compositionUv.y += orbitDepth * 0.008 - 0.008;
        float r = length(compositionUv);
        float tilt = -0.22 + orbitSwing * 0.24;
        float ct = cos(tilt);
        float st = sin(tilt);
        vec2 diskUv = mat2(ct, -st, st, ct) * compositionUv;
        // For a thin disk, the projected minor axis shrinks roughly with cos(inclination).
        // A full projection correction is too aggressive for this stylized shader, so we
        // apply a tempered version that preserves plausible geometry without blowing up the frame.
        float baselineMinorAxis = max(abs(cos(radians(82.0))), 0.08);
        float projectedMinorAxis = max(abs(cos(theta)), 0.08);
        float fullProjectionScale = baselineMinorAxis / projectedMinorAxis;
        float temperedProjectionScale = mix(1.0, sqrt(fullProjectionScale), 0.5);
        diskUv.y *= clamp(temperedProjectionScale, 0.68, 1.08);
        diskUv.y += orbitSwing * compositionUv.x * 0.12;
        float diskX = diskUv.x;
        float diskY = diskUv.y;
        float xAbs = abs(diskX);

        float beamCenter = orbitSwing * shadowRadius * 0.28;
        float beam = 0.5 + 0.5 * tanh(((diskX + beamCenter) / max(shadowRadius, 1e-3)) * (1.2 + spinNorm * 4.6));
        float radial = clamp(xAbs / max(outerReach, 1e-3), 0.0, 1.0);
        float diskAngle = atan(diskY / max(frontThickness * 5.5, 0.012), diskX);
        float orbitalRate = mix(0.38, 1.58, spinNorm);
        float keplerShear = time * orbitalRate * mix(1.0, 4.6, pow(1.0 - radial, 1.7));
        float flowAngle = diskAngle - keplerShear;
        float flowX = diskX * (1.0 + radial * 0.38) - keplerShear * (0.038 + 0.12 * (1.0 - radial));
        float flowY = diskY + sin(flowAngle * 2.0 + radial * 7.2) * frontThickness * 0.42 * (1.0 - radial);
        float orbitTexture = fbm(vec2(flowAngle * 1.7 + radial * 4.8, radial * 8.0 - time * orbitalRate * 0.35));
        float hotKnots = smoothstep(
            0.68,
            0.98,
            0.5 + 0.5 * sin(flowAngle * 5.0 + radial * 14.0 + orbitTexture * 4.0)
        );
        float innerBias = 1.0 - smoothstep(0.32, 1.0, radial);
        float flowStrands = 0.78 + 0.32 * ribbonNoise(flowAngle * 1.8 + radial * 3.2, 4.2);
        float flowBoost = 0.84 + 0.46 * hotKnots * innerBias;

        float haloRadius = shadowRadius + mix(0.034, 0.062, 1.0 - distanceNorm);
        float haloWidth = frontThickness * mix(3.4, 4.9, presentationAngleNorm);
        float polar = abs(diskY) / max(r, 1e-4);
        float polarBias = smoothstep(0.12, 0.94, polar);
        float upperSide = smoothstep(-0.06, 0.84, diskY);
        float lowerSide = smoothstep(-0.04, 0.72, -diskY);
        float haloCore = gaussianBand(r, haloRadius, haloWidth * 0.52);
        float haloOuter = gaussianBand(r, haloRadius + haloWidth * 0.48, haloWidth * 1.1);
        float haloInner = gaussianBand(r, haloRadius - haloWidth * 0.32, haloWidth * 0.55);
        float haloSwirl = ribbonNoise(flowAngle * 1.3 + r * 5.4 + orbitTexture * 0.45, 1.5);

        float upperHalo = (haloCore * 1.08 + haloOuter * 0.82 + haloInner * 0.28) * polarBias * upperSide * haloSwirl;
        float lowerHalo = (haloCore * 0.54 + haloOuter * 0.26) * polarBias * lowerSide * (0.9 + 0.1 * haloSwirl);
        float ringHalo = (haloCore * 0.22 + haloOuter * 0.14 + haloInner * 0.08) * (0.82 + 0.18 * haloSwirl);
        upperHalo *= mix(0.86, 1.12, 0.5 + 0.5 * orbitSwing);
        lowerHalo *= mix(1.06, 0.88, 0.5 + 0.5 * orbitSwing);

        float topLift = shadowRadius * (0.24 + 0.98 * exp(-pow((diskX - orbitSwing * shadowRadius * 0.34) / (shadowRadius * 1.18), 2.0)));
        float topWidth = frontThickness * mix(1.9, 2.8, presentationAngleNorm);
        float topBand = gaussianBand(diskY, topLift, topWidth * 0.66);
        float topMist = gaussianBand(diskY, topLift + topWidth * 0.54, topWidth * 1.48) * 0.52;
        float topDetail = ribbonNoise(flowX * 1.4 + flowAngle * 0.72, 0.7);
        float topFibers = 0.88 + 0.12 * sin(flowX * 28.0 + fbm(vec2(flowX * 3.1 + 6.0, flowY * 10.0 + 2.0)) * 4.6);
        float topCuts = 0.86 + 0.14 * smoothstep(0.18, 0.92, fbm(vec2(flowX * 6.2 + 17.0, flowY * 32.0 + orbitTexture * 2.0)));
        float topAsymmetry = mix(0.9, 1.08, smoothstep(-0.18, 0.55, diskX));
        float topLens = (topBand + topMist) * topDetail * topFibers * topCuts * topAsymmetry * flowStrands * flowBoost;

        float bottomLift = shadowRadius * (0.42 + 0.30 * exp(-pow((diskX + orbitSwing * shadowRadius * 0.18) / (shadowRadius * 1.34), 2.0)));
        float bottomWidth = frontThickness * mix(2.2, 3.4, presentationAngleNorm);
        float bottomBand = gaussianBand(diskY, -bottomLift, bottomWidth * 0.9);
        float bottomMist = gaussianBand(diskY, -bottomLift - bottomWidth * 0.34, bottomWidth * 1.45) * 0.34;
        float bottomLens = (bottomBand + bottomMist) * (0.84 + 0.22 * ribbonNoise(flowX * 1.05 + flowAngle * 0.42 + 2.6, 2.3));

        float lensGate = smoothstep(shadowRadius * mix(1.0, 1.07, innerTightness), shadowRadius * 1.14, r);
        float farEdgeFade = 1.0 - smoothstep(outerReach * 0.92, outerReach + 0.16, xAbs);

        vec3 haloColor = mix(vec3(0.62, 0.60, 0.60), vec3(0.97, 0.96, 0.95), 0.62);
        vec3 topColor = mix(diskPalette(radial, beam, 0.74), vec3(0.95, 0.93, 0.90), 0.30 + 0.22 * beam);
        topColor *= mix(0.68, 0.98, smoothstep(-0.12, 0.68, diskY));

        vec3 bottomColor = mix(diskPalette(radial, beam, 0.52), vec3(0.82, 0.78, 0.75), 0.34);
        bottomColor *= 0.56;

        vec3 emberColor = mix(vec3(0.88, 0.50, 0.22), vec3(0.42, 0.16, 0.07), radial);
        float emberWing = gaussianBand(diskY, topLift - topWidth * 0.9, topWidth * 1.9);
        emberWing *= (1.0 - beam) * 0.18 * farEdgeFade * lensGate * flowBoost;

        finalColor += haloColor * upperHalo * 0.48;
        finalColor += haloColor * lowerHalo * 0.22;
        finalColor += haloColor * ringHalo * 0.22;
        finalColor += topColor * topLens * farEdgeFade * lensGate;
        finalColor += bottomColor * bottomLens * farEdgeFade * lensGate;
        finalColor += emberColor * emberWing;

        float coreMask = 1.0 - smoothstep(shadowRadius, shadowRadius + 0.008, r);
        finalColor *= 1.0 - coreMask;

        float photonRing = gaussianBand(r, shadowRadius + 0.006, 0.0025);
        photonRing *= smoothstep(shadowRadius + 0.002, shadowRadius + 0.006, r);
        float ringVerticalBias = smoothstep(0.18, 0.92, abs(diskY) / max(r, 1e-4));
        float ringEquatorCut = 1.0 - gaussianBand(diskY, 0.0, frontThickness * 1.9) * 0.92;
        finalColor += vec3(0.96, 0.96, 0.98) * photonRing * 0.10 * ringVerticalBias * ringEquatorCut;

        float frontShimmer = 0.74 + 0.28 * ribbonNoise(flowAngle * 2.2 + flowX * 1.5, 1.7);
        float frontGlow = gaussianBand(diskY, 0.0, frontThickness * 2.8);
        float frontBody = gaussianBand(diskY, 0.0, frontThickness * 1.28);
        float frontLane = gaussianBand(diskY, 0.0, frontThickness * 0.52);
        float frontRim = gaussianBand(diskY, -frontThickness * 0.16, frontThickness * 0.22);
        float dustBands = 0.72 + 0.30 * sin(flowX * 34.0 + flowAngle * 2.8 + fbm(vec2(flowX * 2.8, flowY * 22.0 + 5.0)) * 4.2);
        float dustSmear = 0.76 + 0.24 * fbm(vec2(flowX * 3.4 + 11.0, flowY * 40.0 + orbitTexture * 3.0));
        float dustRipples = 0.80 + 0.20 * sin(flowX * 61.0 + flowAngle * 5.5 + fbm(vec2(flowX * 4.8 + 2.0, flowY * 54.0 + 9.0)) * 5.6);
        float laneTurbulence = 0.74 + 0.26 * fbm(vec2(flowX * 5.2 + flowAngle, flowY * 68.0 + 14.0));
        frontGlow *= 1.0 - smoothstep(outerReach * 0.94, outerReach + 0.18, xAbs);
        frontBody *= 1.0 - smoothstep(outerReach * 0.97, outerReach + 0.12, xAbs);
        frontLane *= 1.0 - smoothstep(outerReach, outerReach + 0.08, xAbs);
        frontRim *= 1.0 - smoothstep(outerReach * 0.98, outerReach + 0.06, xAbs);
        frontGlow *= (0.2 + 0.34 * beam) * frontShimmer * (0.86 + 0.14 * flowBoost);
        frontBody *= (0.34 + 0.46 * beam) * dustBands * dustSmear * dustRipples * flowBoost;
        frontLane *= (0.42 + 0.18 * (1.0 - beam)) * laneTurbulence;
        frontRim *= 0.18 + 0.42 * pow(beam, 1.4);

        vec3 frontGlowColor = mix(vec3(0.58, 0.54, 0.52), vec3(0.90, 0.87, 0.83), 0.28 + 0.24 * beam);
        vec3 frontBodyColor = mix(vec3(0.25, 0.21, 0.20), vec3(0.66, 0.57, 0.49), 0.28 + 0.24 * beam);
        vec3 frontDustColor = vec3(0.09, 0.07, 0.06);
        vec3 frontRimColor = vec3(1.0, 0.98, 0.95) * (0.6 + 0.4 * beam);

        finalColor += frontGlowColor * frontGlow * 0.32;
        finalColor = mix(finalColor, frontBodyColor, clamp(frontBody * 0.72, 0.0, 0.72));
        finalColor = mix(finalColor, frontDustColor, clamp(frontLane * 0.64, 0.0, 0.64));
        finalColor += frontRimColor * frontRim * 0.14;

        float brightness = dot(finalColor, vec3(0.299, 0.587, 0.114));
        if (brightness > 0.90) {
            float bloomAmount = (brightness - 0.90) * 0.08;
            finalColor += finalColor * bloomAmount;
        }

        float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
        finalColor = mix(vec3(gray), finalColor, 1.04);
        finalColor.r *= 1.01;
        finalColor.b *= 0.985;

        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        finalColor = clamp((finalColor * (a * finalColor + b)) / (finalColor * (c * finalColor + d) + e), 0.0, 1.0);
        finalColor = pow(finalColor, vec3(1.0 / 2.2));

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;
