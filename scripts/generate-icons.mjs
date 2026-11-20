// Renders the app icons (学 on cinnabar) from hanzi-writer stroke data, so no CJK font is needed.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RED = "#B8322A";
const OUT_DIR = path.join(process.cwd(), "public", "icons");
const CHAR = "学";

function iconSvg(size, strokes, { scale }) {
  const box = size * scale;
  const offset = (size - box) / 2;
  const s = box / 1024;
  // hanzi-writer data uses a 1024 box with the y axis flipped (baseline at 900).
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${RED}"/>
      <g transform="translate(${offset}, ${offset}) scale(${s}) translate(0, 900) scale(1, -1)">
        ${strokes.map((d) => `<path d="${d}" fill="#FFF8F0"/>`).join("")}
      </g>
    </svg>`;
}

async function main() {
  const res = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(CHAR)}.json`);
  const { strokes } = await res.json();
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: "icon-192.png", size: 192, scale: 0.7 },
    { file: "icon-512.png", size: 512, scale: 0.7 },
    { file: "icon-512-maskable.png", size: 512, scale: 0.5 },
    { file: "apple-touch-icon.png", size: 180, scale: 0.7 },
  ];

  for (const t of targets) {
    await sharp(Buffer.from(iconSvg(t.size, strokes, t))).png().toFile(path.join(OUT_DIR, t.file));
    console.log(`Wrote ${t.file}`);
  }
  await sharp(Buffer.from(iconSvg(64, strokes, { scale: 0.78 }))).png().toFile(path.join(process.cwd(), "src", "app", "icon.png"));
  console.log("Wrote src/app/icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
