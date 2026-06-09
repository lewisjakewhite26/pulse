import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="#1A73E8"/>
  <polyline
    points="72,256 132,256 168,176 212,336 252,256 292,256 324,216 364,296 404,256 440,256"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="30"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

await mkdir(iconsDir, { recursive: true });
await writeFile(join(iconsDir, "icon.svg"), svg);

const buffer = Buffer.from(svg);

for (const size of [192, 512]) {
  await sharp(buffer).resize(size, size).png().toFile(join(iconsDir, `icon-${size}.png`));
  console.log(`Created icon-${size}.png`);
}
