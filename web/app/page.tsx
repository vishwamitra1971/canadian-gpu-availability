const SNAPSHOT_TIMESTAMP = '2026-04-20T14:30:00Z';
const MOCK_COMMIT_SHA = 'mock-data';

type PhantomRow = {
  provider: string;
  region: string;
  sku: string;
  listed: 'Yes' | 'No';
  launchable: string;
  launchClass: 'v-launch-yes' | 'v-launch-no' | 'v-launch-partial';
  evidence: string;
};

const PHANTOM_ROWS: PhantomRow[] = [
  {
    provider: 'GCP',
    region: 'northamerica-northeast1 (Montreal)',
    sku: 'a3-highgpu-8g (H100)',
    listed: 'Yes',
    launchable: 'No — phantom',
    launchClass: 'v-launch-no',
    evidence: 'evidence/mock/gcp-mtl-a3.json',
  },
  {
    provider: 'GCP',
    region: 'northamerica-northeast2 (Toronto)',
    sku: 'a3-edgegpu-8g (H100, inference)',
    listed: 'Yes',
    launchable: 'Inference only',
    launchClass: 'v-launch-partial',
    evidence: 'evidence/mock/gcp-tor-a3-edge.json',
  },
  {
    provider: 'AWS',
    region: 'ca-central-1 (Montreal)',
    sku: 'p5.48xlarge (H100)',
    listed: 'Yes',
    launchable: 'No — default quota 0',
    launchClass: 'v-launch-no',
    evidence: 'evidence/mock/aws-cac1-p5.json',
  },
  {
    provider: 'AWS',
    region: 'ca-west-1 (Calgary)',
    sku: 'p5.48xlarge (H100)',
    listed: 'Yes',
    launchable: 'No — default quota 0',
    launchClass: 'v-launch-no',
    evidence: 'evidence/mock/aws-caw1-p5.json',
  },
  {
    provider: 'Azure',
    region: 'canadacentral',
    sku: 'Standard_ND96isr_H100_v5',
    listed: 'Yes',
    launchable: 'No — NotAvailableForSubscription',
    launchClass: 'v-launch-no',
    evidence: 'evidence/mock/az-cc-nd-h100.json',
  },
  {
    provider: 'OCI',
    region: 'ca-toronto-1',
    sku: 'BM.GPU.H100.8',
    listed: 'Yes',
    launchable: 'Yes — capacity report OK',
    launchClass: 'v-launch-yes',
    evidence: 'evidence/mock/oci-yyz-h100.json',
  },
  {
    provider: 'OVHcloud',
    region: 'BHS (Beauharnois, QC)',
    sku: 't2-h100-188 (H100)',
    listed: 'Yes',
    launchable: 'No — catalog lists; stock badge OUT',
    launchClass: 'v-launch-no',
    evidence: 'evidence/mock/ovh-bhs-h100.json',
  },
  {
    provider: 'DigitalOcean',
    region: 'TOR1 (Toronto)',
    sku: 'gpu-h100x1-80gb',
    listed: 'Yes',
    launchable: 'Catalog-only — see methodology',
    launchClass: 'v-launch-partial',
    evidence: 'evidence/mock/do-tor1-h100.json',
  },
  {
    provider: 'Hut 8',
    region: 'Alberta',
    sku: 'H100 (Hut8 Compute)',
    listed: 'Yes',
    launchable: 'Catalog-only + quarterly attestation',
    launchClass: 'v-launch-partial',
    evidence: 'evidence/mock/hut8-ab-h100.json',
  },
  {
    provider: 'Iris Energy',
    region: 'BC (Prince George)',
    sku: 'H100 / H200 AI Cloud',
    listed: 'Yes',
    launchable: 'Catalog-only + quarterly attestation',
    launchClass: 'v-launch-partial',
    evidence: 'evidence/mock/iren-bc-h100.json',
  },
];

type LeaderRow = {
  rank: number;
  country: string;
  bar: number;
  value: number;
  highlight?: boolean;
};

const LEADERBOARD: LeaderRow[] = [
  { rank: 1, country: 'United States', bar: 100, value: 847 },
  { rank: 2, country: 'Japan', bar: 41, value: 72 },
  { rank: 3, country: 'Germany', bar: 33, value: 58 },
  { rank: 4, country: 'United Kingdom', bar: 27, value: 44 },
  { rank: 5, country: 'France', bar: 20, value: 31 },
  { rank: 6, country: 'Canada', bar: 3, value: 3, highlight: true },
  { rank: 7, country: 'Italy', bar: 2, value: 2 },
];

export default function Home() {
  return (
    <>
      <div className="mock-banner">
        <strong>MOCK DATA — no real probes have run yet.</strong> This is a
        pre-launch preview of the dashboard shape. The numbers, verdicts, and
        evidence links below are placeholders for design iteration only. Real
        probe wiring begins at Week 1 of the implementation plan (see{' '}
        <a href="https://github.com/vishwamitra1971/canadian-gpu-availability/blob/main/docs/design.md">
          docs/design.md
        </a>
        ).
      </div>

      <nav className="topnav">
        <div className="brand">
          Canadian GPU Availability
          <span className="sub">an independent public tracker</span>
        </div>
        <ul>
          <li>
            <a href="#gap">Dashboard</a>
          </li>
          <li>
            <a href="#">Reports</a>
          </li>
          <li>
            <a href="#">Methodology</a>
          </li>
          <li>
            <a href="#">API</a>
          </li>
          <li>
            <a href="https://github.com/vishwamitra1971/canadian-gpu-availability">
              Source
            </a>
          </li>
        </ul>
      </nav>

      <section id="gap">
        <h2 className="eyebrow">Sovereignty Gap Index</h2>
        <div className="gap-index">
          <p className="headline">
            Canada has <strong className="ca">3</strong> current-generation
            training GPU SKUs actually launchable.
            <br />
            The United States has <strong>847</strong>.
          </p>
          <p className="context">
            &ldquo;Current-generation training&rdquo; = H100, H200, B100, B200,
            GB200, MI300X, or MI325X, available on-demand in at least one
            in-country region. Excludes inference-only deployments and SKUs
            listed but not launchable due to quota or capacity constraints.
            Verified against provider APIs at the timestamp below.
          </p>
          <div className="cite">
            <span className="label">Cite as</span>
            Canadian GPU Availability, {SNAPSHOT_TIMESTAMP}, commit{' '}
            <strong>{MOCK_COMMIT_SHA}</strong>
          </div>
        </div>
      </section>

      <section>
        <h2 className="eyebrow">
          Phantom Inventory Wall &mdash; listed vs. actually launchable
        </h2>
        <div className="filter-bar">
          <label>
            Country:{' '}
            <select defaultValue="Canada">
              <option>Canada</option>
              <option>All G7</option>
            </select>
          </label>
          <label>
            Provider:{' '}
            <select defaultValue="All">
              <option>All</option>
              <option>AWS</option>
              <option>Azure</option>
              <option>GCP</option>
              <option>OVH</option>
              <option>DigitalOcean</option>
              <option>OCI</option>
              <option>Hut 8</option>
              <option>Iris Energy</option>
            </select>
          </label>
          <label>
            SKU class:{' '}
            <select defaultValue="Training (current-gen)">
              <option>Training (current-gen)</option>
              <option>Inference</option>
              <option>All</option>
            </select>
          </label>
        </div>
        <table className="phantom">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Region</th>
              <th>SKU</th>
              <th>Listed?</th>
              <th>Launchable?</th>
              <th>Last probed</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {PHANTOM_ROWS.map((row) => (
              <tr key={`${row.provider}-${row.region}-${row.sku}`}>
                <td>{row.provider}</td>
                <td className="region">{row.region}</td>
                <td className="sku">{row.sku}</td>
                <td className="verdict v-listed-yes">{row.listed}</td>
                <td className={`verdict ${row.launchClass}`}>
                  {row.launchable}
                </td>
                <td className="region">2026-04-20 14:28Z</td>
                <td className="evidence">
                  <a href="#">{row.evidence}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="eyebrow">
          G7 Leaderboard &mdash; current-gen training GPU SKUs launchable
          in-country
        </h2>
        <div className="leaderboard">
          <div className="header row">
            <div></div>
            <div>Country</div>
            <div>Relative (per 1M pop.)</div>
            <div>SKUs</div>
          </div>
          {LEADERBOARD.map((row) => (
            <div
              key={row.country}
              className={row.highlight ? 'row highlight' : 'row'}
            >
              <div className="rank">{row.rank}</div>
              <div
                className={row.highlight ? 'country highlight' : 'country'}
              >
                {row.country}
              </div>
              <div className="bar">
                <span style={{ width: `${row.bar}%` }} />
              </div>
              <div className="value">{row.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow">
          Canadian Current-Gen GPU Availability Over Time
        </h2>
        <div className="timeline-wrap">
          <svg viewBox="0 0 900 220" preserveAspectRatio="none">
            <line x1="0" y1="180" x2="900" y2="180" stroke="#d0d0c8" strokeWidth="1" />
            <line x1="0" y1="130" x2="900" y2="130" stroke="#f0f0e8" strokeWidth="1" />
            <line x1="0" y1="80" x2="900" y2="80" stroke="#f0f0e8" strokeWidth="1" />
            <line x1="0" y1="30" x2="900" y2="30" stroke="#f0f0e8" strokeWidth="1" />

            <text x="4" y="184" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">0</text>
            <text x="4" y="134" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">1</text>
            <text x="4" y="84" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">2</text>
            <text x="4" y="34" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">3</text>

            <polyline
              points="40,180 180,180 180,130 340,130 520,130 520,80 680,80 680,30 880,30"
              fill="none"
              stroke="#b03020"
              strokeWidth="2"
            />

            <line x1="180" y1="10" x2="180" y2="200" stroke="#666" strokeWidth="1" strokeDasharray="3,3" />
            <text x="184" y="20" fontSize="10" fill="#444">2024-04 · AI Compute Access Fund announced</text>

            <line x1="340" y1="10" x2="340" y2="200" stroke="#666" strokeWidth="1" strokeDasharray="3,3" />
            <text x="344" y="20" fontSize="10" fill="#444">2025-06 · DigitalOcean H100 Toronto</text>

            <line x1="520" y1="10" x2="520" y2="200" stroke="#666" strokeWidth="1" strokeDasharray="3,3" />
            <text x="524" y="20" fontSize="10" fill="#444">2026-04 · OCI H100 Toronto + Montreal</text>

            <text x="40" y="210" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">2023</text>
            <text x="260" y="210" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">2024</text>
            <text x="480" y="210" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">2025</text>
            <text x="700" y="210" fontSize="10" fill="#888" fontFamily="ui-monospace,Menlo,monospace">2026</text>
          </svg>
        </div>
        <div className="timeline-legend">
          <span>
            <span
              className="dot"
              style={{ background: 'var(--ca)' }}
            />
            Canada SKU count (current-gen training)
          </span>
          <span>
            <span className="dot" style={{ background: 'var(--muted)' }} />
            Policy / provider events
          </span>
        </div>
      </section>

      <footer className="dash-footer">
        <div className="row1">
          Snapshot (mock): {SNAPSHOT_TIMESTAMP} · commit{' '}
          <strong>{MOCK_COMMIT_SHA}</strong> · 0 real probes across 7 countries
          · 8 providers in V1 scope
        </div>
        <div>
          MIT licensed · Source:{' '}
          <a href="https://github.com/vishwamitra1971/canadian-gpu-availability">
            github.com/vishwamitra1971/canadian-gpu-availability
          </a>{' '}
          · No affiliation with ISED or Alliance Canada
        </div>
      </footer>
    </>
  );
}
