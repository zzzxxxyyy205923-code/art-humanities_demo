import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');

const files = [
  'meta.json',
  'majors.json',
  'cases.json',
  'planning.json',
  'careers.json',
  'directions.json',
  'direction-details.json',
  'course-products.json',
  'offers.json',
  'instructors.json',
  'resources.json',
  'undergrad-regions.json',
  'timeline.json',
  'frontier-lectures.json',
  'masterclass-courses.json',
  'summer-winter-courses.json',
  'industry-courses.json',
  'overseas-courses.json'
];

const out = {};
for (const f of files) {
  const key = path.basename(f, '.json');
  const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
  out[key] = JSON.parse(text);
}

const outPath = path.join(dataDir, 'site-data.js');
const content =
  '/* 自动生成：data/*.json 的内嵌副本，供 file:// 直开时使用（fetch 在 file 协议下会被 CORS 拦截） */\n' +
  'window.SFK_DATA = ' + JSON.stringify(out, null, 2) + ';\n';

fs.writeFileSync(outPath, content);
console.log(`Generated ${outPath} (${files.length} files)`);
