import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
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
  if (html.includes("_FXwxkG/chat")) errors.push(`Wrong general-inquiry channel: ${relative(root, page)}`);
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
const guideEntries = [...sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url\s*>/g)]
  .map((match) => ({
    url: match[1].match(/<loc\s*>\s*([^<]+?)\s*<\/loc\s*>/)?.[1]?.trim(),
    lastmod: match[1].match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1]?.trim(),
  }))
  .filter((entry) => entry.url && entry.lastmod);
const newestGuideDate = guideEntries.filter((entry) => new URL(entry.url).pathname.startsWith("/guide/"))
  .reduce((latest, entry) => entry.lastmod > latest ? entry.lastmod : latest, "");
const homeHtml = readFileSync(join(root, "index.html"), "utf8");
const golfChatUrl = "https://pf.kakao.com/_xdBALn/chat";
if (!homeHtml.includes(`href="${golfChatUrl}"`)) errors.push("Golf inquiry link missing from homepage.");
const catalog = JSON.parse(readFileSync(join(root, "assets", "catalog.json"), "utf8"));
const latestPriceEnd = catalog.courses.flatMap((course) => course.price?.conditions || [])
  .reduce((latest, condition) => condition.validTo > latest ? condition.validTo : latest, "");
const vietnamDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
if (vietnamDate > latestPriceEnd && /<div id="price-list" class="price-list">[\s\S]*?data-price-course/.test(homeHtml)) {
  errors.push("Expired price rows remain in non-JavaScript homepage HTML.");
}
if (vietnamDate > latestPriceEnd && !homeHtml.includes('id="price-empty" class="empty-state">')) {
  errors.push("Expired-price explanation is hidden in non-JavaScript homepage HTML.");
}
const manifest = JSON.parse(readFileSync(join(root, "BUILD_MANIFEST.json"), "utf8"));
if (manifest.url_count !== urls.size) errors.push("Build manifest URL count is stale.");
for (const entry of manifest.files) {
  const bytes = readFileSync(join(root, entry.path));
  const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (bytes.length !== entry.bytes || hash !== entry.sha256) errors.push(`Build manifest file mismatch: ${entry.path}`);
}
for (const entry of guideEntries.filter((item) => item.lastmod === newestGuideDate && new URL(item.url).pathname.startsWith("/guide/"))) {
  const path = new URL(entry.url).pathname;
  if (!homeHtml.includes(`href="${path}"`)) errors.push(`Latest guide lacks homepage link: ${path}`);
}
const homeDate = guideEntries.find((entry) => new URL(entry.url).pathname === "/")?.lastmod;
if (!homeDate || homeDate < newestGuideDate) errors.push("Homepage lastmod predates newest guide link.");

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
const montgomerieGuidePath = join(root, "guide", "montgomerie-links-vietnam-golf-rates-2026", "index.html");
const montgomerieGuide = readFileSync(montgomerieGuidePath, "utf8");
const montgomerieHead = montgomerieGuide.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
if ((montgomerieGuide.match(/<h1\b/gi) || []).length !== 1) errors.push("Montgomerie 2026 rate guide must have exactly one H1.");
if (!montgomerieGuide.includes("2,388,000 VND") || !montgomerieGuide.includes("4,650,000 VND")) errors.push("Montgomerie visitor rate table is missing source-verified 2026 prices.");
if (!montgomerieGuide.includes("PUBLIC-RATE-GOLF.pdf") || !montgomerieGuide.includes("2026-09-30")) errors.push("Montgomerie guide must record the official source and verification date.");
const montgomerieJsonLd = [...montgomerieHead.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
for (const script of montgomerieJsonLd) {
  try {
    JSON.parse(script[1]);
  } catch {
    errors.push("Montgomerie guide contains invalid JSON-LD.");
  }
}
if (!montgomerieJsonLd.some((script) => script[1].includes('"@type":"Article"'))) errors.push("Montgomerie guide Article schema is missing.");
if (!montgomerieJsonLd.some((script) => script[1].includes('"@type":"FAQPage"'))) errors.push("Montgomerie guide FAQ schema is missing.");
console.log(JSON.stringify({ indexablePages: expected.size, sitemapUrls: urls.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
