# Drift Guard

Build "Drift Insurance" - Python + Great Expectations + DuckDB + Next.js.

KEY FEATURE: Data Producer and Consumer sign a smart contract. Producer promises: "price column will have mean between 100-200". Your system watches live stream via Kafka mock. The moment drift happens, it does 3 things: 1. Freezes downstream dashboards to last good state 2. Creates an SLA breach ticket with $$$ impact 3. Auto-generates a dbt fix PR. UI is like an insurance policy document.

Senior Requirements: Contract versioning, breaking change detector, lineage graph, PDF breach report.

Resume Line: Architected a Data Contract Insurance protocol that auto-freezes downstream and generates fix PRs on drift.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://data-drift-guardian.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f48109c-03c1-4cac-a113-5386559daa48).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
