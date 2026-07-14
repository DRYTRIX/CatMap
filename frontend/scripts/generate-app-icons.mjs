#!/usr/bin/env node
/**
 * Generate 1024x1024 icon and splash PNGs from public/favicon.svg
 * for @capacitor/assets. Requires: npm i -D sharp (devDependency).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "public/favicon.svg"));

const resources = join(root, "resources");
mkdirSync(resources, { recursive: true });

const icon = await sharp(svg).resize(1024, 1024).png().toBuffer();
await sharp(icon).toFile(join(resources, "icon.png"));

// Splash: dark background with centered icon
const splashBg = await sharp({
  create: {
    width: 2732,
    height: 2732,
    channels: 4,
    background: { r: 15, g: 23, b: 42, alpha: 1 },
  },
})
  .png()
  .toBuffer();

const iconSmall = await sharp(icon).resize(512, 512).png().toBuffer();
await sharp(splashBg)
  .composite([{ input: iconSmall, gravity: "center" }])
  .png()
  .toFile(join(resources, "splash.png"));

console.log("Wrote resources/icon.png and resources/splash.png");
