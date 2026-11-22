import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractFunction(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `Could not find function ${name} in index.html`);
  let depth = 0;
  let inBrace = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === '{') {
      depth++;
      inBrace = true;
    } else if (ch === '}') {
      depth--;
      if (inBrace && depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unclosed function ${name}`);
}

const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
const produitsJs = fs.readFileSync(path.resolve('public/produits.js'), 'utf8');

function loadIndexHelpers() {
  const snippet = [
    'const DEFAULT_PHOTO_STYLE = { brightness: 105, contrast: 105, saturate: 110, sharpness: 20 };',
    extractFunction(indexHtml, 'clampNum'),
    extractFunction(indexHtml, 'normalizePhotoStyle'),
    extractFunction(indexHtml, 'sanitizeUrl'),
    extractFunction(indexHtml, 'slugify'),
    extractFunction(indexHtml, 'buildShortSlug'),
    extractFunction(indexHtml, 'normalizeSiteBaseUrl'),
    extractFunction(indexHtml, 'splitTips'),
    extractFunction(indexHtml, 'parseFeaturesInput'),
    extractFunction(indexHtml, 'parseVideoSource'),
    extractFunction(indexHtml, 'buildSharpnessKernel'),
    extractFunction(indexHtml, 'buildPhotoFilterCss'),
    extractFunction(indexHtml, 'buildPinterestProductUrl'),
    extractFunction(indexHtml, 'formatExternalUrlsForInput'),
    extractFunction(indexHtml, 'parseImagesCsv'),
    extractFunction(indexHtml, 'mergeExternalImageUrls'),
    extractFunction(indexHtml, 'generateProduitsJsContent'),
    'module.exports = { clampNum, normalizePhotoStyle, sanitizeUrl, slugify, buildShortSlug, normalizeSiteBaseUrl, splitTips, parseFeaturesInput, parseVideoSource, buildSharpnessKernel, buildPhotoFilterCss, buildPinterestProductUrl, formatExternalUrlsForInput, parseImagesCsv, mergeExternalImageUrls, generateProduitsJsContent };',
  ].join('\n\n');

  const sandbox: Record<string, unknown> = { module: { exports: {} } };
  vm.runInNewContext(snippet, sandbox);
  return sandbox.module as { exports: Record<string, (...args: unknown[]) => unknown> };
}

test('public/produits.js parses cleanly and defines required defaults', () => {
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(produitsJs, sandbox);

  const cfg = sandbox.window.SITE_CONFIG as Record<string, unknown>;
  assert.equal(cfg.brandName, 'VÉLORA FINDS');
  assert.equal(cfg.tagline, 'Thoughtful, Cozy & Viral Finds — Curated to Brighten Everyday Life.');
  assert.equal(cfg.email, 'monemail@gmail.com');
  assert.equal(cfg.theme, 'cream-terracotta');
  assert.equal(cfg.adminPin, '2027');

  const products = sandbox.window.PRODUCTS as Array<Record<string, unknown>>;
  assert.equal(products.length, 4);
  assert.deepEqual(
    Array.from(products.map((p) => p.id)),
    [
      'mini-pocket-printer',
      'cordless-mushroom-lamp',
      'mini-usb-bag-sealer',
      'smart-coffee-mug-warmer',
    ]
  );
  for (const p of products) {
    assert.ok(p.photoStyle && typeof p.photoStyle === 'object');
    assert.ok(Array.isArray(p.images) && p.images.length >= 1);
    assert.equal(typeof p.videoUrl, 'string');
  }
});

test('parseVideoSource converts YouTube, Shorts, Vimeo, mp4/webm, and rejects empty', () => {
  const { parseVideoSource } = loadIndexHelpers().exports;

  const yt = parseVideoSource('https://www.youtube.com/watch?v=abc123XYZ99') as Record<string, unknown>;
  assert.equal(yt.type, 'youtube');
  assert.equal(yt.vertical, false);
  assert.equal(yt.embedUrl, 'https://www.youtube.com/embed/abc123XYZ99?rel=0');

  const shorts = parseVideoSource('https://youtube.com/shorts/short9988AA') as Record<string, unknown>;
  assert.equal(shorts.type, 'youtube');
  assert.equal(shorts.vertical, true);
  assert.equal(shorts.embedUrl, 'https://www.youtube.com/embed/short9988AA?rel=0');

  const vimeo = parseVideoSource('https://vimeo.com/123456789') as Record<string, unknown>;
  assert.equal(vimeo.type, 'vimeo');
  assert.equal(vimeo.vertical, false);
  assert.equal(vimeo.embedUrl, 'https://player.vimeo.com/video/123456789');

  const mp4 = parseVideoSource('demo.mp4') as Record<string, unknown>;
  assert.equal(mp4.type, 'video');
  assert.equal(mp4.src, 'demo.mp4');

  assert.equal(parseVideoSource(''), null);
  assert.equal(parseVideoSource('   '), null);
});

test('sanitizeUrl allows compressed JPEG data URIs and blocks dangerous URIs', () => {
  const { sanitizeUrl, splitTips } = loadIndexHelpers().exports;

  assert.equal(
    sanitizeUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='),
    'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  );
  assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
  assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');

  assert.deepEqual(Array.from(splitTips('Tip one.\nTip two.\n\nTip three.') as string[]), [
    'Tip one.',
    'Tip two.',
    'Tip three.',
  ]);
});

test('buildPhotoFilterCss & generateProduitsJsContent preserve quotes/accents safely', () => {
  const { buildPhotoFilterCss, generateProduitsJsContent } = loadIndexHelpers().exports;

  const css = buildPhotoFilterCss(
    { brightness: 112, contrast: 108, saturate: 115, sharpness: 40 },
    'velora-sharp-mini-pocket-printer'
  );
  assert.equal(
    css,
    'brightness(112%) contrast(108%) saturate(115%) url(#velora-sharp-mini-pocket-printer)'
  );

  const generated = generateProduitsJsContent(
    {
      brandName: "VÉLORA 'COZY' FINDS",
      tagline: 'Warm "Tested" Picks & More',
      email: 'test@example.com',
      theme: 'sage-honey',
      adminPin: '2027',
    },
    [
      {
        id: 'test-item',
        title: 'L\'Objet Parfait "Édition"',
        price: '$14.50',
        category: 'Smart Home',
        rating: '4.9',
        isBestSeller: true,
        badge: 'Top Pick',
        shortDesc: "Works with any cup's base.",
        images: ['cup.jpg'],
        photoStyle: { brightness: 110, contrast: 105, saturate: 120, sharpness: 30 },
        videoUrl: 'https://vimeo.com/987654321',
        problemSolved: 'Cold tea.',
        whyBuy: "It's warm & reliable.",
        tips: 'Use flat ceramic.',
        features: ['Auto shut-off'],
        bestFor: 'Tea lovers',
        verdict: 'Great value.',
        link: 'https://www.aliexpress.com/',
      },
    ]
  ) as string;

  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(generated, sandbox);
  assert.equal((sandbox.window.SITE_CONFIG as Record<string, unknown>).brandName, "VÉLORA 'COZY' FINDS");
  const prod = (sandbox.window.PRODUCTS as Array<Record<string, unknown>>)[0];
  assert.equal(prod.title, 'L\'Objet Parfait "Édition"');
  assert.equal(prod.videoUrl, 'https://vimeo.com/987654321');
});

test('gallery uploads stay preserved cleanly alongside external image URLs', () => {
  const { formatExternalUrlsForInput, mergeExternalImageUrls } = loadIndexHelpers().exports;
  const uploadA = 'data:image/jpeg;base64,/9j/AAA==';
  const extB = 'https://example.com/photo.jpg';

  assert.equal(formatExternalUrlsForInput([uploadA, extB]), extB);
  assert.deepEqual(
    Array.from(mergeExternalImageUrls([uploadA, extB], '') as string[]),
    [uploadA]
  );
  assert.deepEqual(
    Array.from(mergeExternalImageUrls([uploadA, extB], 'https://cdn.example.com/2.jpg') as string[]),
    [uploadA, 'https://cdn.example.com/2.jpg']
  );
});

test('short realistic Pinterest links stay concise and trustworthy across preview and GitHub Pages', () => {
  const { buildShortSlug, normalizeSiteBaseUrl, buildPinterestProductUrl } = loadIndexHelpers().exports;

  // Long product titles condense to clean <=28 char keywords without filler words
  const shortSlug = buildShortSlug('Minimalist Cordless Mushroom Table Lamp With Warm Dimmer For Cozy Bedrooms') as string;
  assert.ok(shortSlug.length <= 28, `Expected short slug <= 28 chars, got ${shortSlug}`);
  assert.equal(shortSlug, 'minimalist-cordless-mushroom');

  // Preview/local hostnames fall back to a clean realistic github.io domain based on brand name
  assert.equal(
    normalizeSiteBaseUrl('', 'VÉLORA FINDS', 'https://ais-dev-43frplgwiqsi3zblw4zeez-222563842972.us-west2.run.app', '/index.html'),
    'https://velora-finds.github.io'
  );

  // Live GitHub Pages repo URLs preserve repo subpath and strip /index.html cleanly
  assert.equal(
    normalizeSiteBaseUrl('', 'VÉLORA FINDS', 'https://cozyaura.github.io', '/velora-finds/index.html'),
    'https://cozyaura.github.io/velora-finds'
  );

  // Custom configured domain normalizes cleanly
  assert.equal(
    buildPinterestProductUrl('mini-pocket-printer', 'velorafinds.github.io/index.html', 'VÉLORA FINDS', 'http://localhost:3000', '/'),
    'https://velorafinds.github.io/#mini-pocket-printer'
  );
});

test('parseFeaturesInput handles Why People Love It reasons cleanly', () => {
  const { parseFeaturesInput } = loadIndexHelpers().exports;
  assert.deepEqual(
    Array.from(parseFeaturesInput('Soft ambient glow\n\nCordless USB-C charge | Compact footprint') as string[]),
    ['Soft ambient glow', 'Cordless USB-C charge', 'Compact footprint']
  );
  assert.deepEqual(
    Array.from(parseFeaturesInput(['  Reason A ', '', 'Reason B']) as string[]),
    ['Reason A', 'Reason B']
  );
});

