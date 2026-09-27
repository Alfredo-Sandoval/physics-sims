// Units: the Schwarzschild radius is 1 (so M = 0.5), and spin is the
// dimensionless Kerr parameter chi = a / M. The disk lies in the z = 0 plane and
// rotates counterclockwise about +z, the same sense as the hole's spin.

export const vertexShader = `
    void main() {
        gl_Position = vec4(position, 1.0);
    }
`;

export const fragmentShader = `
    precision highp float;

    uniform float time;
    uniform vec2 resolution;
    uniform vec2 jitter;
    uniform float frameAspect;
    uniform float cameraDistance;
    uniform float cameraAngle;
    uniform float cameraPhi;
    uniform float diskInner;
    uniform float diskOuter;
    uniform float spin;
    uniform float realism;
    uniform float fieldOfView;
    uniform float diskTemperature;
    uniform sampler2D starfield;
    uniform sampler2D previousFrame;
    uniform float blendWeight;

    const float PI = 3.14159265359;
    const float TAU = 6.28318530718;
    const float MASS = 0.5;
    const int MAX_STEPS = 180;
    const float STEP_SCALE = 0.1;
    // Weak-field gravitomagnetic coupling for light, fitted against exact Kerr
    // equatorial photon orbits (within ~2% for spin <= 0.9). Forward in time the
    // coefficient is -4; rays here run backward from the camera, and the term is
    // odd in velocity, so the sign flips.
    const float FRAME_DRAG = 4.0;
    const float DISK_SPIN_RATE = 3.0;
    const float FLOW_PERIOD = 18.0;
    const float EXPOSURE = 1.7;
    // Face-on optical depth of the densest gas; the film's disk was
    // "marginally optically thick".
    const float DISK_OPACITY = 0.9;

    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    // Value noise that wraps every "period" cells in x, so the disk texture
    // has no seam where the azimuth jumps from +pi to -pi.
    float periodicNoise(vec2 p, float period) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float x0 = mod(i.x, period);
        float x1 = mod(i.x + 1.0, period);
        float a = hash12(vec2(x0, i.y));
        float b = hash12(vec2(x1, i.y));
        float c = hash12(vec2(x0, i.y + 1.0));
        float d = hash12(vec2(x1, i.y + 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float periodicFbm(vec2 p, float period) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 5; i++) {
            value += amplitude * periodicNoise(p, period);
            p = p * 2.0 + vec2(0.0, 17.3);
            period *= 2.0;
            amplitude *= 0.5;
        }
        return value / 0.96875;
    }

    vec3 sampleStars(vec3 dir) {
        float phi = atan(dir.y, dir.x);
        float theta = acos(clamp(dir.z, -1.0, 1.0));
        vec2 uv = vec2(fract(phi / TAU + 0.5), theta / PI);
        vec3 col = texture2D(starfield, uv).rgb;
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        float starMask = smoothstep(0.04, 0.16, luma);
        float haze = smoothstep(0.008, 0.04, luma) * 0.15;
        return pow(col * (starMask + haze), vec3(0.84)) * 1.05;
    }

    // Linear-light RGB chromaticity of a blackbody (Tanner Helland's fit).
    vec3 blackbody(float kelvin) {
        float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
        float r = t <= 66.0 ? 1.0 : 1.29293618606 * pow(t - 60.0, -0.1332047592);
        float g = t <= 66.0
            ? 0.39008157876 * log(t) - 0.63184144378
            : 1.12989086089 * pow(t - 60.0, -0.0755148492);
        float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : 0.54320678911 * log(t - 10.0) - 1.19625408914);
        return pow(clamp(vec3(r, g, b), 0.0, 1.0), vec3(2.2));
    }

    // Photon acceleration in Cartesian form. The first term traces exact
    // Schwarzschild null geodesics (Binet equation); the second adds frame
    // dragging from the hole's angular momentum J = chi M^2 z.
    vec3 photonAcceleration(vec3 p, vec3 v) {
        float r2 = dot(p, p);
        float r = sqrt(r2);
        vec3 h = cross(p, v);
        vec3 accel = -1.5 * dot(h, h) * p / (r2 * r2 * r);

        float angularMomentum = spin * MASS * MASS;
        vec3 n = p / r;
        vec3 gravitomagnetic = (3.0 * angularMomentum * n.z * n - vec3(0.0, 0.0, angularMomentum)) / (r2 * r);
        return accel + FRAME_DRAG * cross(v, gravitomagnetic);
    }

    // Kerr prograde circular orbit (Boyer-Lindquist): angular velocity.
    float orbitalOmega(float r) {
        float a = spin * MASS;
        return sqrt(MASS) / (pow(r, 1.5) + a * sqrt(MASS));
    }

    // Kerr prograde circular orbit: time component of the emitter 4-velocity.
    float orbitalLorentz(float r) {
        float a = spin * MASS;
        float r15 = pow(r, 1.5);
        float denom = r15 - 3.0 * MASS * sqrt(r) + 2.0 * a * sqrt(MASS);
        return (r15 + a * sqrt(MASS)) / (pow(r, 0.75) * sqrt(max(denom, 1e-3)));
    }

    // Disk texture in the co-rotating frame: long thin strands broken into
    // filaments, a dense core, and wisps that fray out raggedly toward the
    // outer radius. Two phase-offset layers crossfade so Keplerian shear
    // never winds the pattern into noise.
    //
    // "footprint" is how much of the disk one pixel covers where the ray lands.
    // Strands finer than that fade to their average brightness instead of
    // aliasing into speckle.
    float diskDensity(float r, float azimuth, float footprint, float mu) {
        float radialSpan = footprint / (r * mu);
        float angularSpan = footprint / (TAU * r);
        float coarseFade = smoothstep(0.004, 0.015, radialSpan);
        float fineFade = smoothstep(0.001, 0.004, radialSpan);
        float breakFade = smoothstep(0.008, 0.03, angularSpan);
        float omega = orbitalOmega(r) * DISK_SPIN_RATE;
        float logR = log(r);
        float phase = time / FLOW_PERIOD;
        float density = 0.0;
        for (int layer = 0; layer < 2; layer++) {
            float layerPhase = fract(phase + float(layer) * 0.5);
            float weight = 1.0 - abs(2.0 * layerPhase - 1.0);
            float angle = azimuth - omega * layerPhase * FLOW_PERIOD + float(layer) * 2.39;
            float u = angle / TAU;
            float offset = floor(phase + float(layer) * 0.5) * 7.31;

            // Strands are contour lines of noise stretched along the orbit:
            // fine arcs with dark gaps between them, broken up along their
            // length and bundled more tightly toward the core.
            float warp = periodicFbm(vec2(u * 6.0, logR * 5.0 - offset), 6.0);
            float flow = periodicFbm(vec2(u * 9.0, logR * 16.0 + warp * 2.5 + offset), 9.0);
            float fine = periodicFbm(vec2(u * 16.0 + flow * 3.0, logR * 44.0 + warp * 4.0 - offset), 16.0);
            float coarseLines = 1.0 - smoothstep(0.0, 0.7, abs(fract(flow * 4.0) - 0.5) * 2.0);
            float fineLines = 1.0 - smoothstep(0.0, 0.5, abs(fract(fine * 5.0) - 0.5) * 2.0);
            float breaks = smoothstep(0.3, 0.7, periodicFbm(vec2(u * 18.0 + flow * 4.0, logR * 7.0 - offset), 18.0));
            coarseLines = mix(coarseLines, 0.35, coarseFade);
            fineLines = mix(fineLines, 0.25, fineFade);
            breaks = mix(breaks, 0.5, breakFade);
            float strands = (coarseLines * 0.7 + fineLines * 0.55) * mix(0.15, 1.1, breaks);

            // Ragged outer boundary: the disk's reach varies with azimuth.
            float reach = diskOuter * (0.72 + 0.36 * periodicFbm(vec2(u * 5.0, offset), 5.0));
            float core = 1.0 - smoothstep(0.3, 0.6, r / reach);
            float fray = 1.0 - smoothstep(0.55, 1.0, r / reach);

            // Gas thins with radius, so the disk is brightest at its inner edge.
            float thinning = mix(1.0, 0.4, smoothstep(diskInner, reach * 0.55, r));
            float dense = (0.3 + 0.9 * strands) * thinning;
            float lace = strands * strands * 1.3;
            density += weight * mix(lace * fray, dense, core);
        }
        return density;
    }

    // Emission and opacity where the ray crosses the disk plane. The disk is a
    // thin slab of marginally optically thick gas: its optical depth along the
    // ray grows as 1/cos of the angle to the disk normal, so the thin outer
    // wisps glow brightly edge-on but barely register when seen face-on.
    vec4 shadeDisk(vec3 hit, vec3 dir, float footprint, float lambda, float observerShift) {
        float r = length(hit.xy);
        if (r < diskInner || r > diskOuter) {
            return vec4(0.0);
        }

        // Novikov-Thorne temperature profile, normalized to 1 at its peak
        // (r = 49/36 of the inner edge). At zero realism the temperature is
        // uniform, as for the film's cooled 4500 K disk.
        float rPeak = diskInner * 49.0 / 36.0;
        float zeroTorque = max(1.0 - sqrt(diskInner / r), 0.0) * 7.0;
        float profile = pow(r / rPeak, -0.75) * pow(zeroTorque + 0.02, 0.25);
        profile = pow(profile, realism);

        // Redshift g = E_observed / E_emitted for a circular emitter. The film
        // left out Doppler and gravitational shifts, so realism fades them in.
        float g = observerShift / (orbitalLorentz(r) * (1.0 - orbitalOmega(r) * lambda));
        g = pow(max(g, 1e-3), realism);

        float observedT = diskTemperature * profile * g;
        vec3 source = blackbody(observedT) * pow(profile * g, 4.0) * EXPOSURE;
        // The film graded its disk through the response of motion picture
        // stock, which reads a 4500 K blackbody as salmon-white, not cream.
        source *= mix(vec3(1.0, 0.6, 0.74), vec3(1.0), realism);

        float mu = max(abs(dir.z) / length(dir), 0.02);
        float density = diskDensity(r, atan(hit.y, hit.x), footprint, mu);
        float innerEdge = smoothstep(diskInner, diskInner * 1.03, r);
        float alpha = innerEdge * (1.0 - exp(-DISK_OPACITY * density / mu));
        return vec4(source, alpha);
    }

    vec3 tonemap(vec3 color) {
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
        return pow(color, vec3(1.0 / 2.2));
    }

    void main() {
        // Scale by the shorter side of the visible frame, so portrait screens
        // keep the hole in view and letterboxing keeps the field of view.
        float frameHeight = frameAspect > 0.0 ? min(resolution.y, resolution.x / frameAspect) : resolution.y;
        vec2 uv = (gl_FragCoord.xy + jitter - 0.5 * resolution) / min(resolution.x, frameHeight);

        float theta = radians(cameraAngle);
        float phi = radians(cameraPhi);
        vec3 camPos = cameraDistance * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));

        vec3 forward = normalize(-camPos);
        vec3 right = cross(forward, vec3(0.0, 0.0, 1.0));
        right = length(right) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(right);
        vec3 up = cross(right, forward);
        float lensScale = 2.0 * tan(radians(fieldOfView) * 0.5);
        vec3 rd = normalize(forward + lensScale * (uv.x * right + uv.y * up));

        // Conserved quantities of the arriving photon, measured by a static
        // observer at the camera: axial angular momentum per unit energy at
        // infinity, and the observer's own gravitational blueshift.
        float observerLapse = sqrt(max(1.0 - 1.0 / cameraDistance, 1e-3));
        float lambda = -cross(camPos, rd).z / observerLapse;
        float observerShift = 1.0 / observerLapse;

        float horizon = MASS * (1.0 + sqrt(max(1.0 - spin * spin, 0.0)));
        float escapeRadius = max(cameraDistance, diskOuter) * 1.2 + 6.0;

        // Angle one pixel subtends; times the distance travelled, it gives the
        // pixel's footprint where the ray lands (lensing widens it further).
        float pixelAngle = lensScale / min(resolution.x, frameHeight);
        float travelled = 0.0;

        vec3 p = camPos;
        vec3 v = rd;
        vec3 color = vec3(0.0);
        float transmittance = 1.0;
        bool captured = false;

        for (int i = 0; i < MAX_STEPS; i++) {
            float r = length(p);
            if (r < horizon * 1.02) {
                captured = true;
                break;
            }
            if (r > escapeRadius && dot(p, v) > 0.0) {
                break;
            }

            float h = STEP_SCALE * min(r, r * r);
            vec3 k1v = photonAcceleration(p, v);
            vec3 k2p = v + 0.5 * h * k1v;
            vec3 k2v = photonAcceleration(p + 0.5 * h * v, k2p);
            vec3 k3p = v + 0.5 * h * k2v;
            vec3 k3v = photonAcceleration(p + 0.5 * h * k2p, k3p);
            vec3 k4p = v + h * k3v;
            vec3 k4v = photonAcceleration(p + h * k3p, k4p);

            vec3 next = p + h / 6.0 * (v + 2.0 * k2p + 2.0 * k3p + k4p);
            v += h / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

            float stepLength = length(next - p);
            if (p.z * next.z < 0.0) {
                float t = p.z / (p.z - next.z);
                vec3 hit = mix(p, next, t);
                float footprint = 1.5 * pixelAngle * (travelled + t * stepLength);
                vec4 disk = shadeDisk(hit, next - p, footprint, lambda, observerShift);
                color += transmittance * disk.rgb * disk.a;
                transmittance *= 1.0 - disk.a;
                if (transmittance < 0.01) {
                    break;
                }
            }
            travelled += stepLength;
            p = next;
        }

        if (!captured && transmittance >= 0.01) {
            color += transmittance * sampleStars(normalize(v));
        }

        vec3 finalColor = tonemap(color);
        vec3 previous = texture2D(previousFrame, gl_FragCoord.xy / resolution).rgb;
        gl_FragColor = vec4(mix(previous, finalColor, blendWeight), 1.0);
    }
`;

// One step of the bloom chain: a small box filter into a target half the size
// (or smaller) of its source. The first step also keeps only bright pixels.
export const bloomDownsampleShader = `
    precision highp float;

    uniform sampler2D source;
    uniform vec2 sourceTexel;
    uniform vec2 resolution;
    uniform float threshold;

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec3 color = texture2D(source, uv).rgb * 4.0;
        color += texture2D(source, uv + sourceTexel * vec2(-1.0, -1.0)).rgb;
        color += texture2D(source, uv + sourceTexel * vec2(1.0, -1.0)).rgb;
        color += texture2D(source, uv + sourceTexel * vec2(-1.0, 1.0)).rgb;
        color += texture2D(source, uv + sourceTexel * vec2(1.0, 1.0)).rgb;
        color /= 8.0;
        if (threshold > 0.0) {
            float peak = max(color.r, max(color.g, color.b));
            color *= smoothstep(threshold, threshold + 0.35, peak);
        }
        gl_FragColor = vec4(color, 1.0);
    }
`;

export const displayFragmentShader = `
    precision highp float;

    uniform sampler2D frame;
    uniform sampler2D bloom0;
    uniform sampler2D bloom1;
    uniform sampler2D bloom2;
    uniform sampler2D bloom3;
    uniform sampler2D bloom4;
    uniform sampler2D bloom5;
    uniform sampler2D bloom6;
    uniform vec2 bloomTexel0;
    uniform vec2 bloomTexel1;
    uniform vec2 bloomTexel2;
    uniform vec2 bloomTexel3;
    uniform vec2 bloomTexel4;
    uniform vec2 bloomTexel5;
    uniform vec2 bloomTexel6;
    uniform float bloomStrength;
    uniform vec2 resolution;
    uniform float frameAspect;
    uniform float grainSeed;

    float grainHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    // 3x3 tent filter so the low-resolution glow levels upsample smoothly.
    vec3 tent(sampler2D level, vec2 uv, vec2 texel) {
        vec3 sum = texture2D(level, uv).rgb * 4.0;
        sum += texture2D(level, uv + vec2(texel.x, 0.0)).rgb * 2.0;
        sum += texture2D(level, uv - vec2(texel.x, 0.0)).rgb * 2.0;
        sum += texture2D(level, uv + vec2(0.0, texel.y)).rgb * 2.0;
        sum += texture2D(level, uv - vec2(0.0, texel.y)).rgb * 2.0;
        sum += texture2D(level, uv + texel).rgb;
        sum += texture2D(level, uv - texel).rgb;
        sum += texture2D(level, uv + vec2(texel.x, -texel.y)).rgb;
        sum += texture2D(level, uv + vec2(-texel.x, texel.y)).rgb;
        return sum / 16.0;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec3 color = texture2D(frame, uv).rgb;
        if (bloomStrength > 0.0) {
            // Tight bloom from the fine levels plus a broad veiling flare from
            // the coarse ones, the soft glow of IMAX lenses the film imitated.
            vec3 glow = tent(bloom0, uv, bloomTexel0) * 0.03;
            glow += tent(bloom1, uv, bloomTexel1) * 0.05;
            glow += tent(bloom2, uv, bloomTexel2) * 0.09;
            glow += tent(bloom3, uv, bloomTexel3) * 0.16;
            glow += tent(bloom4, uv, bloomTexel4) * 0.26;
            glow += tent(bloom5, uv, bloomTexel5) * 0.34;
            glow += tent(bloom6, uv, bloomTexel6) * 0.4;
            // Screen blend keeps highlights from clipping to flat white.
            color = 1.0 - (1.0 - color) * (1.0 - clamp(glow * bloomStrength * 2.1, 0.0, 1.0));
        }

        // Cinema mode: letterbox bars, a soft vignette, and fine film grain.
        if (frameAspect > 0.0) {
            vec2 centered = gl_FragCoord.xy - 0.5 * resolution;
            float frameHeight = min(resolution.y, resolution.x / frameAspect);
            vec2 frameUv = centered / vec2(0.5 * resolution.x, 0.5 * frameHeight);
            color *= mix(0.72, 1.0, smoothstep(1.55, 0.35, length(frameUv * vec2(0.85, 1.0))));
            // Grain scales with brightness so empty space stays black.
            color += (grainHash(gl_FragCoord.xy + grainSeed) - 0.5) * 0.06 * (0.08 + color);
            if (abs(centered.y) > 0.5 * frameHeight) {
                color = vec3(0.0);
            }
        }
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
`;
