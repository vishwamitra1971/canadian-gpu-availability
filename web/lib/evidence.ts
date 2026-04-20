import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EvidenceObject, CanonicalSku, Country } from '@cgpua/shared';

const EVIDENCE_ROOT = join(process.cwd(), '..', 'evidence', 'raw');

type LiveProvider =
  | 'azure'
  | 'ovh'
  | 'gcp'
  | 'digitalocean'
  | 'oci'
  | 'hut8'
  | 'iren'
  | 'aws';
export const LIVE_PROVIDERS: LiveProvider[] = [
  'azure',
  'ovh',
  'gcp',
  'digitalocean',
  'oci',
  'hut8',
  'iren',
  'aws',
];

export type EvidenceSnapshot = {
  snapshotPath: string;
  snapshotTimestamp: string;
  records: EvidenceObject[];
};

function listDirs(p: string): string[] {
  try {
    return readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

export function loadLatestSnapshot(): EvidenceSnapshot | null {
  const days = listDirs(EVIDENCE_ROOT);
  const latestDay = days[days.length - 1];
  if (!latestDay) return null;
  const hours = listDirs(join(EVIDENCE_ROOT, latestDay));
  const latestHour = hours[hours.length - 1];
  if (!latestHour) return null;
  const snapshotPath = join(EVIDENCE_ROOT, latestDay, latestHour);

  const records: EvidenceObject[] = [];
  let mtime = 0;
  for (const f of readdirSync(snapshotPath)) {
    if (!f.endsWith('.json')) continue;
    const full = join(snapshotPath, f);
    const stat = statSync(full);
    mtime = Math.max(mtime, stat.mtimeMs);
    const parsed = JSON.parse(readFileSync(full, 'utf8')) as EvidenceObject[];
    records.push(...parsed);
  }
  return {
    snapshotPath: `${latestDay}/${latestHour}`,
    snapshotTimestamp: new Date(mtime).toISOString(),
    records,
  };
}

export type CountryGap = {
  country: Country;
  listedSkus: Set<CanonicalSku | string>;
};

export function perCountryListed(records: EvidenceObject[]): Map<Country, Set<string>> {
  const map = new Map<Country, Set<string>>();
  for (const r of records) {
    if (!r.listed) continue;
    let set = map.get(r.country);
    if (!set) {
      set = new Set<string>();
      map.set(r.country, set);
    }
    set.add(r.sku);
  }
  return map;
}

export type PhantomRow = {
  provider: string;
  providerClass: 'live' | 'awaiting';
  region: string;
  country: Country | '—';
  sku: string;
  sku_raw: string;
  listed: 'Yes' | 'No' | '—';
  launchable: string;
  launchClass: 'v-launch-yes' | 'v-launch-no' | 'v-launch-partial';
  lastProbed: string;
  evidence: string;
  note?: string;
};

function verdictLabel(r: EvidenceObject): { label: string; cls: PhantomRow['launchClass'] } {
  if (r.launchable) return { label: 'Yes', cls: 'v-launch-yes' };
  if (r.verdict === 'phantom') return { label: 'No — not listed', cls: 'v-launch-no' };
  if (r.verdict === 'inference_only') return { label: 'Inference only', cls: 'v-launch-partial' };
  if (r.verdict === 'quota_blocked') return { label: 'No — quota blocked', cls: 'v-launch-no' };
  return { label: 'Unknown (unauthed)', cls: 'v-launch-partial' };
}

function providerLabel(p: string): string {
  if (p === 'azure') return 'Azure';
  if (p === 'ovh') return 'OVHcloud';
  if (p === 'hut8') return 'Hut 8';
  if (p === 'iren') return 'Iris Energy';
  if (p === 'aws') return 'AWS';
  if (p === 'gcp') return 'GCP';
  if (p === 'oci') return 'OCI';
  if (p === 'digitalocean') return 'DigitalOcean';
  return p;
}

// Prefer the most informative record when probes overlap on (provider, region, sku).
// launchable=true wins over any no/unknown. phantom/quota_blocked (definitive "no")
// wins over unknown. Lower = better.
function recordRank(r: EvidenceObject): number {
  if (r.launchable) return 0;
  if (r.verdict === 'phantom') return 1;
  if (r.verdict === 'quota_blocked') return 2;
  if (r.verdict === 'inference_only') return 3;
  return 4;
}

export function buildPhantomRows(records: EvidenceObject[], snapshotPath: string): PhantomRow[] {
  const best = new Map<string, EvidenceObject>();
  for (const r of records) {
    if (!r.listed && !r.launchable && r.verdict !== 'phantom') continue;
    const key = `${r.provider}|${r.region}|${r.sku}`;
    const existing = best.get(key);
    if (!existing || recordRank(r) < recordRank(existing)) {
      best.set(key, r);
    }
  }
  const rows: PhantomRow[] = [];
  for (const r of best.values()) {
    const v = verdictLabel(r);
    rows.push({
      provider: providerLabel(r.provider),
      providerClass: 'live',
      region: r.region,
      country: r.country,
      sku: r.sku,
      sku_raw: r.sku_raw,
      listed: r.listed ? 'Yes' : 'No',
      launchable: v.label,
      launchClass: v.cls,
      lastProbed: r.timestamp.slice(0, 16).replace('T', ' ') + 'Z',
      evidence: `evidence/raw/${snapshotPath}/${r.provider}.json`,
    });
  }
  rows.sort((a, b) => {
    if (a.country !== b.country) return String(a.country).localeCompare(String(b.country));
    return a.provider.localeCompare(b.provider);
  });
  return rows;
}

export function buildLeaderboard(records: EvidenceObject[]): {
  country: Country;
  listedCount: number;
  launchableCount: number;
}[] {
  const allCountries: Country[] = ['US', 'JP', 'DE', 'UK', 'FR', 'CA', 'IT'];
  const listed = perCountryListed(records);
  const launchable = new Map<Country, Set<string>>();
  for (const r of records) {
    if (!r.launchable) continue;
    let set = launchable.get(r.country);
    if (!set) {
      set = new Set<string>();
      launchable.set(r.country, set);
    }
    set.add(r.sku);
  }
  return allCountries.map((c) => ({
    country: c,
    listedCount: listed.get(c)?.size ?? 0,
    launchableCount: launchable.get(c)?.size ?? 0,
  }));
}
