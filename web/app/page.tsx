export default function Home() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '80px 24px 120px',
      }}
    >
      <header style={{ marginBottom: 48 }}>
        <p
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            letterSpacing: 1,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Pre-launch · Scaffolding phase
        </p>
        <h1 style={{ fontSize: 36, lineHeight: 1.15, fontWeight: 700 }}>
          Canadian GPU Availability
        </h1>
        <p
          style={{
            fontSize: 19,
            color: 'var(--muted)',
            marginTop: 12,
            fontStyle: 'italic',
          }}
        >
          Listed is not launchable. A public, evidence-backed sovereignty
          dashboard for current-generation GPUs across G7 cloud regions.
        </p>
      </header>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12, fontWeight: 600 }}>
          The gap
        </h2>
        <p style={{ marginBottom: 16 }}>
          Pricing-comparison sites treat provider catalogs as ground truth. They
          don&rsquo;t reconcile what&rsquo;s <em>listed</em> against what you
          can <em>actually launch</em>. An H100 on GCP Montreal&rsquo;s pricing
          page is not the same as an H100 you can start today. AWS{' '}
          <code>ca-central-1</code> shows P5 instances a default account
          cannot run. OVH Beauharnois lists H100 entries while only V100
          hardware physically ships.
        </p>
        <p>
          This dashboard closes that gap with auditable, continuously-updated,
          citation-ready data.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12, fontWeight: 600 }}>
          Four views, one evidence log
        </h2>
        <ul style={{ paddingLeft: 24 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Sovereignty Gap Index</strong> &mdash; the headline.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Phantom Inventory Wall</strong> &mdash; where listed
            &ne; launchable.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>G7 Leaderboard</strong> &mdash; Canada vs. US / UK / FR /
            DE / IT / JP.
          </li>
          <li>
            <strong>Historical Timeline</strong> &mdash; when capacity
            actually shipped, not when it was announced.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12, fontWeight: 600 }}>
          How the evidence works
        </h2>
        <p>
          Every two to six hours, per-provider probes hit real APIs and commit
          the raw responses to a public, append-only evidence log. Each number
          on the dashboard links to a timestamped Git commit containing the
          exact request and response that produced it. Providers cannot
          quietly retcon their catalogs; the history is public and
          cryptographically permalinked.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12, fontWeight: 600 }}>
          Provider coverage (V1)
        </h2>
        <p style={{ marginBottom: 12 }}>
          Eight providers, full G7 on day one. Real launchability signals for
          AWS, Azure, GCP, OVH, and Oracle Cloud. Catalog-only for
          DigitalOcean, Hut 8, and Iris Energy, with the limitation disclosed
          on every affected row.
        </p>
      </section>

      <footer
        style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: '1px solid var(--border)',
          fontSize: 14,
          color: 'var(--muted)',
          fontFamily: 'var(--sans)',
        }}
      >
        <p>
          Open source, MIT licensed. Independent of government and provider
          coordination.
        </p>
        <p style={{ marginTop: 6 }}>
          Source:{' '}
          <a href="https://github.com/vishwamitra1971/canadian-gpu-availability">
            github.com/vishwamitra1971/canadian-gpu-availability
          </a>
        </p>
      </footer>
    </main>
  );
}
