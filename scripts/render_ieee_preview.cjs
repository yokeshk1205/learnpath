"use strict";

const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

const htmlPath = path.resolve(process.argv[2]);
const pdfPath = path.resolve(process.argv[3]);

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({ path: pdfPath, format: "Letter", printBackground: true, preferCSSPageSize: true });
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
