import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';
const SIZES_ENDPOINT = 'https://api.digitalocean.com/v2/sizes?per_page=200';

type DoSize = {
  slug: string;
  regions: string[];
  available: boolean;
  price_hourly: number;
  gpu_info?: {
    count: number;
    model: string;
    vram: { amount: number; unit: string };
  };
};

type DoSizesResponse = {
  sizes: DoSize[];
  links?: { pages?: { next?: string } };
};

const SLUG_MATCHERS: { pattern: RegExp; sku: CanonicalSku }[] = [
  { pattern: /^gpu-h100x/i, sku: 'H100-SXM-80GB' },
  { pattern: /^gpu-h200x/i, sku: 'H200-SXM-141GB' },
  { pattern: /^gpu-b200x/i, sku: 'B200-SXM' },
  { pattern: /^gpu-mi300x/i, sku: 'MI300X-OAM-192GB' },
  { pattern: /^gpu-mi325x/i, sku: 'MI325X-OAM' },
];

const TRACKED_SKUS: CanonicalSku[] = [
  'H100-SXM-80GB',
  'H200-SXM-141GB',
  'B200-SXM',
  'MI300X-OAM-192GB',
  'MI325X-OAM',
];

// DO region slugs within the G7.
const REGION_COUNTRY: Record<string, Country> = {
  tor1: 'CA',
  nyc1: 'US',
  nyc2: 'US',
  nyc3: 'US',
  sfo1: 'US',
  sfo2: 'US',
  sfo3: 'US',
  atl1: 'US',
  ric1: 'US',
  fra1: 'DE',
  lon1: 'UK',
};

export async function runDigitalOceanAuthedProbe(outDir: string): Promise<EvidenceObject[]> {
  const token = process.env.DO_API_TOKEN;
  if (!token) {
    console.log('[digitalocean-authed] DO_API_TOKEN unset — skipping (expected for local dev).');
    return [];
  }

  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();
  const started = Date.now();

  const sizes: DoSize[] = [];
  let url: string | undefined = SIZES_ENDPOINT;
  const hasher = createHash('sha256');

  while (url) {
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        'user-agent': 'cgpua-probe/0.1 (+https://github.com/vishwamitra1971/canadian-gpu-availability)',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `DO /v2/sizes HTTP ${res.status}: ${body.slice(0, 200)}`
      );
    }
    const body = (await res.json()) as DoSizesResponse;
    // Hash only the fields we depend on, to keep response_hash stable across
    // price/feature churn that doesn't affect availability.
    hasher.update(
      JSON.stringify(
        body.sizes.map((s) => ({
          slug: s.slug,
          regions: [...s.regions].sort(),
          available: s.available,
        }))
      )
    );
    sizes.push(...body.sizes);
    url = body.links?.pages?.next;
  }

  const elapsed = Date.now() - started;
  const responseHash = hasher.digest('hex');
  const requestHash = createHash('sha256').update(SIZES_ENDPOINT).digest('hex');

  const gpuSizes: { size: DoSize; sku: CanonicalSku }[] = [];
  for (const s of sizes) {
    const matcher = SLUG_MATCHERS.find((m) => m.pattern.test(s.slug));
    if (matcher) gpuSizes.push({ size: s, sku: matcher.sku });
  }

  const totalSizes = sizes.length;
  const gpuCount = gpuSizes.length;

  for (const [region, country] of Object.entries(REGION_COUNTRY)) {
    const skusInRegion = new Map<CanonicalSku, DoSize>();
    for (const { size, sku } of gpuSizes) {
      if (!size.regions.includes(region)) continue;
      const existing = skusInRegion.get(sku);
      if (!existing || (size.available && !existing.available)) {
        skusInRegion.set(sku, size);
      }
    }

    for (const [sku, size] of skusInRegion) {
      const gpuInfo = size.gpu_info
        ? `${size.gpu_info.count}× ${size.gpu_info.model} ${size.gpu_info.vram.amount}${size.gpu_info.vram.unit}`
        : 'gpu_info unavailable';
      evidence.push({
        timestamp,
        provider: 'digitalocean',
        country,
        region,
        sku,
        sku_raw: size.slug,
        listed: true,
        launchable: size.available,
        verdict: size.available ? 'launchable' : 'quota_blocked',
        probe_type: 'sku_restrictions',
        endpoint: SIZES_ENDPOINT,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt:
          `DO /v2/sizes (authed): ${totalSizes} sizes, ${gpuCount} GPU. ` +
          `${size.slug} → region ${region} → available=${size.available}, ` +
          `$${size.price_hourly}/hr. ${gpuInfo}.`,
        probe_duration_ms: elapsed,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
    }

    for (const sku of TRACKED_SKUS) {
      if (skusInRegion.has(sku)) continue;
      evidence.push({
        timestamp,
        provider: 'digitalocean',
        country,
        region,
        sku,
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'phantom',
        probe_type: 'sku_restrictions',
        endpoint: SIZES_ENDPOINT,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt:
          `DO /v2/sizes (authed): ${sku} has no size with region=${region} in its regions[] array.`,
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
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'digitalocean-authed.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runDigitalOceanAuthedProbe(outDir)
    .then((records) => {
      console.log(`DigitalOcean authed probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('DigitalOcean authed probe failed:', err);
      process.exit(1);
    });
}
