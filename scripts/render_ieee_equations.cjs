"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("Usage: node render_ieee_equations.cjs <output-directory>");
}
fs.mkdirSync(outputDirectory, { recursive: true });

function svgEquation(markup, width = 1600) {
  const lines = Array.isArray(markup) ? markup : [markup];
  const height = lines.length === 1 ? 170 : 280;
  const text = lines.map((line, index) => (
    `<text x="${width / 2}" y="${index === 0 ? 102 : 222}" text-anchor="middle" fill="#000000" `
    + `font-family="Cambria Math, Times New Roman, serif" font-size="72">${line}</text>`
  )).join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#ffffff" fill-opacity="0"/>
      ${text}
    </svg>
  `);
}

async function render(name, markup, width) {
  await sharp(svgEquation(markup, width))
    .trim({ background: "#ffffff" })
    .extend({ top: 24, bottom: 24, left: 32, right: 32, background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(outputDirectory, `${name}.png`));
}

const sub = (value) => `<tspan baseline-shift="sub" font-size="34">${value}</tspan>`;
const italic = (value) => `<tspan font-style="italic">${value}</tspan>`;

Promise.all([
  render("question-value", [`${italic("V")}(q) = 100 [ Σ α${sub("k")}x${sub("k")}`, `− P${sub("exposure")} − P${sub("switch")} + B${sub("verify")} ]`], 1450),
  render("evidence-strength", [`${italic("e")} = clip${sub("[0,1]")} ( w${sub("difficulty")} w${sub("discrimination")}`, `w${sub("cognition")} w${sub("guess")} w${sub("certainty")} )`], 1650),
  render("mastery-update", [`w${sub("eff")} = w${sub("source")} r`, `M${sub("t+1")} = clip${sub("[0,1]")} [ (1 − w${sub("eff")}) M${sub("t")} + w${sub("eff")} P${sub("t")} ]`], 1800),
  render("prerequisite-gate", [`M${sub("eff")} = max [ 0, M − 0.10(1 − C) ]`, `eligible ⇔ M${sub("eff")} ≥ T`], 1500),
  render("retention", [`λ${sub("eff")} = λ${sub("0")} (1.15 − 0.5C) / [1 + min(0.12 ln(1+n), 0.45)]`, `R(t) = M exp(−λ${sub("eff")}t)`], 2100),
  render("path-priority", [`G = 0.50D + 0.30B + 0.20U`, `Q = min [1, p${sub("benefit")} + 0.08 I${sub("revision")} + 0.06G]`], 1800),
]).catch((error) => {
  console.error(error);
  process.exit(1);
});
