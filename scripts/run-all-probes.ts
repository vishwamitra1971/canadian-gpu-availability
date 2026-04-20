import { runAzureProbe } from '../probes/azure/src/probe.js';
import { runOvhProbe } from '../probes/ovh/src/probe.js';
import { runHut8Probe } from '../probes/hut8/src/probe.js';
import { runIrenProbe } from '../probes/iren/src/probe.js';
import { runGcpProbe } from '../probes/gcp/src/probe.js';
import { runDigitalOceanProbe } from '../probes/digitalocean/src/probe.js';
import { runDigitalOceanAuthedProbe } from '../probes/digitalocean/src/probe-authed.js';
import { runOciProbe } from '../probes/oci/src/probe.js';
import { runOciAuthedProbe } from '../probes/oci/src/probe-authed.js';
import { runAwsProbe } from '../probes/aws/src/probe.js';

const OUT_DIR = process.argv[2] ?? './evidence/raw';

type ProbeRun = {
  name: string;
  run: (out: string) => Promise<unknown[]>;
};

const PROBES: ProbeRun[] = [
  { name: 'azure', run: runAzureProbe },
  { name: 'ovh', run: runOvhProbe },
  { name: 'gcp', run: runGcpProbe },
  { name: 'digitalocean', run: runDigitalOceanProbe },
  { name: 'digitalocean-authed', run: runDigitalOceanAuthedProbe },
  { name: 'oci', run: runOciProbe },
  { name: 'oci-authed', run: runOciAuthedProbe },
  { name: 'hut8', run: runHut8Probe },
  { name: 'iren', run: runIrenProbe },
  { name: 'aws', run: runAwsProbe },
];

async function main() {
  const summary: { probe: string; records: number; ms: number; error?: string }[] = [];
  for (const { name, run } of PROBES) {
    const started = Date.now();
    try {
      const records = await run(OUT_DIR);
      summary.push({
        probe: name,
        records: records.length,
        ms: Date.now() - started,
      });
      console.log(`[${name}] ${records.length} records in ${Date.now() - started}ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.push({
        probe: name,
        records: 0,
        ms: Date.now() - started,
        error: message,
      });
      console.error(`[${name}] FAILED: ${message}`);
    }
  }
  console.log('\nSummary:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('Probe runner failed:', err);
  process.exit(1);
});
