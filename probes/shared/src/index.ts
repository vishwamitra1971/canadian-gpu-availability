export type Provider =
  | 'aws'
  | 'azure'
  | 'gcp'
  | 'ovh'
  | 'digitalocean'
  | 'oci'
  | 'hut8'
  | 'iren';

export type Country = 'CA' | 'US' | 'UK' | 'FR' | 'DE' | 'IT' | 'JP';

export type Verdict =
  | 'launchable'
  | 'phantom'
  | 'inference_only'
  | 'quota_blocked'
  | 'unknown';

export type ProbeType =
  | 'catalog_read'
  | 'dry_run_create'
  | 'spot_placement_score'
  | 'badge_scrape'
  | 'sku_restrictions'
  | 'capacity_report'
  | 'manual_attestation';

export const CANONICAL_SKUS = [
  'H100-SXM-80GB',
  'H100-PCIE-80GB',
  'H200-SXM-141GB',
  'B100-SXM',
  'B200-SXM',
  'GB200-PER-GPU',
  'MI300X-OAM-192GB',
  'MI325X-OAM',
] as const;

export type CanonicalSku = (typeof CANONICAL_SKUS)[number];

export const TAXONOMY_VERSION = 'taxonomy_v1';

export interface EvidenceObject {
  timestamp: string;
  provider: Provider;
  country: Country;
  region: string;
  sku: CanonicalSku | string;
  sku_raw: string;
  listed: boolean;
  launchable: boolean;
  verdict: Verdict;
  probe_type: ProbeType;
  endpoint: string;
  request_hash: string;
  response_hash: string;
  response_excerpt: string;
  probe_duration_ms: number;
  probe_version: string;
  taxonomy_version: typeof TAXONOMY_VERSION;
}
