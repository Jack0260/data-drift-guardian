CREATE TABLE public.breach_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code text NOT NULL,
  contract_version text NOT NULL,
  observed_mean numeric NOT NULL,
  impact_usd integer NOT NULL,
  cause text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fix_prs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.breach_tickets(id) ON DELETE CASCADE,
  title text NOT NULL,
  branch text NOT NULL,
  diff text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.breach_tickets, public.fix_prs TO anon, authenticated;
GRANT ALL ON public.breach_tickets, public.fix_prs TO service_role;
ALTER TABLE public.breach_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fix_prs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tickets" ON public.breach_tickets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public file tickets" ON public.breach_tickets FOR INSERT TO anon, authenticated WITH CHECK (impact_usd >= 0);
CREATE POLICY "Public read prs" ON public.fix_prs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public create prs" ON public.fix_prs FOR INSERT TO anon, authenticated WITH CHECK (length(diff) < 20000);