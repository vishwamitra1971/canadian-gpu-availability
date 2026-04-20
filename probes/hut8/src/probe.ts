import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';

const PAGES: { url: string; label: string }[] = [
  { url: 'https://hut8.com/', label: 'home' },
  { url: 'https://hut8.com/our-business/high-performance-computing/', label: 'hpc' },
];

const SKU_PATTERNS: { pattern: RegExp; canonical: CanonicalSku }[] = [
  { pattern: /h100/i, canonical: 'H100-SXM-80GB' },
  { pattern: /h200/i, canonical: 'H200-SXM-141GB' },
  { pattern: /b200/i, canonical: 'B200-SXM' },
  { pattern: /b100/i, canonical: 'B100-SXM' },
  { pattern: /mi300x/i, canonical: 'MI300X-OAM-192GB' },
];

type PageResult = {
  url: string;
  label: string;
  status: number;
  bodyText: string;
  elapsed: number;
  error?: string;
};

async function fetchPage(url: string, label: string): Promise<PageResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'cgpua-probe/0.1 (+https://github.com/vishwamitra1971/canadian-gpu-availability)' },
    });
    const bodyText = await res.text();
    return {
      url,
      label,
      status: res.status,
      bodyText,
      elapsed: Date.now() - started,
    };
  } catch (err) {
    return {
      url,
      label,
      status: 0,
      bodyText: '',
      elapsed: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runHut8Probe(outDir: string): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();

  const pages = await Promise.all(PAGES.map((p) => fetchPage(p.url, p.label)));
  const combined = pages.map((p) => p.bodyText).join('\n');

  const skusFound = new Set<CanonicalSku>();
  for (const { pattern, canonical } of SKU_PATTERNS) {
    if (pattern.test(combined)) skusFound.add(canonical);
  }

  const primary = pages[0];
  const endpoint = primary.url;
  const responseHash = createHash('sha256')
    .update(pages.map((p) => p.bodyText).join('|'))
    .digest('hex');
  const excerpt = primary.bodyText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  const uniqueCanonicals = Array.from(new Set(SKU_PATTERNS.map((s) => s.canonical)));
  for (const canonical of uniqueCanonicals) {
    const listed = skusFound.has(canonical);
    evidence.push({
      timestamp,
      provider: 'hut8',
      country: 'CA',
      region: 'hut8-canada',
      sku: canonical,
      sku_raw: listed ? canonical : '',
      listed,
      launchable: false,
      verdict: listed ? 'unknown' : 'phantom',
      probe_type: 'badge_scrape',
      endpoint,
      request_hash: createHash('sha256').update(PAGES.map((p) => p.url).join('|')).digest('hex'),
      response_hash: responseHash,
      response_excerpt: excerpt,
      probe_duration_ms: pages.reduce((s, p) => s + p.elapsed, 0),
      probe_version: PROBE_VERSION,
      taxonomy_version: TAXONOMY_VERSION,
    });
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'hut8.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runHut8Probe(outDir)
    .then((records) => {
      console.log(`Hut 8 probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('Hut 8 probe failed:', err);
      process.exit(1);
    });
}
