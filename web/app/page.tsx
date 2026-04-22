// Force static regeneration on every deploy — evidence/raw/ changes but our
// page.tsx rarely does, so without this Vercel can serve a cached build.
export const dynamic = 'force-static';
export const revalidate = 0;

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
        <strong>LIVE CATALOG DATA · 8 of 8 providers.</strong> All probes read
        unauthenticated public sources: Azure Retail Prices API, OVHcloud public
        catalog, GCP GPU regions-zones page, DigitalOcean product page, OCI shapes
        + regions docs, AWS EC2 regional price CSVs, Hut 8, Iris Energy.
        &ldquo;Listed&rdquo; means the SKU appears in the provider&rsquo;s public
        catalog for an in-country region. &ldquo;Launchable&rdquo; verification
        requires dry-run creates against authed accounts (Path B, GitHub Actions
        OIDC, not yet shipped). Every live row shows <em>launchable = Unknown</em>{' '}
        until then.
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
          Counts reflect unique canonical SKUs appearing across all 8 probes
          (Azure, OVH, GCP, DigitalOcean, OCI, AWS, Hut 8, IREN) for each country.
          OCI rows use a synthetic <code>oci-catalog</code> region because the
          public docs confirm the catalog and per-country regions exist but not
          per-region availability. Launchable counts remain 0 everywhere until
          authed probes (Path B) ship.
        </p>
      </section>

      <footer className="dash-footer">
        <div className="row1">
          Snapshot: {snapshotTimestamp} · {records.length} evidence records · live
          probes: {LIVE_PROVIDERS.join(', ')} · authed probes (Path B): not yet
          shipped
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
