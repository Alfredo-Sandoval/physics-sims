import * as THREE from "three";

function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
        value += 0x6D2B79F5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function finiteNumberOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

function getStarfieldProfile() {
    const nav = typeof navigator === "undefined" ? {} : navigator;
    const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    const shortestSide = Math.min(viewportWidth || Infinity, viewportHeight || Infinity);
    const longestSide = Math.max(viewportWidth, viewportHeight);
    const deviceMemory = finiteNumberOrNull(Number(nav.deviceMemory));
    const cpuCores = finiteNumberOrNull(Number(nav.hardwareConcurrency));
    const prefersReducedData = typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-data: reduce)").matches;

    const tinyViewport = Number.isFinite(shortestSide) && shortestSide <= 480;
    const smallViewport = Number.isFinite(shortestSide) &&
        (shortestSide <= 640 || longestSide <= 1180);
    const veryLowMemory = deviceMemory !== null && deviceMemory <= 2;
    const lowMemory = deviceMemory !== null && deviceMemory <= 4;
    const lowCoreCount = cpuCores !== null && cpuCores <= 4;

    if (prefersReducedData || tinyViewport || veryLowMemory || (smallViewport && (lowMemory || lowCoreCount))) {
        return {
            width: 1024,
            height: 512,
            dustStars: 1900,
            glowStars: 150,
            brightStars: 22,
            generateMipmaps: false,
        };
    }

    if (smallViewport || lowMemory || lowCoreCount) {
        return {
            width: 1536,
            height: 768,
            dustStars: 3300,
            glowStars: 240,
            brightStars: 36,
            generateMipmaps: false,
        };
    }

    return {
        width: 2048,
        height: 1024,
        dustStars: 5200,
        glowStars: 340,
        brightStars: 55,
        generateMipmaps: true,
    };
}

export function createStarfieldTexture() {
    const profile = getStarfieldProfile();
    const { width, height } = profile;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
        throw new Error("Unable to create starfield canvas context.");
    }
    const random = mulberry32(42);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#04050a");
    bg.addColorStop(0.45, "#09080b");
    bg.addColorStop(1, "#030304");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const band = ctx.createLinearGradient(0, height * 0.18, width, height * 0.82);
    band.addColorStop(0, "rgba(75, 88, 130, 0.04)");
    band.addColorStop(0.35, "rgba(130, 145, 255, 0.05)");
    band.addColorStop(0.5, "rgba(255, 218, 150, 0.12)");
    band.addColorStop(0.65, "rgba(255, 162, 92, 0.08)");
    band.addColorStop(1, "rgba(40, 28, 55, 0.03)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < profile.dustStars; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const brightness = 0.2 + random() * 0.85;
        const hue = 190 + random() * 50;
        const alpha = 0.08 + random() * 0.35;
        ctx.fillStyle = `hsla(${hue}, ${20 + random() * 25}%, ${55 + brightness * 25}%, ${alpha})`;
        ctx.fillRect(x, y, 1, 1);
    }

    const starColors = [
        [205, 223, 255],
        [255, 244, 222],
        [255, 221, 176],
    ];

    const drawGlowStar = (x, y, radius, rgb, alpha) => {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`);
        glow.addColorStop(0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.35})`);
        glow.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    for (let i = 0; i < profile.glowStars; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const color = starColors[Math.floor(random() * starColors.length)];
        const radius = 2.5 + random() * 8.0;
        drawGlowStar(x, y, radius, color, 0.24 + random() * 0.35);
    }

    for (let i = 0; i < profile.brightStars; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const color = starColors[Math.floor(random() * starColors.length)];
        const radius = 10 + random() * 18;
        drawGlowStar(x, y, radius, color, 0.18 + random() * 0.18);
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.08)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - radius * 0.9, y);
        ctx.lineTo(x + radius * 0.9, y);
        ctx.moveTo(x, y - radius * 0.9);
        ctx.lineTo(x, y + radius * 0.9);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = profile.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = profile.generateMipmaps;
    texture.needsUpdate = true;
    return texture;
}
