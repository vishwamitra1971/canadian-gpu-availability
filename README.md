# Canadian GPU Availability

Evidence-backed sovereignty dashboard: which current-generation GPUs you can
actually launch in Canadian and G7 cloud regions today, reconciled against what
providers claim to list.

**Status:** Pre-V1 — scaffold only. See [docs/design.md](docs/design.md) for the
full design and implementation roadmap.

## What this is

Pricing-comparison sites publish provider catalogs as ground truth. They don't
reconcile "listed" against "actually launchable." This project runs continuous,
auditable probes against AWS, Azure, GCP, OVH, DigitalOcean, Oracle Cloud, Hut 8,
and Iris Energy, then commits every raw API response to a public append-only
evidence log so anyone can cite any data point by commit SHA.

## Four views

1. **Sovereignty Gap Index** — headline number for the policy audience.
2. **Phantom Inventory Wall** — rows where listed ≠ launchable.
3. **G7 Leaderboard** — Canada vs. US / UK / FR / DE / IT / JP.
4. **Historical Timeline** — step-function plot of when capacity actually shipped.

## Stack

- Monorepo: pnpm workspaces + Turborepo
- Probes: per-provider TypeScript workers in `probes/`
- Evidence: append-only JSON log in `evidence/raw/`, monthly Parquet archive in `evidence/archive/`
- Verdict engine: reconciliation logic in `verdict/`
- Web: Next.js static export in `web/`, deployed to Vercel
- CI: GitHub Actions (cron + build + deploy)

## License

MIT. Open source from day one.
