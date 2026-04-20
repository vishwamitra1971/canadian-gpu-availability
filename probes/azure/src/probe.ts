import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  EvidenceObject,
  CanonicalSku,
} from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';

type AzureRegion = {
  armRegionName: string;
  country: 'CA' | 'US' | 'UK' | 'FR' | 'DE' | 'IT' | 'JP';
};

const REGIONS: AzureRegion[] = [
  { armRegionName: 'canadacentral', country: 'CA' },
  { armRegionName: 'canadaeast', country: 'CA' },
  { armRegionName: 'eastus', country: 'US' },
  { armRegionName: 'westus3', country: 'US' },
  { armRegionName: 'uksouth', country: 'UK' },
  { armRegionName: 'francecentral', country: 'FR' },
  { armRegionName: 'germanywestcentral', country: 'DE' },
  { armRegionName: 'italynorth', country: 'IT' },
  { armRegionName: 'japaneast', country: 'JP' },
];

const SKU_PATTERNS: { pattern: string; canonical: CanonicalSku }[] = [
  { pattern: 'H100', canonical: 'H100-SXM-80GB' },
  { pattern: 'H200', canonical: 'H200-SXM-141GB' },
  { pattern: 'B200', canonical: 'B200-SXM' },
  { pattern: 'B100', canonical: 'B100-SXM' },
  { pattern: 'MI300X', canonical: 'MI300X-OAM-192GB' },
];

type AzurePriceItem = {
  armRegionName: string;
  armSkuName: string;
  skuName: string;
  productName: string;
  serviceName: string;
  type: string;
};

async function fetchAzurePrices(region: string): Promise<AzurePriceItem[]> {
  const items: AzurePriceItem[] = [];
  const base =
    'https://prices.azure.com/api/retail/prices?$filter=' +
    `armRegionName eq '${region}' and serviceName eq 'Virtual Machines'`;
  let url: string | undefined = base;

  let pageCount = 0;
  while (url && pageCount < 10) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Azure API ${res.status} ${res.statusText}`);
    }
    const data: { Items: AzurePriceItem[]; NextPageLink?: string } =
      await res.json();
    items.push(...data.Items);
    url = data.NextPageLink;
    pageCount += 1;
  }
  return items;
}

function extractGpuSkus(items: AzurePriceItem[]): {
  sku: CanonicalSku;
  sku_raw: string;
}[] {
  const seen = new Map<string, CanonicalSku>();
  for (const item of items) {
    for (const { pattern, canonical } of SKU_PATTERNS) {
      const haystack = `${item.armSkuName} ${item.skuName} ${item.productName}`;
      if (haystack.includes(pattern)) {
        if (!seen.has(item.armSkuName)) {
          seen.set(item.armSkuName, canonical);
        }
      }
    }
  }
  return Array.from(seen.entries()).map(([sku_raw, sku]) => ({ sku, sku_raw }));
}

async function probeRegion(region: AzureRegion): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const endpoint = `https://prices.azure.com/api/retail/prices?$filter=armRegionName eq '${region.armRegionName}' and serviceName eq 'Virtual Machines'`;
  const started = Date.now();

  try {
    const items = await fetchAzurePrices(region.armRegionName);
    const elapsed = Date.now() - started;
    const gpuSkus = extractGpuSkus(items);
    const responseBody = JSON.stringify(items).slice(0, 500);
    const responseHash = createHash('sha256')
      .update(JSON.stringify(items))
      .digest('hex');

    if (gpuSkus.length === 0) {
      for (const { canonical } of SKU_PATTERNS) {
        evidence.push({
          timestamp: new Date().toISOString(),
          provider: 'azure',
          country: region.country,
          region: region.armRegionName,
          sku: canonical,
          sku_raw: '',
          listed: false,
          launchable: false,
          verdict: 'phantom',
          probe_type: 'catalog_read',
          endpoint,
          request_hash: createHash('sha256').update(endpoint).digest('hex'),
          response_hash: responseHash,
          response_excerpt: responseBody,
          probe_duration_ms: elapsed,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    } else {
      for (const { sku, sku_raw } of gpuSkus) {
        evidence.push({
          timestamp: new Date().toISOString(),
          provider: 'azure',
          country: region.country,
          region: region.armRegionName,
          sku,
          sku_raw,
          listed: true,
          launchable: false,
          verdict: 'unknown',
          probe_type: 'catalog_read',
          endpoint,
          request_hash: createHash('sha256').update(endpoint).digest('hex'),
          response_hash: responseHash,
          response_excerpt: responseBody,
          probe_duration_ms: elapsed,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    }
  } catch (err) {
    const elapsed = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    for (const { canonical } of SKU_PATTERNS) {
      evidence.push({
        timestamp: new Date().toISOString(),
        provider: 'azure',
        country: region.country,
        region: region.armRegionName,
        sku: canonical,
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'catalog_read',
        endpoint,
        request_hash: createHash('sha256').update(endpoint).digest('hex'),
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

export async function runAzureProbe(
  outDir: string
): Promise<EvidenceObject[]> {
  const all: EvidenceObject[] = [];
  for (const region of REGIONS) {
    const evidence = await probeRegion(region);
    all.push(...evidence);
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'azure.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(all, null, 2));
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runAzureProbe(outDir)
    .then((records) => {
      console.log(`Azure probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('Azure probe failed:', err);
      process.exit(1);
    });
}
