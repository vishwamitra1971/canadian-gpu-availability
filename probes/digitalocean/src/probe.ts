import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';
const ENDPOINT = 'https://www.digitalocean.com/products/gpu-droplets';

const SKU_MATCHERS: { pattern: RegExp; sku: CanonicalSku }[] = [
  { pattern: /NVIDIA HGX H100/i, sku: 'H100-SXM-80GB' },
  { pattern: /NVIDIA HGX H200/i, sku: 'H200-SXM-141GB' },
  { pattern: /NVIDIA HGX B200/i, sku: 'B200-SXM' },
  { pattern: /AMD Instinct[™\s]*MI300X/i, sku: 'MI300X-OAM-192GB' },
  { pattern: /AMD Instinct[™\s]*MI325X/i, sku: 'MI325X-OAM' },
];

// DO GPU Droplet data centers, per product page.
const DATACENTERS: { code: string; country: Country | null; city: string }[] = [
  { code: 'NYC2', country: 'US', city: 'New York' },
  { code: 'TOR1', country: 'CA', city: 'Toronto' },
  { code: 'ATL1', country: 'US', city: 'Atlanta' },
  { code: 'RIC1', country: 'US', city: 'Richmond' },
  { code: 'AMS3', country: null, city: 'Amsterdam' },
];

export async function runDigitalOceanProbe(outDir: string): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();
  const started = Date.now();

  const res = await fetch(ENDPOINT, {
    headers: { 'user-agent': 'cgpua-probe/0.1 (+https://github.com/vishwamitra1971/canadian-gpu-availability)' },
  });
  const html = await res.text();
  const elapsed = Date.now() - started;
  const responseHash = createHash('sha256').update(html).digest('hex');
  const requestHash = createHash('sha256').update(ENDPOINT).digest('hex');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const excerpt = text.slice(0, 500);

  if (!res.ok) return evidence;

  const skusOnPage = new Set<CanonicalSku>();
  for (const { pattern, sku } of SKU_MATCHERS) {
    if (pattern.test(text)) skusOnPage.add(sku);
  }

  // Page asserts: "GPUs are currently available in our NYC2, TOR1, ATL1, RIC1, and AMS3 data centers"
  // We treat this as per-(data_center, GPU) listing without per-SKU regional granularity.
  // Verdict remains 'unknown' — this is a marketing-page claim, not an authed capacity probe.
  const datacentersOnPage = DATACENTERS.filter((dc) => new RegExp(`\\b${dc.code}\\b`).test(text));

  for (const dc of datacentersOnPage) {
    if (!dc.country) continue;
    for (const sku of skusOnPage) {
      evidence.push({
        timestamp,
        provider: 'digitalocean',
        country: dc.country,
        region: dc.code.toLowerCase(),
        sku,
        sku_raw: `do-product-page:${dc.code}`,
        listed: true,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'catalog_read',
        endpoint: ENDPOINT,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt: excerpt,
        probe_duration_ms: elapsed,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
    }
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'digitalocean.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runDigitalOceanProbe(outDir)
    .then((records) => {
      console.log(`DigitalOcean probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('DigitalOcean probe failed:', err);
      process.exit(1);
    });
}
