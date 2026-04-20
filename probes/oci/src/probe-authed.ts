import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';
import * as common from 'oci-common';
import * as core from 'oci-core';
import * as identity from 'oci-identity';

const PROBE_VERSION = '0.1.0';

const SHAPE_MAP: { pattern: RegExp; sku: CanonicalSku; raw: string }[] = [
  { pattern: /^BM\.GPU\.H100\.8$/, sku: 'H100-SXM-80GB', raw: 'BM.GPU.H100.8' },
  { pattern: /^BM\.GPU\.H200\.8$/, sku: 'H200-SXM-141GB', raw: 'BM.GPU.H200.8' },
  { pattern: /^BM\.GPU\.B200\.8$/, sku: 'B200-SXM', raw: 'BM.GPU.B200.8' },
  { pattern: /^BM\.GPU\.GB200\.4$/, sku: 'GB200-PER-GPU', raw: 'BM.GPU.GB200.4' },
  { pattern: /^BM\.GPU\.MI300X\.8$/, sku: 'MI300X-OAM-192GB', raw: 'BM.GPU.MI300X.8' },
  { pattern: /^BM\.GPU\.MI3[25]5X\.8$/, sku: 'MI325X-OAM', raw: 'BM.GPU.MI355X.8' },
];

const TRACKED_SKUS: CanonicalSku[] = [
  'H100-SXM-80GB',
  'H200-SXM-141GB',
  'B200-SXM',
  'GB200-PER-GPU',
  'MI300X-OAM-192GB',
  'MI325X-OAM',
];

// G7 OCI regions. RegionId strings are stable and don't require SDK enum lookup.
const G7_REGIONS: { id: string; country: Country }[] = [
  { id: 'ca-toronto-1', country: 'CA' },
  { id: 'ca-montreal-1', country: 'CA' },
  { id: 'us-ashburn-1', country: 'US' },
  { id: 'us-phoenix-1', country: 'US' },
  { id: 'us-chicago-1', country: 'US' },
  { id: 'us-sanjose-1', country: 'US' },
  { id: 'uk-london-1', country: 'UK' },
  { id: 'uk-cardiff-1', country: 'UK' },
  { id: 'eu-frankfurt-1', country: 'DE' },
  { id: 'eu-milan-1', country: 'IT' },
  { id: 'eu-turin-1', country: 'IT' },
  { id: 'eu-paris-1', country: 'FR' },
  { id: 'eu-marseille-1', country: 'FR' },
  { id: 'ap-tokyo-1', country: 'JP' },
  { id: 'ap-osaka-1', country: 'JP' },
];

function matchShape(name: string): { sku: CanonicalSku; raw: string } | null {
  for (const m of SHAPE_MAP) {
    if (m.pattern.test(name)) return { sku: m.sku, raw: m.raw };
  }
  return null;
}

type RegionResult = {
  regionId: string;
  country: Country;
  shapesByAd: Map<string, Set<string>>;
  shapeCount: number;
  adCount: number;
  error?: string;
};

async function probeRegion(
  provider: common.SimpleAuthenticationDetailsProvider,
  tenancyId: string,
  region: { id: string; country: Country }
): Promise<RegionResult> {
  const result: RegionResult = {
    regionId: region.id,
    country: region.country,
    shapesByAd: new Map(),
    shapeCount: 0,
    adCount: 0,
  };

  try {
    const ociRegion = common.Region.fromRegionId(region.id);
    const idClient = new identity.IdentityClient({ authenticationDetailsProvider: provider });
    idClient.region = ociRegion;
    const computeClient = new core.ComputeClient({ authenticationDetailsProvider: provider });
    computeClient.region = ociRegion;

    const ads = await idClient.listAvailabilityDomains({ compartmentId: tenancyId });
    result.adCount = ads.items.length;

    for (const ad of ads.items) {
      if (!ad.name) continue;
      const shapes = await computeClient.listShapes({
        compartmentId: tenancyId,
        availabilityDomain: ad.name,
      });
      const shapeNames = new Set<string>();
      for (const s of shapes.items) {
        if (s.shape) shapeNames.add(s.shape);
      }
      result.shapesByAd.set(ad.name, shapeNames);
      result.shapeCount += shapeNames.size;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

export async function runOciAuthedProbe(outDir: string): Promise<EvidenceObject[]> {
  const tenancyId = process.env.OCI_TENANCY_OCID;
  const userId = process.env.OCI_USER_OCID;
  const fingerprint = process.env.OCI_FINGERPRINT;
  const privateKey = process.env.OCI_PRIVATE_KEY;

  if (!tenancyId || !userId || !fingerprint || !privateKey) {
    console.log(
      '[oci-authed] Missing OCI_{TENANCY_OCID,USER_OCID,FINGERPRINT,PRIVATE_KEY} — skipping.'
    );
    return [];
  }

  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();
  const started = Date.now();

  const provider = new common.SimpleAuthenticationDetailsProvider(
    tenancyId,
    userId,
    fingerprint,
    privateKey,
    null,
    common.Region.CA_TORONTO_1
  );

  const regionResults: RegionResult[] = [];
  for (const region of G7_REGIONS) {
    regionResults.push(await probeRegion(provider, tenancyId, region));
  }

  const elapsed = Date.now() - started;

  const requestHash = createHash('sha256')
    .update(`oci:listShapes:${G7_REGIONS.map((r) => r.id).join(',')}`)
    .digest('hex');

  const responseHash = createHash('sha256')
    .update(
      JSON.stringify(
        regionResults.map((r) => ({
          region: r.regionId,
          ads: Array.from(r.shapesByAd.entries()).map(([ad, shapes]) => ({
            ad,
            shapes: Array.from(shapes).sort(),
          })),
          error: r.error ?? null,
        }))
      )
    )
    .digest('hex');

  for (const r of regionResults) {
    if (r.error) {
      // Region not subscribed, IAM blocked, or network issue. Emit a single
      // diagnostic record so the dashboard can see the failure — listed=false
      // so the unauthed oci-catalog rows still carry the story.
      evidence.push({
        timestamp,
        provider: 'oci',
        country: r.country,
        region: r.regionId,
        sku: 'H100-SXM-80GB',
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'sku_restrictions',
        endpoint: `https://iaas.${r.regionId}.oraclecloud.com/`,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt: `OCI authed probe error for ${r.regionId}: ${r.error.slice(0, 300)}`,
        probe_duration_ms: elapsed,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
      continue;
    }

    // Aggregate across ADs: a SKU is launchable in the region if any AD lists it.
    const launchableSkus = new Map<CanonicalSku, { raw: string; ad: string }>();
    for (const [ad, shapes] of r.shapesByAd) {
      for (const shape of shapes) {
        const match = matchShape(shape);
        if (match && !launchableSkus.has(match.sku)) {
          launchableSkus.set(match.sku, { raw: shape, ad });
        }
      }
    }

    for (const [sku, info] of launchableSkus) {
      evidence.push({
        timestamp,
        provider: 'oci',
        country: r.country,
        region: r.regionId,
        sku,
        sku_raw: info.raw,
        listed: true,
        launchable: true,
        verdict: 'launchable',
        probe_type: 'sku_restrictions',
        endpoint: `https://iaas.${r.regionId}.oraclecloud.com/20160918/shapes`,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt:
          `OCI authed ListShapes: ${r.regionId} has ${r.adCount} AD(s), ` +
          `${r.shapeCount} shape-AD pairs total. ${info.raw} listed in AD ${info.ad}, ` +
          `tenancy authorized to launch.`,
        probe_duration_ms: elapsed,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
    }

    // Phantom rows for tracked SKUs this region/tenancy cannot launch.
    for (const sku of TRACKED_SKUS) {
      if (launchableSkus.has(sku)) continue;
      evidence.push({
        timestamp,
        provider: 'oci',
        country: r.country,
        region: r.regionId,
        sku,
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'phantom',
        probe_type: 'sku_restrictions',
        endpoint: `https://iaas.${r.regionId}.oraclecloud.com/20160918/shapes`,
        request_hash: requestHash,
        response_hash: responseHash,
        response_excerpt:
          `OCI authed ListShapes: ${sku} not present in any of ${r.adCount} AD(s) ` +
          `for region ${r.regionId} under this tenancy.`,
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
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'oci-authed.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runOciAuthedProbe(outDir)
    .then((records) => {
      console.log(`OCI authed probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('OCI authed probe failed:', err);
      process.exit(1);
    });
}
