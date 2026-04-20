import {
  loadLatestSnapshot,
  buildPhantomRows,
  buildLeaderboard,
  LIVE_PROVIDERS,
} from '../lib/evidence';

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  UK: 'United Kingdom',
  FR: 'France',
  CA: 'Canada',
  IT: 'Italy',
};

export default function Home() {
  const snapshot = loadLatestSnapshot();
  const records = snapshot?.records ?? [];
  const snapshotTimestamp = snapshot?.snapshotTimestamp ?? 'no snapshot yet';
  const snapshotPath = snapshot?.snapshotPath ?? '—';

  const rows = snapshot ? buildPhantomRows(records, snapshotPath) : [];
  const liveRows = rows.filter((r) => r.providerClass === 'live');
  const awaitingRows = rows.filter((r) => r.providerClass === 'awaiting');

  const leaderboardRaw = buildLeaderboard(records);
  const maxListed = Math.max(1, ...leaderboardRaw.map((r) => r.listedCount));
  const leaderboard = leaderboardRaw
    .map((r) => ({
      ...r,
      name: COUNTRY_NAMES[r.country] ?? r.country,
      bar: Math.round((r.listedCount / maxListed) * 100),
      highlight: r.country === 'CA',
    }))
    .sort((a, b) => b.listedCount - a.listedCount)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const canadaListed = leaderboardRaw.find((r) => r.country === 'CA')?.listedCount ?? 0;
  const canadaLaunchable = leaderboardRaw.find((r) => r.country === 'CA')?.launchableCount ?? 0;
  const usListed = leaderboardRaw.find((r) => r.country === 'US')?.listedCount ?? 0;

  return (
    <>
      <div className="mock-banner">
        <strong>PARTIAL LIVE DATA.</strong> {LIVE_PROVIDERS.length} of 8 providers
        probing live against real APIs: Azure (Retail Prices API), OVHcloud (public
        catalog), Hut 8, Iris Energy. The remaining 4 (AWS, GCP, OCI, DigitalOcean)
        require authenticated service accounts and are labeled <em>AWAITING AUTH</em>{' '}
        below. &ldquo;Listed&rdquo; means the SKU appears in the provider&rsquo;s
        public catalog. &ldquo;Launchable&rdquo; verification requires dry-run creates
        against authed accounts, which begins in Week 1 of the implementation plan.
        Until then, all live rows show <em>launchable = Unknown</em>.
      </div>

      <nav className="topnav">
        <div className="brand">
          Canadian GPU Availability
          <span className="sub">an independent public tracker</span>
        </div>
        <ul>
          <li><a href="#gap">Dashboard</a></li>
          <li><a href="#phantom">Phantom Wall</a></li>
          <li><a href="#leaderboard">G7</a></li>
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
            Canada has <strong className="ca">{canadaListed}</strong> current-generation
            training GPU SKUs listed by unauthed probes.
            <br />
            <strong>{canadaLaunchable}</strong> verified launchable. (Verification gated
            on authed accounts.)
          </p>
          <p className="context">
            &ldquo;Current-generation training&rdquo; = H100, H200, B100, B200, GB200,
            MI300X, or MI325X, appearing in the provider&rsquo;s public catalog for an
            in-country region. The United States currently shows{' '}
            <strong>{usListed}</strong> listed SKUs across the same unauthed probes.
            The real gap &mdash; what is actually launchable on a fresh account &mdash;
            accrues once authenticated probes come online. Evidence JSON is committed
            under <code>evidence/raw/</code> in this repo.
          </p>
          <div className="cite">
            <span className="label">Snapshot</span>
            {snapshotTimestamp} · path <strong>{snapshotPath}</strong> ·{' '}
            {records.length} records
          </div>
        </div>
      </section>

      <section id="phantom">
        <h2 className="eyebrow">
          Phantom Inventory Wall &mdash; listed vs. actually launchable
        </h2>
        <table className="phantom">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Country</th>
              <th>Region</th>
              <th>SKU</th>
              <th>Listed?</th>
              <th>Launchable?</th>
              <th>Last probed</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {liveRows.map((row, i) => (
              <tr key={`live-${i}`}>
                <td>{row.provider}</td>
                <td className="region">{row.country}</td>
                <td className="region">{row.region}</td>
                <td className="sku">
                  {row.sku}
                  {row.sku_raw && row.sku_raw !== row.sku ? (
                    <div style={{ fontSize: 11, color: '#888' }}>{row.sku_raw}</div>
                  ) : null}
                </td>
                <td className="verdict v-listed-yes">{row.listed}</td>
                <td className={`verdict ${row.launchClass}`}>{row.launchable}</td>
                <td className="region">{row.lastProbed}</td>
                <td className="evidence">
                  <a href={`https://github.com/vishwamitra1971/canadian-gpu-availability/blob/main/${row.evidence}`}>
                    {row.evidence}
                  </a>
                </td>
              </tr>
            ))}
            {awaitingRows.length > 0 ? (
              <tr>
                <td colSpan={8} style={{ paddingTop: 20, paddingBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#888' }}>
                  Awaiting authenticated probes &mdash; placeholders only, no verdict rendered
                </td>
              </tr>
            ) : null}
            {awaitingRows.map((row, i) => (
              <tr key={`await-${i}`} style={{ opacity: 0.6 }}>
                <td>{row.provider}</td>
                <td className="region">{row.country}</td>
                <td className="region">{row.region}</td>
                <td className="sku">{row.sku}</td>
                <td className="verdict">—</td>
                <td className={`verdict ${row.launchClass}`}>{row.launchable}</td>
                <td className="region">—</td>
                <td className="evidence" style={{ fontSize: 11 }}>{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="leaderboard">
        <h2 className="eyebrow">
          G7 Leaderboard &mdash; listed current-gen training SKUs (unauthed probes)
        </h2>
        <div className="leaderboard">
          <div className="header row">
            <div></div>
            <div>Country</div>
            <div>Listed (relative)</div>
            <div>SKUs</div>
          </div>
          {leaderboard.map((row) => (
            <div
              key={row.country}
              className={row.highlight ? 'row highlight' : 'row'}
            >
              <div className="rank">{row.rank}</div>
              <div className={row.highlight ? 'country highlight' : 'country'}>
                {row.name}
              </div>
              <div className="bar">
                <span style={{ width: `${row.bar}%` }} />
              </div>
              <div className="value">{row.listedCount}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#888', marginTop: 12, fontFamily: 'var(--mono)' }}>
          Counts reflect unique canonical SKUs appearing in Azure Retail Prices + OVH
          public catalog for each country. Hut 8 / IREN are catalog pages (badge_scrape
          probe). Launchable counts remain 0 everywhere until authed probes ship.
        </p>
      </section>

      <footer className="dash-footer">
        <div className="row1">
          Snapshot: {snapshotTimestamp} · {records.length} evidence records · live
          probes: {LIVE_PROVIDERS.join(', ')} · awaiting auth: aws, gcp, oci,
          digitalocean
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
