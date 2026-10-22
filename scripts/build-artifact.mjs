// Bundles the game into one self-contained HTML body (CSS + JS inlined) for publishing as a
// claude.ai Artifact. Run after `vite build`: `npm run build:artifact` -> dist/artifact.html
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const asset = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`Asset not found in dist/index.html: ${re}`);
  return readFileSync(`dist/${m[1].replace(/^\.?\//, '')}`, 'utf8');
};
const js = asset(/<script type="module" crossorigin src="([^"]+)"/);
const css = asset(/<link rel="stylesheet" crossorigin href="([^"]+)"/);
const title = html.match(/<title>.*<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].trim();

// Artifacts wrap the page in their own <html>/<head>/<body>, so emit only the contents.
const out = `${title}\n${fonts}\n<style>\n${css}</style>\n${body}\n<script type="module">\n${js.replaceAll('</script', '<\\/script')}</script>\n`;
writeFileSync('dist/artifact.html', out);
console.log(`dist/artifact.html (${(out.length / 1024).toFixed(1)} kB)`);
