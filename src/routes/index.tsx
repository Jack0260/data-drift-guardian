import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONTRACTS, breachImpact, checkMean, detectChanges, diagnose, generateDbtPr, mean, type Contract,
} from "@/lib/drift";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Drift Insurance — Data Contract Policy" },
      { name: "description", content: "Insure your data contracts: auto-freeze dashboards, SLA breach tickets and dbt fix PRs on drift." },
      { property: "og:title", content: "Drift Insurance — Data Contract Policy" },
      { property: "og:description", content: "Auto-freeze downstream and generate fix PRs the moment data drifts." },
    ],
  }),
  component: Index,
});

type Mode = "normal" | "cents" | "zeros";
interface Ticket { id: string; at: string; observed: number; impact: number; cause: string; version: string }

const WINDOW = 40;

function Index() {
  const [versionIdx, setVersionIdx] = useState(1);
  const contract = CONTRACTS[versionIdx]!;
  const [mode, setMode] = useState<Mode>("normal");
  const [prices, setPrices] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [frozen, setFrozen] = useState<{ mean: number; history: number[]; at: string } | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pr, setPr] = useState<ReturnType<typeof generateDbtPr> | null>(null);
  const [events, setEvents] = useState(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const t = setInterval(() => {
      const base = 150 + (Math.random() - 0.5) * 80;
      const p = modeRef.current === "cents" ? base * 100 : modeRef.current === "zeros" ? (Math.random() < 0.8 ? 0 : base) : base;
      setEvents((e) => e + 1);
      setPrices((xs) => [...xs.slice(-(WINDOW - 1)), p]);
    }, 250);
    return () => clearInterval(t);
  }, []);

  const liveMean = mean(prices);
  const healthy = prices.length < 10 || checkMean(liveMean, contract);

  useEffect(() => {
    supabase.from("breach_tickets").select("*").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => {
        if (data) setTickets(data.map((r) => ({
          id: r.ticket_code, at: r.created_at, observed: Number(r.observed_mean),
          impact: r.impact_usd, cause: r.cause, version: r.contract_version,
        })));
      });
  }, []);

  useEffect(() => {
    if (prices.length < 10) return;
    setHistory((h) => [...h.slice(-59), liveMean]);
    if (!healthy && !frozen) {
      const goodHistory = history.filter((m) => checkMean(m, contract));
      const lastGood = goodHistory.at(-1) ?? 150;
      setFrozen({ mean: lastGood, history: goodHistory.slice(-60), at: new Date().toLocaleTimeString() });
      const ticket: Ticket = {
        id: `SLA-${Date.now().toString(36).toUpperCase()}`, at: new Date().toISOString(), observed: liveMean,
        impact: breachImpact(liveMean, contract), cause: diagnose(liveMean, contract).cause, version: contract.version,
      };
      const newPr = generateDbtPr(liveMean, contract);
      setTickets((ts) => [ticket, ...ts]);
      setPr(newPr);
      void (async () => {
        const { data } = await supabase.from("breach_tickets").insert({
          ticket_code: ticket.id, contract_version: ticket.version, observed_mean: ticket.observed,
          impact_usd: ticket.impact, cause: ticket.cause,
        }).select("id").single();
        if (data) await supabase.from("fix_prs").insert({ ticket_id: data.id, ...newPr });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices]);

  const reset = () => { setMode("normal"); setPrices([]); setFrozen(null); setPr(null); };

  return (
    <main className="min-h-screen px-4 py-10 md:py-16">
      <article className="policy-sheet mx-auto max-w-5xl border p-6 md:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-double border-primary pb-6">
          <div>
            <p className="clause-num">Policy No. DI-{contract.version.replace(/\W/g, "")}-ORD</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Drift Insurance</h1>
            <p className="mt-1 font-serif italic text-muted-foreground">A Data Contract of Guaranteed Quality</p>
          </div>
          <div className={`stamp text-lg ${healthy && !frozen ? "text-ok" : "text-seal"}`}>
            {frozen ? "Claim Filed" : healthy ? "In Force" : "Breach"}
          </div>
        </header>

        <Section n="I" title="Parties & Version">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Producer" value={contract.producer} />
            <Field label="Consumer" value={contract.consumer} />
            <div>
              <p className="clause-num">Contract version</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {CONTRACTS.map((c, i) => (
                  <button key={c.version} onClick={() => setVersionIdx(i)}
                    className={`border px-2 py-1 font-mono text-xs ${i === versionIdx ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                    v{c.version}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <BreakingChanges idx={versionIdx} />
        </Section>

        <Section n="II" title="Covenants of the Producer">
          <p className="font-serif text-lg leading-relaxed">
            The Producer hereby warrants that over any rolling window of {WINDOW} events, the
            <code className="mx-1 bg-accent px-1 font-mono">price</code> column shall maintain a mean between
            <strong className="mx-1">{contract.priceMean.min}</strong>and<strong className="mx-1">{contract.priceMean.max}</strong>.
            Breach incurs liability of <strong>${contract.slaPerHourUsd.toLocaleString()}/hour</strong>.
          </p>
          <table className="mt-4 w-full font-mono text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1">column</th><th>type</th><th>nullable</th></tr></thead>
            <tbody>{contract.columns.map((c) => (
              <tr key={c.name} className="border-b border-dashed"><td className="py-1">{c.name}</td><td>{c.type}</td><td>{c.nullable ? "yes" : "no"}</td></tr>
            ))}</tbody>
          </table>
        </Section>

        <Section n="III" title="Live Surveillance — topic: kafka.orders">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Events observed" value={events.toLocaleString()} />
            <Field label="Rolling mean" value={liveMean.toFixed(2)} tone={healthy ? "ok" : "bad"} />
            <Field label="Expectation" value={`${contract.priceMean.min}–${contract.priceMean.max}`} />
            <Field label="Status" value={healthy ? "PASS" : "FAIL"} tone={healthy ? "ok" : "bad"} />
          </div>
          <Spark data={history} c={contract} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => setMode("cents")} danger>Inject drift: price in cents</Btn>
            <Btn onClick={() => setMode("zeros")} danger>Inject drift: zero prices</Btn>
            <Btn onClick={reset}>Restore & reinstate policy</Btn>
          </div>
        </Section>

        <Section n="IV" title="Lineage & Downstream Protection">
          <Lineage frozen={!!frozen} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {["Revenue Dashboard", "Pricing Dashboard"].map((d) => (
              <div key={d} className="border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-serif font-semibold">{d}</p>
                  <span className={`font-mono text-xs ${frozen ? "text-seal" : "text-ok"}`}>
                    {frozen ? `❄ FROZEN @ ${frozen.at}` : "● LIVE"}
                  </span>
                </div>
                <p className="mt-2 font-mono text-3xl">${(frozen ? frozen.mean : liveMean).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">avg order value {frozen && "(last good state)"}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section n="V" title="Claims — SLA Breach Tickets">
          {tickets.length === 0 ? <p className="italic text-muted-foreground">No claims filed. Policy in good standing.</p> : (
            <div className="space-y-3">{tickets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-seal bg-card p-4">
                <div>
                  <p className="font-mono text-sm font-semibold">{t.id} · v{t.version}</p>
                  <p className="text-sm">{t.cause} — observed mean {t.observed.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono text-2xl text-seal">${t.impact.toLocaleString()}</p>
                  <Btn onClick={() => downloadReport(t, contract, pr)}>PDF report</Btn>
                </div>
              </div>
            ))}</div>
          )}
        </Section>

        <Section n="VI" title="Remediation — Auto-generated dbt Pull Request">
          {!pr ? <p className="italic text-muted-foreground">A fix PR will be drafted automatically upon breach.</p> : (
            <div className="border bg-card">
              <div className="border-b p-3">
                <p className="font-mono text-sm font-semibold">{pr.title}</p>
                <p className="font-mono text-xs text-muted-foreground">{pr.branch} → main</p>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-xs leading-5">
                {pr.diff.split("\n").map((l, i) => (
                  <div key={i} className={l.startsWith("+") ? "text-ok" : l.startsWith("-") ? "text-seal" : ""}>{l}</div>
                ))}
              </pre>
            </div>
          )}
        </Section>

        <footer className="mt-10 flex items-end justify-between border-t pt-6 text-sm">
          <div><div className="w-48 border-b font-serif italic">Checkout Platform</div><p className="clause-num mt-1">Producer signature</p></div>
          <div><div className="w-48 border-b font-serif italic">Revenue Analytics</div><p className="clause-num mt-1">Consumer signature</p></div>
        </footer>
      </article>
    </main>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <p className="clause-num">Article {n}</p>
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div>
      <p className="clause-num">{label}</p>
      <p className={`mt-1 font-mono text-lg ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-seal" : ""}`}>{value}</p>
    </div>
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${danger ? "border-seal text-seal hover:bg-seal hover:text-destructive-foreground" : "border-primary hover:bg-primary hover:text-primary-foreground"}`}>
      {children}
    </button>
  );
}

function BreakingChanges({ idx }: { idx: number }) {
  if (idx === 0) return <p className="mt-4 text-sm italic text-muted-foreground">Original issue — no prior version.</p>;
  const changes = detectChanges(CONTRACTS[idx - 1]!, CONTRACTS[idx]!);
  const breaking = changes.filter((c) => c.kind === "breaking").length;
  return (
    <div className="mt-4 border bg-card p-4">
      <p className="font-mono text-xs">
        Amendment v{CONTRACTS[idx - 1]!.version} → v{CONTRACTS[idx]!.version}:{" "}
        <span className={breaking ? "text-seal" : "text-ok"}>{breaking ? `${breaking} BREAKING — consumer re-signature required` : "backward compatible"}</span>
      </p>
      <ul className="mt-2 space-y-1 text-sm">{changes.map((c, i) => (
        <li key={i} className={c.kind === "breaking" ? "text-seal" : "text-ok"}>{c.kind === "breaking" ? "✕" : "✓"} {c.message}</li>
      ))}</ul>
    </div>
  );
}

function Spark({ data, c }: { data: number[]; c: Contract }) {
  const w = 600, h = 120;
  const max = Math.max(c.priceMean.max * 1.5, ...data);
  const y = (v: number) => h - (Math.log10(v + 1) / Math.log10(max + 1)) * h;
  const pts = data.map((v, i) => `${(i / 59) * w},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-32 w-full border bg-card">
      <rect x={0} y={y(c.priceMean.max)} width={w} height={y(c.priceMean.min) - y(c.priceMean.max)} className="fill-ok/15" />
      <polyline points={pts} fill="none" className="stroke-primary" strokeWidth={2} />
    </svg>
  );
}

function Lineage({ frozen }: { frozen: boolean }) {
  const nodes = [
    { id: "kafka.orders", x: 70, y: 70, bad: frozen },
    { id: "stg_orders", x: 230, y: 70, bad: frozen },
    { id: "fct_revenue", x: 390, y: 70, bad: frozen },
    { id: "Revenue Dash", x: 550, y: 30, frozen },
    { id: "Pricing Dash", x: 550, y: 110, frozen },
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [2, 4]];
  return (
    <svg viewBox="0 0 640 140" className="w-full border bg-card">
      {edges.map(([a, b]) => (
        <line key={`${a}${b}`} x1={nodes[a!]!.x + 55} y1={nodes[a!]!.y} x2={nodes[b!]!.x - 55} y2={nodes[b!]!.y}
          className={frozen ? "stroke-seal" : "stroke-primary"} strokeWidth={1.5} strokeDasharray={frozen && b! > 2 ? "4 4" : undefined} />
      ))}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x - 55} y={n.y - 16} width={110} height={32} rx={2}
            className={n.frozen ? "fill-accent stroke-seal" : n.bad ? "fill-paper stroke-seal" : "fill-paper stroke-primary"} strokeWidth={1.5} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" className="fill-foreground font-mono text-[11px]">
            {n.frozen ? "❄ " : ""}{n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

async function downloadReport(t: Ticket, c: Contract, pr: ReturnType<typeof generateDbtPr> | null) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFont("times", "bold"); doc.setFontSize(22);
  doc.text("Drift Insurance — Breach Report", 20, 25);
  doc.setFont("courier", "normal"); doc.setFontSize(10);
  const lines = [
    `Claim: ${t.id}`, `Filed: ${new Date(t.at).toLocaleString()}`, `Contract: v${t.version}`,
    `Producer: ${c.producer}`, `Consumer: ${c.consumer}`, "",
    `Covenant: mean(price) between ${c.priceMean.min} and ${c.priceMean.max}`,
    `Observed mean: ${t.observed.toFixed(2)}`, `Root cause: ${t.cause}`,
    `Financial impact: $${t.impact.toLocaleString()}`, "",
    "Actions taken:", "  1. Downstream dashboards frozen to last good state",
    "  2. SLA breach ticket filed", `  3. dbt fix PR drafted: ${pr?.branch ?? "n/a"}`, "",
    ...(pr ? pr.diff.split("\n") : []),
  ];
  doc.text(lines, 20, 40);
  doc.save(`${t.id}-breach-report.pdf`);
}
