import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';
const SHAPES_ENDPOINT = 'https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm';
const REGIONS_ENDPOINT = 'https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm';

const SHAPE_MAP: { pattern: RegExp; sku: CanonicalSku; raw: string }[] = [
  { pattern: /BM\.GPU\.H100\.8/, sku: 'H100-SXM-80GB', raw: 'BM.GPU.H100.8' },
  { pattern: /BM\.GPU\.H200\.8/, sku: 'H200-SXM-141GB', raw: 'BM.GPU.H200.8' },
  { pattern: /BM\.GPU\.B200\.8/, sku: 'B200-SXM', raw: 'BM.GPU.B200.8' },
  { pattern: /BM\.GPU\.GB200\.4/, sku: 'GB200-PER-GPU', raw: 'BM.GPU.GB200.4' },
  { pattern: /BM\.GPU\.MI300X\.8/, sku: 'MI300X-OAM-192GB', raw: 'BM.GPU.MI300X.8' },
  { pattern: /BM\.GPU\.MI3[25]5X\.8/, sku: 'MI325X-OAM', raw: 'BM.GPU.MI355X.8' },
];

const REGION_COUNTRY: { prefix: string; country: Country }[] = [
  { prefix: 'ca-toronto', country: 'CA' },
  { prefix: 'ca-montreal', country: 'CA' },
  { prefix: 'us-', country: 'US' },
  { prefix: 'uk-london', country: 'UK' },
  { prefix: 'uk-cardiff', country: 'UK' },
  { prefix: 'eu-frankfurt', country: 'DE' },
  { prefix: 'eu-milan', country: 'IT' },
  { prefix: 'eu-turin', country: 'IT' },
  { prefix: 'eu-paris', country: 'FR' },
  { prefix: 'eu-marseille', country: 'FR' },
  { prefix: 'ap-tokyo', country: 'JP' },
  { prefix: 'ap-osaka', country: 'JP' },
];

function regionCountry(region: string): Country | null {
  for (const { prefix, country } of REGION_COUNTRY) {
    if (region.startsWith(prefix)) return country;
  }
  return null;
}

export async function runOciProbe(outDir: string): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();
  const started = Date.now();

  const [shapesRes, regionsRes] = await Promise.all([
    fetch(SHAPES_ENDPOINT, { headers: { 'user-agent': 'cgpua-probe/0.1' } }),
    fetch(REGIONS_ENDPOINT, { headers: { 'user-agent': 'cgpua-probe/0.1' } }),
  ]);
  const [shapesHtml, regionsHtml] = await Promise.all([shapesRes.text(), regionsRes.text()]);
  const elapsed = Date.now() - started;

  const combined = `${shapesHtml}\n${regionsHtml}`;
  const responseHash = createHash('sha256').update(combined).digest('hex');
  const requestHash = createHash('sha256')
    .update(`${SHAPES_ENDPOINT}|${REGIONS_ENDPOINT}`)
    .digest('hex');
  const excerpt = shapesHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  const shapesText = shapesHtml.replace(/<[^>]+>/g, ' ');
  const skusInCatalog = SHAPE_MAP.filter((s) => s.pattern.test(shapesText));

  const regionsText = regionsHtml.replace(/<[^>]+>/g, ' ');
  const regionCodes = Array.from(
    new Set(Array.from(regionsText.matchAll(/\b([a-z]{2}-[a-z]+-\d+)\b/g)).map((m) => m[1]!))
  );
  const g7Countries = new Set<Country>();
  const regionsByCountry = new Map<Country, string[]>();
  for (const r of regionCodes) {
    const c = regionCountry(r);
    if (!c) continue;
    g7Countries.add(c);
    const arr = regionsByCountry.get(c) ?? [];
    arr.push(r);
    regionsByCountry.set(c, arr);
  }

  // OCI publishes its shape catalog globally, but not per-region availability
  // without an authed GetComputeCapacityReport call. We emit one catalog-level
  // row per (country, SKU) at a synthetic region code `oci-catalog` and note
  // the real region codes in the excerpt. This avoids falsely claiming
  // "B200 is in ca-toronto-1" when the public docs only confirm the catalog
  // and the region exist independently.
  for (const country of g7Countries) {
    const regionsForCountry = (regionsByCountry.get(country) ?? []).join(', ');
    for (const shape of skusInCatalog) {
      evidence.push({
        timestamp,
        provider: 'oci',
        country,
        region: 'oci-catalog',
        sku: shape.sku,
        sku_raw: shape.raw,
        listed: true,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'catalog_read',
        endpoint: SHAPES_ENDPOINT,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt:
          `CATALOG ONLY — OCI shape ${shape.raw} listed in public catalog; ` +
          `OCI has these G7 regions for ${country}: ${regionsForCountry}; ` +
          `per-region availability unverified without authed probe. ` +
          excerpt.slice(0, 200),
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
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'oci.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runOciProbe(outDir)
    .then((records) => {
      console.log(`OCI probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('OCI probe failed:', err);
      process.exit(1);
    });
}
