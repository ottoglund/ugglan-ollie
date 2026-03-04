import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const src = path.join(root, "public", "ollie-master.png");
const outPublic = path.join(root, "public");

if (!fs.existsSync(src)) {
  console.error("Hittar inte public/ollie-master.png");
  process.exit(1);
}

const iconBg = "#F2F2F7";

async function makeIcon(file, size, pad = 0.14) {
  const inner = Math.round(size * (1 - pad * 2));
  const img = await sharp(src).resize(inner, inner, { fit: "contain" }).png().toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: iconBg },
  })
    .composite([{ input: img, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png()
    .toFile(path.join(outPublic, file));
}

async function makeSplash(file, w, h) {
  const iconSize = Math.round(Math.min(w, h) * 0.28);
  const img = await sharp(src).resize(iconSize, iconSize, { fit: "contain" }).png().toBuffer();

  await sharp({
    create: { width: w, height: h, channels: 4, background: iconBg },
  })
    .composite([{ input: img, left: Math.round((w - iconSize) / 2), top: Math.round((h - iconSize) / 2) }])
    .png()
    .toFile(path.join(outPublic, "splash", file));
}

async function run() {
  await makeIcon("apple-touch-icon.png", 180);
  await makeIcon("icon-192.png", 192);
  await makeIcon("icon-512.png", 512);
  await makeIcon("favicon.png", 64, 0.18);

  const splashDir = path.join(outPublic, "splash");
  fs.mkdirSync(splashDir, { recursive: true });

  await makeSplash("iphone-14-pro-max.png", 1290, 2796);
  await makeSplash("iphone-14-pro.png", 1179, 2556);
  await makeSplash("iphone-13-14.png", 1170, 2532);
  await makeSplash("iphone-12-13-mini.png", 1080, 2340);
  await makeSplash("iphone-se-8.png", 750, 1334);

  await makeSplash("ipad-11.png", 1668, 2388);
  await makeSplash("ipad-12-9.png", 2048, 2732);

  console.log("✅ Klart! Skapade ikoner + splash i public/");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});