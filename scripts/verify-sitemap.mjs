import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const entries = [...sitemap.matchAll(/<loc\s*>\s*([^<]+?)\s*<\/loc\s*>/g)].map((match) => match[1].trim());
const openingTags = (sitemap.match(/<loc\b/g) || []).length;
if (!entries.length || entries.length !== openingTags || !sitemap.includes("</urlset>")) {
  throw new Error("Sitemap XML URL entries are incomplete.");
}
const urls = new Set(entries);
if (urls.size !== entries.length) throw new Error("Sitemap contains duplicate URLs.");
const origin = new URL(entries[0]).origin;
const errors = [];
const pages = [join(root, "index.html")];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name === "index.html") pages.push(path);
  }
}
for (const section of ["golf", "guide", "region"]) collect(join(root, section));

const expected = new Set();
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  const pathname = "/" + relative(root, page).split(sep).join("/").replace(/index\.html$/, "");
  const ownUrl = new URL(pathname, origin).href;
  if (canonical !== ownUrl) errors.push(`Canonical mismatch: ${pathname}`);
  if (!urls.has(ownUrl)) errors.push(`Missing from sitemap: ${pathname}`);
  expected.add(ownUrl);
}
for (const url of urls) {
  if (!expected.has(url)) errors.push(`Unexpected sitemap URL: ${url}`);
}

const bookingGuidePath = join(root, "guide", "vinpearl-nha-trang-9-27-36-hole-rates-2026", "index.html");
const bookingGuide = readFileSync(bookingGuidePath, "utf8");
const bookingHead = bookingGuide.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
const bookingArticle = bookingGuide.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || "";
if (!bookingArticle) errors.push("Vinpearl booking guide article content is missing.");
if ((bookingGuide.match(/<h1\b/gi) || []).length !== 1) errors.push("Vinpearl booking guide must have exactly one H1.");
const jsonLd = [...bookingHead.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
for (const script of jsonLd) {
  try {
    JSON.parse(script[1]);
  } catch {
    errors.push("Vinpearl booking guide contains invalid JSON-LD.");
  }
}
const articleHead = bookingHead
  .replace(/<meta\s+property="og:site_name"[^>]*>/gi, "")
  .replace(/"name":"베트남 골프가격"/g, "");
const bookingCopy = `${articleHead} ${bookingArticle}`.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&");
if (/(가격|요금|비용|금액|그린피|캐디피|₫|\b\d[\d,]*\s*(?:VND|동|원)\b)/i.test(bookingCopy)) {
  errors.push("Vinpearl booking guide contains prohibited public pricing copy.");
}
console.log(JSON.stringify({ indexablePages: expected.size, sitemapUrls: urls.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
