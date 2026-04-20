import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country, Verdict } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';
const ENDPOINT = 'https://cloud.google.com/compute/docs/gpus/gpu-regions-zones';

// GCP machine-type family → canonical SKU + known verdict hint
// (Edge variants are explicitly inference-only per GCP naming.)
const MACHINE_MAP: { family: string; sku: CanonicalSku; verdict?: Verdict }[] = [
  { family: 'A4X Max', sku: 'B200-SXM' },
  { family: 'A4', sku: 'B200-SXM' },
  { family: 'A3 Ultra', sku: 'H200-SXM-141GB' },
  { family: 'A3 Mega', sku: 'H100-SXM-80GB' },
  { family: 'A3 High', sku: 'H100-SXM-80GB' },
  { family: 'A3 Edge', sku: 'H100-SXM-80GB', verdict: 'inference_only' },
];

const ZONE_COUNTRY: { prefix: string; country: Country }[] = [
  { prefix: 'northamerica-northeast1', country: 'CA' },
  { prefix: 'northamerica-northeast2', country: 'CA' },
  { prefix: 'us-', country: 'US' },
  { prefix: 'europe-west2', country: 'UK' },
  { prefix: 'europe-west3', country: 'DE' },
  { prefix: 'europe-west8', country: 'IT' },
  { prefix: 'europe-west12', country: 'IT' },
  { prefix: 'europe-west9', country: 'FR' },
  { prefix: 'europe-southwest1', country: 'FR' },
  { prefix: 'asia-northeast1', country: 'JP' },
  { prefix: 'asia-northeast2', country: 'JP' },
];

function zoneCountry(zone: string): Country | null {
  for (const { prefix, country } of ZONE_COUNTRY) {
    if (zone.startsWith(prefix)) return country;
  }
  return null;
}

function extractZones(html: string): Map<string, string[]> {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const out = new Map<string, string[]>();
  const zoneRe = /([a-z]+-[a-z0-9]+-[a-z])\s+/g;
  const marks: { zone: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = zoneRe.exec(text)) !== null) {
    marks.push({ zone: m[1]!, start: m.index + m[0].length });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i]!;
    const nextStart = marks[i + 1]?.start ?? mark.start + 500;
    const chunk = text.slice(mark.start, nextStart);
    const parts = Array.from(chunk.matchAll(/•\s*([A-Z][A-Za-z0-9+ ()\-/]*?)(?=\s*•|\s+Clear|\s{2,}[A-Z]|$)/g))
      .map((x) => x[1]!.trim())
      .filter(Boolean);
    if (parts.length > 0) out.set(mark.zone, parts);
  }
  return out;
}

function matchSku(family: string): { sku: CanonicalSku; verdict?: Verdict } | null {
  for (const entry of MACHINE_MAP) {
    if (family.startsWith(entry.family)) {
      return entry.verdict ? { sku: entry.sku, verdict: entry.verdict } : { sku: entry.sku };
    }
  }
  return null;
}

export async function runGcpProbe(outDir: string): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();
  const started = Date.now();

  const res = await fetch(ENDPOINT, {
    headers: { 'user-agent': 'cgpua-probe/0.1 (+https://github.com/vishwamitra1971/canadian-gpu-availability)' },
  });
  const html = await res.text();
  const responseHash = createHash('sha256').update(html).digest('hex');
  const requestHash = createHash('sha256').update(ENDPOINT).digest('hex');
  const elapsed = Date.now() - started;
  const excerpt = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

  if (!res.ok) {
    return evidence;
  }

  const zones = extractZones(html);
  const regionSkus = new Map<string, Map<CanonicalSku, Verdict>>();

  for (const [zone, families] of zones) {
    const country = zoneCountry(zone);
    if (!country) continue;
    const region = zone.slice(0, zone.lastIndexOf('-'));
    for (const fam of families) {
      const hit = matchSku(fam);
      if (!hit) continue;
      const key = `${country}|${region}`;
      if (!regionSkus.has(key)) regionSkus.set(key, new Map());
      const prev = regionSkus.get(key)!.get(hit.sku);
      const next: Verdict = hit.verdict ?? 'unknown';
      if (prev === 'unknown' || prev === 'launchable') continue;
      regionSkus.get(key)!.set(hit.sku, next);
    }
  }

  for (const [key, skus] of regionSkus) {
    const [country, region] = key.split('|') as [Country, string];
    for (const [sku, verdict] of skus) {
      evidence.push({
        timestamp,
        provider: 'gcp',
        country,
        region,
        sku,
        sku_raw: `gcp-doc:${region}`,
        listed: true,
        launchable: false,
        verdict,
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
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'gcp.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runGcpProbe(outDir)
    .then((records) => {
      console.log(`GCP probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('GCP probe failed:', err);
      process.exit(1);
    });
}
