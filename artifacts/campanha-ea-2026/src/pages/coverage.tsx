import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  MapPin,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import {
  useListCities,
  useListLeaderships,
  useListRegions,
} from '@workspace/api-client-react';
import type {
  City,
  Leadership,
  Region,
} from '@workspace/api-client-react';
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from '@/components/ops-shell';

function CityLeadershipDialog({
  city,
  onClose,
}: {
  city: City;
  onClose: () => void;
}) {
  const query = useListLeaderships({
    cityId: city.id,
    page: 1,
    pageSize: 100,
  });
  const records = query.data?.items ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/45 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="city-dialog-title" data-testid="dialog-city-leaderships">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fechar detalhes da cidade" />
      <section className="relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-5 border-b border-border px-5 py-5 sm:px-7">
          <div>
            <p className="mono-label text-primary">Cobertura / cidade</p>
            <h2 id="city-dialog-title" className="mt-1 text-xl font-extrabold tracking-tight">{city.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{city.regionName} · {city.leadershipCount} relações cadastradas</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar modal" data-testid="button-close-city-dialog">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4 sm:p-6">
          {query.isLoading ? <LoadingRows count={4} /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : records.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-[920px] w-full text-left" data-testid="city-leadership-table">
                <thead className="bg-muted/55">
                  <tr className="border-b border-border">
                    {['Liderança', 'Articulador', 'Contatos', 'Apoio / dobrado', 'Situação', ''].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((record) => <tr key={record.id} className="transition-colors hover:bg-muted/30" data-testid={`city-leadership-row-${record.id}`}>
                    <td className="px-4 py-4">
                      <Link href={`/liderancas/${record.id}`} onClick={onClose} className="font-extrabold text-primary hover:underline">{record.name}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">{record.leadershipContact || 'Contato não informado'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold">{record.articulatorName || 'Não informado'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{record.internalRegion || 'Região interna não informada'}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p>{record.leadershipContact || 'Liderança: não informado'}</p>
                      <p className="mt-1">{record.coordinatorName ? `${record.coordinatorName}${record.coordinatorContact ? ` · ${record.coordinatorContact}` : ''}` : 'Coordenação: não informado'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold">{record.federalDeputyName || record.originalFederalDeputy || 'Não informado'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{record.allianceStatus || 'Sem status de aliança'}</p>
                    </td>
                    <td className="px-4 py-4">
                      {record.needsReview ? <StatusPill tone="warning">Revisar</StatusPill> : <StatusPill tone="success">Contextualizado</StatusPill>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link href={`/liderancas/${record.id}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs font-extrabold text-primary hover:underline">Abrir <ExternalLink size={13} /></Link>
                    </td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          ) : <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhuma liderança cadastrada nesta cidade.</div>}
        </div>
      </section>
    </div>
  );
}

function RegionGroup({
  region,
  cities,
  expanded,
  onToggle,
  onSelectCity,
}: {
  region: Region;
  cities: City[];
  expanded: boolean;
  onToggle: () => void;
  onSelectCity: (city: City) => void;
}) {
  return (
    <section className="border-b border-border last:border-b-0" data-testid={`coverage-region-${region.id}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/45">
        <span className="min-w-0 truncate text-sm font-extrabold">{region.name}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-0.5 font-mono">{region.cityCount}</span>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
      </button>
      {expanded && <div className="space-y-1 px-2 pb-3">
        {cities.map((city) => <button key={city.id} type="button" onClick={() => onSelectCity(city)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-secondary" data-testid={`coverage-city-nav-${city.id}`}>
          <span className="flex min-w-0 items-center gap-2"><MapPin size={13} className="shrink-0 text-muted-foreground" /><span className="truncate font-semibold">{city.name}</span></span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{city.leadershipCount}</span>
        </button>)}
      </div>}
    </section>
  );
}

export default function CoveragePage() {
  const regions = useListRegions();
  const cities = useListCities();
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const allRegions = regions.data ?? [];
  const allCities = cities.data ?? [];
  const filteredCities = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return allCities.filter((city) => {
      const matchesRegion = selectedRegion === null || city.regionId === selectedRegion;
      const matchesSearch = !normalizedSearch || `${city.name} ${city.regionName}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      return matchesRegion && matchesSearch;
    });
  }, [allCities, search, selectedRegion]);
  const cityGroups = useMemo(() => allRegions.map((region) => ({
    region,
    cities: filteredCities.filter((city) => city.regionId === region.id),
  })).filter((group) => group.cities.length), [allRegions, filteredCities]);
  const totalLeaderships = allCities.reduce((sum, city) => sum + city.leadershipCount, 0);

  const toggleRegion = (id: number) => setExpanded((current) => ({ ...current, [id]: !(current[id] ?? true) }));

  if (regions.isLoading || cities.isLoading) return <OpsShell><PageHeading eyebrow="Operação / cobertura" title="Cobertura" description="Regiões, cidades e relações de campo." /><LoadingRows count={5} /></OpsShell>;
  if (regions.isError || cities.isError) return <OpsShell><PageHeading eyebrow="Operação / cobertura" title="Cobertura" description="Regiões, cidades e relações de campo." /><ErrorState onRetry={() => { void regions.refetch(); void cities.refetch(); }} /></OpsShell>;

  return <OpsShell>
    <PageHeading
      eyebrow="Operação / cobertura"
      title="Visão macro por cidade"
      description="Abra uma cidade para conferir lideranças, articuladores, contatos e quem cada relação está apoiando."
      action={<div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground sm:flex"><Filter size={14} /> {selectedRegion ? allRegions.find((region) => region.id === selectedRegion)?.name : 'Todas as regiões'}</div>}
    />
    <section className="mb-5 grid gap-3 sm:grid-cols-3">
      {[
        { label: 'Cidades na seleção', value: filteredCities.length, icon: Building2 },
        { label: 'Lideranças cadastradas', value: totalLeaderships, icon: UsersRound },
        { label: 'Pendências de conferência', value: allCities.filter((city) => city.leadershipCount === 0).length, icon: AlertTriangle },
      ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-[0_8px_30px_hsl(193_30%_15%_/.04)]">
        <div className="flex items-center justify-between"><span className="mono-label text-muted-foreground">{label}</span><Icon size={18} className="text-primary" /></div>
        <p className="mt-3 text-2xl font-extrabold tracking-[-.04em]">{value.toLocaleString('pt-BR')}</p>
      </div>)}
    </section>
    <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
      <aside className="h-fit overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-4"><p className="mono-label text-primary">Território</p><h2 className="mt-1 text-sm font-extrabold">Regiões e cidades</h2></div>
        <div className="border-b border-border p-3">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cidade" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring" data-testid="input-search-coverage" /></div>
          <button type="button" onClick={() => setSelectedRegion(null)} className={`mt-2 w-full rounded-lg px-3 py-2 text-left text-xs font-bold ${selectedRegion === null ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted'}`}>Todas as regiões</button>
        </div>
        <div>{cityGroups.map(({ region, cities: regionCities }) => <RegionGroup key={region.id} region={region} cities={regionCities} expanded={expanded[region.id] ?? true} onToggle={() => toggleRegion(region.id)} onSelectCity={setSelectedCity} />)}</div>
      </aside>
      <main>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><p className="mono-label text-primary">Cidades monitoradas</p><h2 className="mt-1 text-lg font-extrabold">Relações por território</h2></div>
          <span className="text-xs text-muted-foreground">{filteredCities.length} cidades</span>
        </div>
        {cityGroups.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {cityGroups.flatMap(({ region, cities: regionCities }) => regionCities.map((city) => <button key={city.id} type="button" onClick={() => setSelectedCity(city)} className="group rounded-2xl border border-border bg-card p-5 text-left shadow-[0_8px_30px_hsl(193_30%_15%_/.03)] transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg" data-testid={`coverage-city-card-${city.id}`}>
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><MapPin size={17} /></span><div className="min-w-0"><h3 className="truncate text-sm font-extrabold">{city.name}</h3><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{region.name}</p></div></div><ChevronRight size={17} className="text-muted-foreground transition-transform group-hover:translate-x-1" /></div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div><p className="text-[10px] text-muted-foreground">Lideranças</p><p className="mt-1 text-lg font-extrabold">{city.leadershipCount}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Relações</p><p className="mt-1 text-lg font-extrabold">{city.leadershipCount}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Situação</p><p className="mt-1 text-xs font-extrabold text-emerald-700">Ativa</p></div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground"><span>Ver pessoas e apoios</span><span className="font-mono">abrir cidade</span></div>
          </button>))}
        </div> : <div className="rounded-2xl border border-dashed border-border bg-card p-14 text-center text-sm text-muted-foreground">Nenhuma cidade encontrada para este filtro.</div>}
      </main>
    </div>
    {selectedCity && <CityLeadershipDialog city={selectedCity} onClose={() => setSelectedCity(null)} />}
  </OpsShell>;
}