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

export function createStarfieldTexture() {
    const width = 2048;
    const height = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
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

    for (let i = 0; i < 5200; i += 1) {
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

    for (let i = 0; i < 340; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const color = starColors[Math.floor(random() * starColors.length)];
        const radius = 2.5 + random() * 8.0;
        drawGlowStar(x, y, radius, color, 0.24 + random() * 0.35);
    }

    for (let i = 0; i < 55; i += 1) {
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
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}
