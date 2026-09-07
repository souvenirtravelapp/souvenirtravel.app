#!/usr/bin/env node
// يرحّل أصول المخطِّط إلى wrapper/www لغلافَي الهاتف — نفس التحويل الذي
// تجريه مرحلة بناء iOS: بلا صور ثقيلة (تُجلب من الموقع الحي)، والمحدِّدات
// المطلقة /app/js/… تُكتب نسبيةً لأن WebKit يرفضها على أصل الغلاف.
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "app"), dst = join(root, "wrapper/www");

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const entry of readdirSync(src)) {
  if (entry === "attractions" || entry === "covers") continue;
  cpSync(join(src, entry), join(dst, entry), { recursive: true });
}
for (const f of ["icon.png", "favicon.png"]) copyFileSync(join(root, f), join(dst, f));

const patch = (file, from, to) =>
  writeFileSync(file, readFileSync(file, "utf8").replaceAll(from, to));
patch(join(dst, "index.html"), '"/app/js/', '"./js/');
patch(join(dst, "index.html"), '"/icon.png"', '"./icon.png"');
patch(join(dst, "index.html"), '"/favicon.png"', '"./favicon.png"');
for (const f of readdirSync(join(dst, "js")))
  if (f.endsWith(".js")) patch(join(dst, "js", f), '"/app/js/', '"./');
console.log("staged wrapper/www from app/ (specifiers relativized, heavy images excluded)");
