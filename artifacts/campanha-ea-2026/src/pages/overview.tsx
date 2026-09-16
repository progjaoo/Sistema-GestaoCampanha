import { useEffect } from 'react';
import { ArrowUpRight, Building2, ClipboardCheck, FileSpreadsheet, MapPin, PackagePlus, Plus, UsersRound, AlertTriangle, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { type CampaignOverview, type City, type Region, useGetCampaignOverview, useListCities, useListRegions } from '@workspace/api-client-react';
import { useAuth } from '@/lib/auth';
import { useOfflineSnapshot } from '@/lib/connectivity';
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from '@/components/ops-shell';
import { PwaInstallCard } from '@/components/pwa-install-card';

type OverviewSnapshot = { overview: CampaignOverview | null; regions: Region[] | null; cities: City[] | null };

export default function OverviewPage() {
  const { can, user } = useAuth();
  const overview = useGetCampaignOverview();
  const regions = useListRegions();
  const cities = useListCities();
  const snapshot = useOfflineSnapshot<OverviewSnapshot>("overview", { userId: user?.id ?? null });
  const cached = snapshot.data;
  const data = overview.data ?? cached?.overview;
  const regionItems = data?.regions ?? regions.data ?? cached?.regions ?? [];
  const cityItems = cities.data ?? cached?.cities ?? [];
  useEffect(() => {
    if (overview.data || regions.data || cities.data) {
      snapshot.saveSnapshot({ overview: overview.data ?? cached?.overview ?? null, regions: regions.data ?? cached?.regions ?? null, cities: cities.data ?? cached?.cities ?? null });
    }
  }, [overview.data, regions.data, cities.data, snapshot.saveSnapshot]);
  if (overview.isLoading || regions.isLoading) return <OpsShell><PageHeading eyebrow="EA 2026 / panorama" title="Visão geral" description="A sala de operações da cobertura territorial." lastUpdatedAt={snapshot.savedAt} stale={Boolean(cached && !overview.data)} /><LoadingRows count={4} /></OpsShell>;
  if ((overview.isError || regions.isError) && !data) return <OpsShell><PageHeading eyebrow="EA 2026 / panorama" title="Visão geral" description="A sala de operações da cobertura territorial." /><ErrorState onRetry={() => { void overview.refetch(); void regions.refetch(); }} /></OpsShell>;
  const totals = data?.totals;
  const max = Math.max(...regionItems.map((item) => item.leadershipCount), 1);
  return <OpsShell>
    <PageHeading eyebrow="EA 2026 / panorama" title="Visão geral" description="Cobertura territorial, liderança local e sinais que pedem atenção." lastUpdatedAt={snapshot.savedAt} stale={Boolean(cached && !overview.data)} action={<Link href="/liderancas" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-explore-leaderships">Explorar lideranças <ArrowUpRight size={15} /></Link>} />
     <PwaInstallCard />
    <section className="mb-8 rounded-2xl border border-border bg-card p-4 shadow-[0_8px_30px_hsl(193_30%_15%_/.03)] sm:p-5" data-testid="quick-actions">
      <div className="mb-4 flex items-center justify-between gap-3"><div><p className="mono-label text-primary">Ações rápidas</p><h2 className="mt-1 text-sm font-extrabold">Comece pela próxima ação da operação</h2></div><Plus size={18} className="text-muted-foreground" /></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          can("leaderships:create") && { href: "/liderancas?create=1", label: "Nova liderança", icon: UsersRound, tone: "primary" },
          can("tasks:create") && { href: "/kanban?create=1", label: "Nova tarefa", icon: ClipboardCheck, tone: "neutral" },
          can("materials:create") && { href: "/materiais?create=1", label: "Nova retirada", icon: PackagePlus, tone: "neutral" },
          can("sheets:view") && { href: "/planilha", label: "Abrir planilha", icon: FileSpreadsheet, tone: "neutral" },
          can("review:view") && { href: "/revisao", label: "Pendências da cidade", icon: AlertTriangle, tone: "neutral" },
        ].filter((action): action is { href: string; label: string; icon: typeof UsersRound; tone: string } => Boolean(action)).map(({ href, label, icon: Icon, tone }) => (
          <Link key={href} href={href} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-3 text-xs font-extrabold transition-colors hover:-translate-y-0.5 hover:shadow-sm ${tone === "primary" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/35 hover:bg-primary/5"}`} data-testid={`quick-action-${label.toLowerCase().replaceAll(" ", "-")}`}><Icon size={16} className="shrink-0" /><span>{label}</span><ArrowUpRight size={13} className="ml-auto opacity-60" /></Link>
        ))}
      </div>
    </section>
    <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: 'Regiões cobertas', value: totals?.regions ?? regionItems.length, icon: MapPin, note: 'territórios ativos', color: 'text-primary' },
        { label: 'Cidades mapeadas', value: totals?.cities ?? regionItems.reduce((sum, item) => sum + item.cityCount, 0), icon: Building2, note: 'com presença registrada', color: 'text-teal-700' },
        { label: 'Lideranças', value: totals?.leaderships ?? regionItems.reduce((sum, item) => sum + item.leadershipCount, 0), icon: UsersRound, note: 'na base operacional', color: 'text-amber-700' },
        { label: 'Itens para revisar', value: totals?.reviewItems ?? 0, icon: AlertTriangle, note: 'pedem ação da equipe', color: 'text-red-700' },
      ].map(({ label, value, icon: Icon, note, color }, index) => <div key={label} className="data-rise rounded-2xl border border-border bg-card p-5 shadow-[0_8px_30px_hsl(193_30%_15%_/.04)]" data-testid={`metric-card-${index}`}>
        <div className="mb-5 flex items-center justify-between"><span className="mono-label text-muted-foreground">{label}</span><Icon size={18} className={color} /></div>
        <div className="text-3xl font-extrabold tracking-[-.05em]" data-testid={`metric-value-${index}`}>{value.toLocaleString('pt-BR')}</div>
        <div className="mt-1 text-xs text-muted-foreground">{note}</div>
      </div>)}
    </section>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="coverage-section">
        <div className="mb-6 flex items-start justify-between">
          <div><p className="mono-label text-primary">Distribuição territorial</p><h2 className="mt-1 text-lg font-extrabold tracking-tight">Cobertura por região</h2></div>
          <TrendingUp size={19} className="text-muted-foreground" />
        </div>
        <div className="space-y-5">
          {regionItems.slice(0, 8).map((region, i) => <div key={region.id} data-testid={`region-row-${region.id}`}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm"><div className="flex min-w-0 items-center gap-2 font-bold"><span className="mono-label w-5 text-muted-foreground">{String(i + 1).padStart(2, '0')}</span><span className="truncate">{region.name}</span></div><span className="shrink-0 font-mono text-xs text-muted-foreground">{region.leadershipCount} lid.</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(6, region.leadershipCount / max * 100)}%` }} /></div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>{region.cityCount} cidades</span><span>{Math.round(region.leadershipCount / Math.max(region.cityCount, 1))} por cidade</span></div>
          </div>)}
        </div>
        {!regionItems.length && <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma região foi encontrada.</p>}
      </section>
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground sm:p-7" data-testid="deputies-section">
        <div className="mb-7 flex items-start justify-between"><div><p className="mono-label text-primary-foreground/55">Alianças em campo</p><h2 className="mt-1 text-lg font-extrabold tracking-tight">Deputados com maior capilaridade</h2></div><UsersRound size={20} className="text-primary-foreground/55" /></div>
        <div className="space-y-4">
          {(data?.topDeputies ?? []).slice(0, 6).map((deputy, i) => <Link key={deputy.name} href="/dobrados" className="flex items-center gap-3 border-b border-primary-foreground/10 pb-4 transition-colors hover:text-primary-foreground/75" data-testid={`deputy-row-${i}`}><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10 text-xs font-bold">{String(i + 1).padStart(2, '0')}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{deputy.name}</p><p className="mt-0.5 text-[11px] text-primary-foreground/55">abrir recorte do dobrado</p></div><span className="font-mono text-xs text-primary-foreground/75">{deputy.leadershipCount}</span><ArrowUpRight size={14} className="shrink-0 text-primary-foreground/45" /></Link>)}
          {!(data?.topDeputies?.length) && <p className="text-sm text-primary-foreground/65">Ainda não há dados de alianças.</p>}
        </div>
        <div className="mt-7 rounded-xl border border-primary-foreground/10 bg-primary-foreground/5 p-4"><div className="flex items-center justify-between"><span className="text-xs text-primary-foreground/60">Cidades carregadas</span><div className="flex items-center gap-3"><StatusPill tone="success">{cities.isLoading ? 'sincronizando' : `${cityItems.length} prontas`}</StatusPill><Link href="/dobrados" className="text-xs font-extrabold hover:underline">Ver todos</Link></div></div></div>
      </section>
    </div>
    <section className="ops-grid mt-5 rounded-2xl border border-border p-5 sm:p-7" data-testid="overview-note">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="mono-label text-primary">Ritmo de operação</p><h2 className="mt-1 text-lg font-extrabold">A base cresce cidade por cidade.</h2><p className="mt-1 text-sm text-muted-foreground">Use a fila de revisão para preservar o caminho entre a planilha de origem e a decisão da equipe.</p></div><Link href="/revisao" className="inline-flex items-center gap-2 text-xs font-extrabold text-primary hover:underline" data-testid="link-review-from-overview">Abrir fila de revisão <ArrowUpRight size={14} /></Link></div>
    </section>
  </OpsShell>;
}