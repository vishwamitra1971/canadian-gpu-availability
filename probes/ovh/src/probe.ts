import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  EvidenceObject,
  CanonicalSku,
  Country,
} from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';

type OvhSubsidiary = {
  subsidiary: string;
  country: Country;
  host: string;
};

const SUBSIDIARIES: OvhSubsidiary[] = [
  { subsidiary: 'CA', country: 'CA', host: 'ca.api.ovh.com' },
  { subsidiary: 'US', country: 'US', host: 'api.us.ovhcloud.com' },
  { subsidiary: 'GB', country: 'UK', host: 'eu.api.ovh.com' },
  { subsidiary: 'FR', country: 'FR', host: 'eu.api.ovh.com' },
  { subsidiary: 'DE', country: 'DE', host: 'eu.api.ovh.com' },
  { subsidiary: 'IT', country: 'IT', host: 'eu.api.ovh.com' },
];

const SKU_PATTERNS: { pattern: RegExp; canonical: CanonicalSku }[] = [
  { pattern: /h100/i, canonical: 'H100-SXM-80GB' },
  { pattern: /h200/i, canonical: 'H200-SXM-141GB' },
  { pattern: /b200/i, canonical: 'B200-SXM' },
  { pattern: /b100/i, canonical: 'B100-SXM' },
  { pattern: /mi300x/i, canonical: 'MI300X-OAM-192GB' },
  { pattern: /mi325x/i, canonical: 'MI325X-OAM' },
];

type OvhPlan = {
  planCode: string;
  invoiceName?: string;
  product?: string;
  blobs?: unknown;
};

type OvhCatalog = {
  plans?: OvhPlan[];
  addons?: OvhPlan[];
};

function matchSku(
  ...fields: (string | undefined)[]
): { sku: CanonicalSku; raw: string } | null {
  const haystack = fields.filter(Boolean).join(' ');
  for (const { pattern, canonical } of SKU_PATTERNS) {
    if (pattern.test(haystack)) {
      return { sku: canonical, raw: haystack.slice(0, 200) };
    }
  }
  return null;
}

async function probeSubsidiary(
  sub: OvhSubsidiary
): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const endpoint = `https://${sub.host}/1.0/order/catalog/public/cloud?ovhSubsidiary=${sub.subsidiary}`;
  const started = Date.now();
  const timestamp = new Date().toISOString();
  const requestHash = createHash('sha256').update(endpoint).digest('hex');

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`OVH ${res.status} ${res.statusText}`);
    }
    const bodyText = await res.text();
    const responseHash = createHash('sha256').update(bodyText).digest('hex');
    const data = JSON.parse(bodyText) as OvhCatalog;
    const elapsed = Date.now() - started;

    const entries: OvhPlan[] = [
      ...(data.plans ?? []),
      ...(data.addons ?? []),
    ];

    const matches = new Map<string, CanonicalSku>();
    for (const p of entries) {
      const hit = matchSku(p.planCode, p.invoiceName, p.product);
      if (hit) {
        if (!matches.has(p.planCode)) {
          matches.set(p.planCode, hit.sku);
        }
      }
    }

    if (matches.size === 0) {
      const uniqueCanonicals = Array.from(new Set(SKU_PATTERNS.map((s) => s.canonical)));
      for (const canonical of uniqueCanonicals) {
        evidence.push({
          timestamp,
          provider: 'ovh',
          country: sub.country,
          region: `ovh-${sub.subsidiary.toLowerCase()}`,
          sku: canonical,
          sku_raw: '',
          listed: false,
          launchable: false,
          verdict: 'phantom',
          probe_type: 'catalog_read',
          endpoint,
          request_hash: requestHash,
          response_hash: responseHash,
          response_excerpt: bodyText.slice(0, 500),
          probe_duration_ms: elapsed,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    } else {
      for (const [planCode, sku] of matches.entries()) {
        evidence.push({
          timestamp,
          provider: 'ovh',
          country: sub.country,
          region: `ovh-${sub.subsidiary.toLowerCase()}`,
          sku,
          sku_raw: planCode,
          listed: true,
          launchable: false,
          verdict: 'unknown',
          probe_type: 'catalog_read',
          endpoint,
          request_hash: requestHash,
          response_hash: responseHash,
          response_excerpt: bodyText.slice(0, 500),
          probe_duration_ms: elapsed,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    }
  } catch (err) {
    const elapsed = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const uniqueCanonicals = Array.from(new Set(SKU_PATTERNS.map((s) => s.canonical)));
    for (const canonical of uniqueCanonicals) {
      evidence.push({
        timestamp,
        provider: 'ovh',
        country: sub.country,
        region: `ovh-${sub.subsidiary.toLowerCase()}`,
        sku: canonical,
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'catalog_read',
        endpoint,
        request_hash: requestHash,
        response_hash: '',
        response_excerpt: message,
        probe_duration_ms: elapsed,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
    }
  }
  return evidence;
}

export async function runOvhProbe(outDir: string): Promise<EvidenceObject[]> {
  const all: EvidenceObject[] = [];
  for (const sub of SUBSIDIARIES) {
    const ev = await probeSubsidiary(sub);
    all.push(...ev);
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'ovh.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(all, null, 2));
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runOvhProbe(outDir)
    .then((records) => {
      console.log(`OVH probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('OVH probe failed:', err);
      process.exit(1);
    });
}
