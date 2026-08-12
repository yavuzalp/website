#!/usr/bin/env node
// ============================================================================
// Rebuilds dist/travel-plan/index.html from a standalone source HTML file.
//
// Usage:
//   node scripts/build-travel-plan.js [path/to/source.html]
//   (defaults to travel-plan-src/roadtrip.html if no path is given)
//
// What this does, and why it exists:
//   The /travel-plan page's content (route, day-by-day plan, map) was
//   generated as a self-contained HTML document by a separate Cowork
//   session, with its own complete dark "night sky" design. Rather than
//   hand-copy-pasting that into the site every time it changes, this script
//   automates the transform:
//     1. Reads the source file's own <style> block and scopes every
//        selector under .travel-plan-page (so its generic class names like
//        .row/.box can't collide with Bootstrap's .row, and its :root/body/
//        * rules can't leak out to the site nav) — and defensively adds
//        !important to color/background/font-family declarations, since
//        the site's global futuristic.css forces those properties on bare
//        h1–h6/p/li tags with !important, which would otherwise silently
//        override the trip content's intended light-on-dark text.
//     2. Pulls any Leaflet <link>/<script> tags out of the source's <head>
//        (kept dynamic, not hardcoded, in case the source ever bumps the
//        Leaflet version) and the source's <body> content verbatim.
//     3. Injects both into travel-plan-src/template.html — the fixed site
//        "shell" (nav, meta, noindex, GA, etc.) that this script never
//        touches — and writes the result to dist/travel-plan/index.html.
//
// To publish an updated trip plan: replace travel-plan-src/roadtrip.html
// (or point this script at a different source path), run this script, then
// follow the site's normal manual deploy steps (see CLAUDE.md) to commit
// and copy dist/travel-plan/index.html into the gh-pages branch. This
// script only regenerates the dist/ file — it does not commit or deploy.
//
// Deliberately not touched by this script (edit travel-plan-src/template.html
// directly if these ever need to change): the site nav (no "Travel Plan"
// link — this page is unlisted on purpose), the noindex/nofollow meta tag,
// the page <title>/description, Google Analytics, and every other page on
// the site.
// ============================================================================

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(REPO_ROOT, 'travel-plan-src', 'template.html');
const DEFAULT_SOURCE_PATH = path.join(REPO_ROOT, 'travel-plan-src', 'roadtrip.html');
const OUTPUT_PATH = path.join(REPO_ROOT, 'dist', 'travel-plan', 'index.html');

// Site-facing metadata is a deliberate site decision, not part of the trip
// content itself — kept here rather than pulled from the source's own
// (much longer/more technical) <title>, so it doesn't silently change just
// because the source content did.
const TITLE = 'Road Trip Plan · Yavuzalp Turkoglu';
const DESCRIPTION = 'Seattle → Oregon Outback camping road trip plan — Mt Hood, the Oregon Outback Dark Sky Sanctuary, the Pacific coast, and Olympic National Park, by Yavuzalp Turkoglu';

const PROPERTIES_TO_FORCE_IMPORTANT = ['color', 'background-color', 'background', 'font-family'];

function fail(msg) {
    console.error('build-travel-plan: ' + msg);
    process.exit(1);
}

function extractBetween(html, startTag, endTag, label) {
    const startIdx = html.indexOf(startTag);
    if (startIdx === -1) fail('could not find ' + label + ' start tag (' + startTag + ')');
    const contentStart = startIdx + startTag.length;
    const endIdx = html.indexOf(endTag, contentStart);
    if (endIdx === -1) fail('could not find ' + label + ' end tag (' + endTag + ')');
    return html.slice(contentStart, endIdx);
}

function extractHead(html) {
    const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (!m) fail('could not find <head>...</head>');
    return m[1];
}

function extractBody(html) {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!m) fail('could not find <body>...</body>');
    return m[1].trim();
}

function extractLeafletTags(headHtml) {
    const tags = [];
    const linkRe = /<link\b[^>]*>/gi;
    const scriptRe = /<script\b[^>]*>\s*<\/script>/gi;
    let m;
    while ((m = linkRe.exec(headHtml))) {
        if (/leaflet/i.test(m[0])) tags.push(m[0]);
    }
    while ((m = scriptRe.exec(headHtml))) {
        if (/leaflet/i.test(m[0])) tags.push(m[0]);
    }
    if (!tags.length) {
        console.warn('build-travel-plan: warning — no Leaflet <link>/<script> tags found in source <head>. The map may not render.');
    }
    return tags.join('\n        ');
}

// Split top-level CSS into { type: 'rule', selector, decls } and
// { type: 'media', condition, inner } blocks by brace-depth counting.
// Good enough for a hand-authored stylesheet like this one — not a full
// CSS parser (no support for nested @media, comments are passed through
// unscoped and left as-is since none of the known sources use them).
function splitTopLevelRules(css) {
    const rules = [];
    let i = 0;
    const n = css.length;
    while (i < n) {
        while (i < n && /\s/.test(css[i])) i++;
        if (i >= n) break;
        if (css.startsWith('@media', i)) {
            const braceIdx = css.indexOf('{', i);
            if (braceIdx === -1) fail('unterminated @media rule');
            const condition = css.slice(i, braceIdx).trim();
            let depth = 0, j = braceIdx;
            do {
                if (css[j] === '{') depth++;
                else if (css[j] === '}') depth--;
                j++;
            } while (depth > 0 && j < n);
            rules.push({ type: 'media', condition: condition, inner: css.slice(braceIdx + 1, j - 1) });
            i = j;
        } else {
            const braceIdx = css.indexOf('{', i);
            if (braceIdx === -1) break; // trailing whitespace/garbage
            const selector = css.slice(i, braceIdx).trim();
            let depth = 0, j = braceIdx;
            do {
                if (css[j] === '{') depth++;
                else if (css[j] === '}') depth--;
                j++;
            } while (depth > 0 && j < n);
            rules.push({ type: 'rule', selector: selector, decls: css.slice(braceIdx + 1, j - 1) });
            i = j;
        }
    }
    return rules;
}

function scopeSelector(sel) {
    if (sel === ':root') return '.travel-plan-page';
    if (sel === '*') return '.travel-plan-page *';
    if (sel === 'body') return '.travel-plan-page';
    return sel.split(',').map(function (part) {
        return '.travel-plan-page ' + part.trim();
    }).join(', ');
}

function addImportant(decls) {
    return decls.split(';').map(function (decl) {
        const m = decl.match(/^\s*([a-zA-Z-]+)\s*:\s*(.+)$/);
        if (!m) return decl;
        const prop = m[1].toLowerCase();
        let val = m[2].trim();
        if (PROPERTIES_TO_FORCE_IMPORTANT.indexOf(prop) === -1) return decl;
        if (/!important\s*$/i.test(val)) return decl; // already important
        return ' ' + m[1] + ': ' + val + ' !important';
    }).join(';');
}

function renderRules(rules, indent) {
    return rules.map(function (rule) {
        if (rule.type === 'media') {
            const innerRules = splitTopLevelRules(rule.inner);
            return indent + rule.condition + '{\n' + renderRules(innerRules, indent + '    ') + '\n' + indent + '}';
        }
        const scoped = scopeSelector(rule.selector);
        const decls = addImportant(rule.decls);
        return indent + scoped + '{' + decls + '}';
    }).join('\n');
}

// The site's global futuristic.css forces color+font-family on bare
// h1-h6/p/li with !important, regardless of what ancestor color the
// source document's own CSS establishes. Any h1-h6/p/li in the source
// that doesn't declare its OWN color (e.g. it just relies on inheriting
// from an ancestor, which is normal, valid CSS on its own) would
// otherwise silently lose that inherited color to the site's forced one
// once dropped into this page — this bit the hand-written version of this
// page and is fixed here at the tool level so it can't recur on a future
// source-file swap. Using `inherit` (not a hardcoded color) means this
// stays correct even if the source's structure changes, as long as
// SOME ancestor still sets the intended color — which .travel-plan-page
// itself always does. More specific rules extracted from the source further
// below (e.g. `.sub`, `h1 span`, `.a-red h3`) still win over this via
// higher CSS specificity, so an explicit source color is never masked.
const IMPORTANT_TAG_SAFETY_NET =
    '            .travel-plan-page h1, .travel-plan-page h2, .travel-plan-page h3,\n' +
    '            .travel-plan-page h4, .travel-plan-page h5, .travel-plan-page h6,\n' +
    '            .travel-plan-page p, .travel-plan-page li {\n' +
    '                color: inherit !important;\n' +
    '                font-family: inherit !important;\n' +
    '            }';

function transformStyle(sourceHtml) {
    const styleContent = extractBetween(sourceHtml, '<style>', '</style>', '<style> block');
    const rules = splitTopLevelRules(styleContent);
    return IMPORTANT_TAG_SAFETY_NET + '\n' + renderRules(rules, '            ');
}

function main() {
    const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE_PATH;
    if (!fs.existsSync(sourcePath)) fail('source file not found: ' + sourcePath);
    if (!fs.existsSync(TEMPLATE_PATH)) fail('template not found: ' + TEMPLATE_PATH);

    const sourceHtml = fs.readFileSync(sourcePath, 'utf8');
    const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    const headHtml = extractHead(sourceHtml);
    const bodyHtml = extractBody(sourceHtml);
    const scopedStyle = transformStyle(sourceHtml);
    const leafletTags = extractLeafletTags(headHtml);

    let output = template
        .replace('{{TITLE}}', TITLE)
        .replace('{{DESCRIPTION}}', DESCRIPTION)
        .replace('{{HEAD_EXTRA}}', leafletTags)
        .replace('{{SCOPED_STYLE}}', scopedStyle)
        .replace('{{BODY}}', bodyHtml);

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
    console.log('build-travel-plan: wrote ' + path.relative(REPO_ROOT, OUTPUT_PATH) + ' from ' + path.relative(REPO_ROOT, sourcePath));
}

main();
