import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function extractFunction(html: string, name: string): string {
  const asyncMarker = `async function ${name}(`;
  const syncMarker = `function ${name}(`;
  let start = html.indexOf(asyncMarker);
  if (start === -1) start = html.indexOf(syncMarker);
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
    extractFunction(indexHtml, 'normalizeProductImages'),
    extractFunction(indexHtml, 'detectGitHubDefaults'),
    extractFunction(indexHtml, 'buildGitHubRawFallbackUrl'),
    extractFunction(indexHtml, 'extractBase64FromDataUrl'),
    extractFunction(indexHtml, 'encodeUtf8ToBase64'),
    extractFunction(indexHtml, 'decodeBase64ToUtf8'),
    extractFunction(indexHtml, 'extractJsonArrayAfterMarker'),
    extractFunction(indexHtml, 'parseProduitsJsData'),
    extractFunction(indexHtml, 'mergeProductsPreservingExisting'),
    extractFunction(indexHtml, 'buildGitHubImagePath'),
    extractFunction(indexHtml, 'formatGitHubApiError'),
    extractFunction(indexHtml, 'testGitHubConnection'),
    extractFunction(indexHtml, 'publishToGitHubSequential'),
    'module.exports = { clampNum, normalizePhotoStyle, sanitizeUrl, slugify, buildShortSlug, normalizeSiteBaseUrl, splitTips, parseFeaturesInput, parseVideoSource, buildSharpnessKernel, buildPhotoFilterCss, buildPinterestProductUrl, formatExternalUrlsForInput, parseImagesCsv, mergeExternalImageUrls, generateProduitsJsContent, normalizeProductImages, detectGitHubDefaults, buildGitHubRawFallbackUrl, extractBase64FromDataUrl, encodeUtf8ToBase64, decodeBase64ToUtf8, extractJsonArrayAfterMarker, parseProduitsJsData, mergeProductsPreservingExisting, buildGitHubImagePath, formatGitHubApiError, testGitHubConnection, publishToGitHubSequential };',
  ].join('\n\n');

  const sandbox: Record<string, unknown> = {
    module: { exports: {} },
    TextEncoder,
    TextDecoder,
    btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
    atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
    fetch: () => Promise.reject(new Error('unexpected global fetch')),
  };
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
  assert.ok(
    (typeof cfg.adminPin === 'string' && cfg.adminPin.length > 0) ||
      (typeof cfg.adminPassHash === 'string' && cfg.adminPassHash.startsWith('velora-v1$')),
    'SITE_CONFIG should define adminPin or adminPassHash'
  );

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

test('detectGitHubDefaults, extractBase64FromDataUrl, and encodeUtf8ToBase64 work accurately', () => {
  const { detectGitHubDefaults, extractBase64FromDataUrl, encodeUtf8ToBase64, buildGitHubImagePath } =
    loadIndexHelpers().exports;

  assert.deepEqual(
    JSON.parse(JSON.stringify(detectGitHubDefaults('CozyAura.github.io', '/velora-finds/index.html'))),
    { owner: 'cozyaura', repo: 'velora-finds' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(detectGitHubDefaults('cozyaura.github.io', '/index.html'))),
    { owner: 'cozyaura', repo: '' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(detectGitHubDefaults('localhost', '/'))),
    { owner: '', repo: '' }
  );

  assert.equal(extractBase64FromDataUrl('data:image/jpeg;base64,/9j/4AAQ=='), '/9j/4AAQ==');
  assert.equal(extractBase64FromDataUrl('images/lamp-0-123.jpg'), null);
  assert.equal(extractBase64FromDataUrl('https://cdn.example.com/photo.jpg'), null);

  assert.equal(
    buildGitHubImagePath('Mini Pocket Printer', 0, 1700000000000),
    'images/mini-pocket-printer-0-1700000000000.jpg'
  );

  const sampleUtf8 = 'VÉLORA FINDS — 🔥 Édition Cozy & Café';
  const encoded = encodeUtf8ToBase64(sampleUtf8) as string;
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), sampleUtf8);
});

test('publishToGitHubSequential uploads images sequentially, replaces DataURLs, handles 200 & 404 sha, and never leaks token', async () => {
  const { publishToGitHubSequential } = loadIndexHelpers().exports;

  const calls: Array<{ url: string; method: string; cache?: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const fakeFetch = async (url: string, init: Record<string, unknown>) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    const parsedBody = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({
      url,
      method: String(init.method || 'GET'),
      cache: init.cache ? String(init.cache) : undefined,
      headers: (init.headers || {}) as Record<string, string>,
      body: parsedBody,
    });
    inFlight--;

    if (url.endsWith('/contents/produits.js') && init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: 'sha-existing-123' }),
      };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ content: { sha: 'new-sha' } }),
    };
  };

  let tick = 1700000001000;
  const progresses: string[] = [];
  const products = [
    {
      id: 'cozy-lamp',
      title: 'Cozy Lamp',
      price: '$24.00',
      category: 'Cozy Lighting',
      rating: '4.9',
      isBestSeller: true,
      badge: '🔥 Best Seller',
      shortDesc: 'Warm light.',
      images: ['data:image/jpeg;base64,QUJDRA==', 'images/already-uploaded.jpg', 'data:image/png;base64,RVJHSA=='],
      photoStyle: { brightness: 105, contrast: 105, saturate: 110, sharpness: 20 },
      videoUrl: '',
      problemSolved: 'Dark room.',
      whyBuy: 'Soft glow.',
      tips: 'Dim before sleep.',
      features: ['Cordless'],
      bestFor: 'Bedrooms',
      verdict: 'Worth it.',
      link: 'https://example.com/lamp',
    },
  ];

  const result = (await publishToGitHubSequential({
    owner: 'myuser',
    repo: 'velora-site',
    token: 'github_pat_SUPER_SECRET_123',
    config: { brandName: 'VÉLORA FINDS', tagline: 'Cozy', email: 'a@b.com', theme: 'cream-terracotta', adminPin: '2027' },
    products,
    fetchImpl: fakeFetch,
    nowFn: () => ++tick,
    onProgress: (m: string) => progresses.push(m),
  })) as Record<string, unknown>;

  // Strictly sequential: never more than 1 in-flight request
  assert.equal(maxInFlight, 1);
  assert.equal(calls.length, 4); // 2 images + 1 GET produits.js + 1 PUT produits.js
  assert.equal(result.uploadedImages, 2);
  assert.equal(result.created, false);

  // Step A checks
  assert.equal(calls[0].method, 'PUT');
  assert.equal(
    calls[0].url,
    'https://api.github.com/repos/myuser/velora-site/contents/images/cozy-lamp-0-1700000001001.jpg'
  );
  assert.equal(calls[0].headers.Authorization, 'Bearer github_pat_SUPER_SECRET_123');
  assert.equal(calls[0].body?.content, 'QUJDRA==');

  assert.equal(calls[1].method, 'PUT');
  assert.equal(
    calls[1].url,
    'https://api.github.com/repos/myuser/velora-site/contents/images/cozy-lamp-2-1700000001002.jpg'
  );
  assert.equal(calls[1].body?.content, 'RVJHSA==');

  // Product images replaced with relative paths while keeping existing image untouched
  assert.deepEqual(Array.from(products[0].images as string[]), [
    'images/cozy-lamp-0-1700000001001.jpg',
    'images/already-uploaded.jpg',
    'images/cozy-lamp-2-1700000001002.jpg',
  ]);

  // Step B check: GET with cache: 'no-store'
  assert.equal(calls[2].method, 'GET');
  assert.equal(calls[2].cache, 'no-store');
  assert.equal(calls[2].url, 'https://api.github.com/repos/myuser/velora-site/contents/produits.js');

  // Step C check: PUT produits.js with sha and UTF-8 JSON without secret token
  assert.equal(calls[3].method, 'PUT');
  assert.equal(calls[3].body?.sha, 'sha-existing-123');
  const decodedJs = Buffer.from(String(calls[3].body?.content), 'base64').toString('utf8');
  assert.ok(decodedJs.includes('"images/cozy-lamp-0-1700000001001.jpg"'));
  assert.ok(!decodedJs.includes('data:image/'));
  assert.ok(!decodedJs.includes('github_pat_SUPER_SECRET_123'));

  // Step D progress messages
  assert.ok(progresses.some((p) => p.includes('Envoi des photos')));
  assert.ok(progresses.some((p) => p.includes('Mise à jour du site')));
  assert.equal(progresses[progresses.length - 1], '✅ En ligne dans ~45 secondes !');

  // 404 on GET produits.js omits sha so PUT creates file automatically
  const calls404: Array<Record<string, unknown>> = [];
  const fetch404 = async (url: string, init: Record<string, unknown>) => {
    calls404.push({ url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (init.method === 'GET') return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const res404 = (await publishToGitHubSequential({
    owner: 'myuser',
    repo: 'new-repo',
    token: 'tok',
    config: { brandName: 'VÉLORA FINDS' },
    products: [],
    fetchImpl: fetch404,
  })) as Record<string, unknown>;
  assert.equal(res404.created, true);
  assert.equal((calls404[1].body as Record<string, unknown>).sha, undefined);
});

test('index.html preserves relative src="produits.js" and full keyboard inputmode="text" on admin unlock', () => {
  assert.ok(indexHtml.includes('<script src="produits.js"></script>'));
  assert.ok(!indexHtml.includes('<script src="/produits.js"></script>'));
  assert.ok(indexHtml.includes('id="adminPinInput"'));
  const pinSnippet = indexHtml.slice(indexHtml.indexOf('id="adminPinInput"'), indexHtml.indexOf('id="adminPinInput"') + 220);
  assert.ok(pinSnippet.includes('inputmode="text"'));
  assert.ok(!pinSnippet.includes('inputmode="numeric"'));
});

test('testGitHubConnection validates token, repo, and write permissions accurately', async () => {
  const { testGitHubConnection } = loadIndexHelpers().exports;

  const okMsg = await testGitHubConnection({
    owner: 'velora',
    repo: 'shop',
    token: 'github_pat_ok',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ full_name: 'velora/shop', permissions: { pull: true, push: true } }),
    }),
  });
  assert.equal(okMsg, '✅ Connexion réussie à velora/shop !');

  await assert.rejects(
    async () =>
      await (testGitHubConnection({
        owner: 'velora',
        repo: 'shop',
        token: 'bad',
        fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) }),
      }) as Promise<unknown>),
    /401/
  );

  await assert.rejects(
    async () =>
      await (testGitHubConnection({
        owner: 'velora',
        repo: 'wrong-repo',
        token: 'tok',
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not Found' }) }),
      }) as Promise<unknown>),
    /404/
  );

  await assert.rejects(
    async () =>
      await (testGitHubConnection({
        owner: 'velora',
        repo: 'shop',
        token: 'readonly-tok',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ permissions: { pull: true, push: false } }),
        }),
      }) as Promise<unknown>),
    /Contents: Read and write/
  );
});

test('publishToGitHubSequential merges remote products without erasing old ones, respects explicit deletes, and aborts on image error', async () => {
  const { publishToGitHubSequential, generateProduitsJsContent, encodeUtf8ToBase64, normalizeProductImages } =
    loadIndexHelpers().exports;

  assert.deepEqual(
    Array.from(normalizeProductImages({ image: 'images/a.jpg', gallery: ['images/b.jpg', 'images/a.jpg'] }) as string[]),
    ['images/a.jpg', 'images/b.jpg']
  );

  const remoteJs = generateProduitsJsContent(
    { brandName: 'VÉLORA FINDS' },
    [
      { id: 'old-product-1', title: 'Old Product 1', images: ['images/old-1.jpg'] },
      { id: 'old-deleted-2', title: 'Old Deleted 2', images: ['images/old-2.jpg'] },
    ]
  ) as string;
  const remoteBase64 = encodeUtf8ToBase64(remoteJs) as string;

  let putBodySaved: Record<string, unknown> | null = null;
  const result = (await publishToGitHubSequential({
    owner: 'velora',
    repo: 'shop',
    token: 'tok',
    config: { brandName: 'VÉLORA FINDS' },
    products: [{ id: 'new-product-3', title: 'New Product 3', images: ['data:image/jpeg;base64,QUJD'] }],
    deletedIds: ['old-deleted-2'],
    fetchImpl: async (url: string, init: Record<string, unknown>) => {
      if (init.method === 'GET' && url.endsWith('/contents/produits.js')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sha: 'sha-remote-77', content: remoteBase64 }),
        };
      }
      if (init.method === 'PUT' && url.endsWith('/contents/produits.js')) {
        putBodySaved = JSON.parse(String(init.body));
      }
      return { ok: true, status: 201, json: async () => ({}) };
    },
  })) as Record<string, unknown>;

  assert.ok(putBodySaved);
  const finalJs = Buffer.from(String((putBodySaved as Record<string, unknown>).content), 'base64').toString('utf8');
  assert.ok(finalJs.includes('"new-product-3"'));
  assert.ok(finalJs.includes('"old-product-1"'), 'Previously published remote product must be preserved');
  assert.ok(!finalJs.includes('"old-deleted-2"'), 'Explicitly deleted product must remain removed');
  assert.equal((result.products as Array<Record<string, unknown>>).length, 2);

  // Abort on failed image PUT: produits.js must NEVER be fetched or updated
  const abortedCalls: string[] = [];
  await assert.rejects(
    async () =>
      await (publishToGitHubSequential({
        owner: 'velora',
        repo: 'shop',
        token: 'tok',
        config: { brandName: 'VÉLORA FINDS' },
        products: [{ id: 'broken-img', title: 'Broken', images: ['data:image/jpeg;base64,QUJD'] }],
        fetchImpl: async (url: string, init: Record<string, unknown>) => {
          abortedCalls.push(String(init.method) + ' ' + url);
          return { ok: false, status: 403, json: async () => ({ message: 'Resource not accessible by personal access token' }) };
        },
      }) as Promise<unknown>),
    /Contents: Read and write/
  );
  assert.equal(abortedCalls.length, 1, 'Should stop immediately after image PUT error without updating produits.js');
});

test('3-column responsive grid, auto-floating multi-angle gallery, 3-photo admin slots, raw image fallbacks, and Explore Find CTA are intact', () => {
  const { buildGitHubRawFallbackUrl } = loadIndexHelpers().exports;

  assert.equal(
    buildGitHubRawFallbackUrl('images/lamp-0-123.jpg', 'cozyuser', 'velora-finds', '', ''),
    'https://raw.githubusercontent.com/cozyuser/velora-finds/main/images/lamp-0-123.jpg'
  );
  assert.equal(
    buildGitHubRawFallbackUrl('./images/lamp-0-123.jpg', '', '', 'cozyuser.github.io', '/shop/index.html'),
    'https://raw.githubusercontent.com/cozyuser/shop/main/images/lamp-0-123.jpg'
  );
  assert.equal(
    buildGitHubRawFallbackUrl('images/lamp-0-123.jpg', '', '', 'cozyuser.github.io', '/'),
    'https://raw.githubusercontent.com/cozyuser/cozyuser.github.io/main/images/lamp-0-123.jpg'
  );
  assert.equal(buildGitHubRawFallbackUrl('data:image/jpeg;base64,/9j/', 'cozyuser', 'shop', '', ''), '');

  assert.ok(indexHtml.includes('.product-grid{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr))'));
  assert.ok(indexHtml.includes('.related-grid{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr))'));
  assert.ok(indexHtml.includes('.slice(0, 3)'));
  assert.ok(indexHtml.includes('Explore Find →'));
  assert.ok(!indexHtml.includes('View →'));
  assert.ok(indexHtml.includes('@keyframes veloraCtaFloat'));
  assert.ok(indexHtml.includes('flex-direction:column;align-items:center;justify-content:center;text-align:center'));
  assert.ok(indexHtml.includes('@keyframes veloraSoftFloat'));
  assert.ok(indexHtml.includes('detailAutoFloatTimer'));
  assert.ok(indexHtml.includes('stopDetailAutoFloat'));
  assert.ok(indexHtml.includes('id="adminPhotoSlots"'));
  assert.ok(indexHtml.includes('Photo 1 (Principale)'));
  assert.ok(indexHtml.includes('PREVIEW_CACHE_KEY'));
  assert.ok(indexHtml.includes('id="galleryPrevBtn"'));
  assert.ok(indexHtml.includes('id="galleryNextBtn"'));
  assert.ok(indexHtml.includes('class="gallery-dots"'));
  assert.ok(indexHtml.includes('class="card-photo-count"'));

  const amazonPhrase = 'As an Amazon Associate I earn from qualifying purchases.';
  const occurrences = indexHtml.split(amazonPhrase).length - 1;
  assert.ok(occurrences >= 2, `Expected Amazon disclosure in footer and modal, found ${occurrences}`);
  assert.ok(indexHtml.includes('placeholder="Ex: Under $25 ou Check Price"'));
});




