import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';
import { TAXONOMY_VERSION } from '@cgpua/shared';

const PROBE_VERSION = '0.1.0';

type AwsRegion = { code: string; country: Country };

const REGIONS: AwsRegion[] = [
  { code: 'ca-central-1', country: 'CA' },
  { code: 'ca-west-1', country: 'CA' },
  { code: 'us-east-1', country: 'US' },
  { code: 'us-west-2', country: 'US' },
  { code: 'eu-west-2', country: 'UK' },
  { code: 'eu-west-3', country: 'FR' },
  { code: 'eu-central-1', country: 'DE' },
  { code: 'eu-south-1', country: 'IT' },
  { code: 'ap-northeast-1', country: 'JP' },
];

const INSTANCE_MAP: { prefix: string; sku: CanonicalSku }[] = [
  { prefix: 'p5en.', sku: 'H200-SXM-141GB' },
  { prefix: 'p5e.', sku: 'H200-SXM-141GB' },
  { prefix: 'p5.', sku: 'H100-SXM-80GB' },
  { prefix: 'p6e.', sku: 'B200-SXM' },
  { prefix: 'p6.', sku: 'B200-SXM' },
];

function csvEndpoint(region: string): string {
  return `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${region}/index.csv`;
}

async function scanRegion(region: AwsRegion): Promise<{
  found: Map<string, CanonicalSku>;
  endpoint: string;
  durationMs: number;
  responseHash: string;
  bytes: number;
  error?: string;
}> {
  const endpoint = csvEndpoint(region.code);
  const started = Date.now();
  const found = new Map<string, CanonicalSku>();
  const hasher = createHash('sha256');
  let bytes = 0;

  try {
    const res = await fetch(endpoint);
    if (!res.ok || !res.body) {
      return {
        found,
        endpoint,
        durationMs: Date.now() - started,
        responseHash: '',
        bytes: 0,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const nodeStream = Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    const rl = createInterface({ input: nodeStream, crlfDelay: Infinity });
    for await (const line of rl) {
      bytes += line.length + 1;
      hasher.update(line);
      // AWS pricing CSV: looking for GPU instance type prefixes in quoted fields.
      for (const { prefix, sku } of INSTANCE_MAP) {
        const needle = `"${prefix}`;
        if (line.includes(needle)) {
          // Extract the full instance type: first match of prefix through next quote
          const idx = line.indexOf(needle);
          const rest = line.slice(idx + 1);
          const end = rest.indexOf('"');
          if (end > 0) {
            const inst = rest.slice(0, end);
            if (/^[a-z0-9]+\.[a-z0-9]+$/.test(inst) && !found.has(inst)) {
              found.set(inst, sku);
            }
          }
        }
      }
    }
    return {
      found,
      endpoint,
      durationMs: Date.now() - started,
      responseHash: hasher.digest('hex'),
      bytes,
    };
  } catch (err) {
    return {
      found,
      endpoint,
      durationMs: Date.now() - started,
      responseHash: '',
      bytes,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runAwsProbe(outDir: string): Promise<EvidenceObject[]> {
  const evidence: EvidenceObject[] = [];
  const timestamp = new Date().toISOString();

  for (const region of REGIONS) {
    const result = await scanRegion(region);
    const requestHash = createHash('sha256').update(result.endpoint).digest('hex');

    if (result.error) {
      evidence.push({
        timestamp,
        provider: 'aws',
        country: region.country,
        region: region.code,
        sku: 'H100-SXM-80GB',
        sku_raw: '',
        listed: false,
        launchable: false,
        verdict: 'unknown',
        probe_type: 'catalog_read',
        endpoint: result.endpoint,
        request_hash: requestHash,
        response_hash: '',
        response_excerpt: `ERROR: ${result.error}`,
        probe_duration_ms: result.durationMs,
        probe_version: PROBE_VERSION,
        taxonomy_version: TAXONOMY_VERSION,
      });
      continue;
    }

    // Dedupe by SKU per region — one record per (region, canonical SKU)
    const perSku = new Map<CanonicalSku, string>();
    for (const [instType, sku] of result.found) {
      if (!perSku.has(sku)) perSku.set(sku, instType);
    }

    const excerpt = `AWS EC2 regional price list (${region.code}): ${result.bytes} bytes scanned, ${result.found.size} GPU instance types matched — ${Array.from(result.found.keys()).slice(0, 8).join(', ')}`;

    if (perSku.size === 0) {
      // Emit phantom records for tracked SKUs not found in this region.
      for (const { sku } of INSTANCE_MAP) {
        evidence.push({
          timestamp,
          provider: 'aws',
          country: region.country,
          region: region.code,
          sku,
          sku_raw: '',
          listed: false,
          launchable: false,
          verdict: 'phantom',
          probe_type: 'catalog_read',
          endpoint: result.endpoint,
          request_hash: requestHash,
          response_hash: result.responseHash,
          response_excerpt: excerpt,
          probe_duration_ms: result.durationMs,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    } else {
      for (const [sku, instType] of perSku) {
        evidence.push({
          timestamp,
          provider: 'aws',
          country: region.country,
          region: region.code,
          sku,
          sku_raw: instType,
          listed: true,
          launchable: false,
          verdict: 'unknown',
          probe_type: 'catalog_read',
          endpoint: result.endpoint,
          request_hash: requestHash,
          response_hash: result.responseHash,
          response_excerpt: excerpt,
          probe_duration_ms: result.durationMs,
          probe_version: PROBE_VERSION,
          taxonomy_version: TAXONOMY_VERSION,
        });
      }
    }
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const outPath = join(outDir, `${yyyy}-${mm}-${dd}`, hh, 'aws.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2));
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = process.argv[2] ?? './evidence/raw';
  runAwsProbe(outDir)
    .then((records) => {
      console.log(`AWS probe complete: ${records.length} records written`);
    })
    .catch((err) => {
      console.error('AWS probe failed:', err);
      process.exit(1);
    });
}
