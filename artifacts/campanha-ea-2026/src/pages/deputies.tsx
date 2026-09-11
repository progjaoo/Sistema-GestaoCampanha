import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Handshake, MapPin, Search, UsersRound } from 'lucide-react';
import { Link } from 'wouter';
import { useListCities, useListFederalDeputies, useListLeaderships } from '@workspace/api-client-react';
import { EmptyState, ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from '@/components/ops-shell';

export default function DeputiesPage() {
  const deputies = useListFederalDeputies();
  const allianceDeputies = (deputies.data ?? []).filter((deputy) => deputy.isAlliance);
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [cityId, setCityId] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'city' | 'name' | 'status'>('city');
  const [page, setPage] = useState(1);
  const detailsRef = useRef<HTMLElement>(null);
  const activeId = selectedId ?? allianceDeputies[0]?.id;
  const activeDeputy = allianceDeputies.find((deputy) => deputy.id === activeId);
  const cities = useListCities({ federalDeputyId: activeId });
  const query = useListLeaderships({
    federalDeputyId: activeId,
    cityId,
    search: search || undefined,
    sortBy,
    sortDirection: sortBy === 'status' ? 'desc' : 'asc',
    page,
    pageSize: 25,
  });
  const records = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (query.data?.pageSize ?? 25)));

  const sortedDeputies = useMemo(() => [...allianceDeputies].sort((a, b) => b.leadershipCount - a.leadershipCount), [allianceDeputies]);

  useEffect(() => {
    if (selectedId === undefined) return;
    detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);

  if (deputies.isLoading) return <OpsShell><PageHeading eyebrow="Apoio federal / dobrados" title="Dobrados" description="Cada deputado federal com o recorte de cidades e lideranças que o apoiam." /><LoadingRows count={4} /></OpsShell>;
  if (deputies.isError) return <OpsShell><PageHeading eyebrow="Apoio federal / dobrados" title="Dobrados" description="Cada deputado federal com o recorte de cidades e lideranças que o apoiam." /><ErrorState onRetry={() => void deputies.refetch()} /></OpsShell>;

  return <OpsShell>
    <PageHeading eyebrow="Apoio federal / dobrados" title="Dobrados" description="Selecione um deputado federal para ver a visão equivalente à sua aba da planilha, calculada a partir das relações por cidade." />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {sortedDeputies.map((deputy) => <button key={deputy.id} type="button" onClick={() => { setSelectedId(deputy.id); setCityId(undefined); setPage(1); }} className={`rounded-2xl border p-4 text-left transition-all ${deputy.id === activeId ? 'border-primary bg-primary text-primary-foreground shadow-lg' : 'border-border bg-card hover:border-primary/35'}`} data-testid={`deputy-card-${deputy.id}`}>
        <div className="flex items-start justify-between gap-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${deputy.id === activeId ? 'bg-primary-foreground/10' : 'bg-secondary text-primary'}`}><Handshake size={17} /></span><span className={`font-mono text-xs ${deputy.id === activeId ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{deputy.cityCount} cidades</span></div>
        <p className="mt-4 truncate text-sm font-extrabold">{deputy.name}</p>
        <p className={`mt-1 text-xs ${deputy.id === activeId ? 'text-primary-foreground/65' : 'text-muted-foreground'}`}>{deputy.leadershipCount} dobradas cadastradas</p>
      </button>)}
    </div>
    <section ref={detailsRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_hsl(193_30%_15%_/.03)]" data-testid="deputy-details">
      <div className="border-b border-border p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div><p className="mono-label text-primary">Aba / {activeDeputy?.name ?? 'dobrado'}</p><h2 className="mt-1 text-lg font-extrabold">{activeDeputy?.name ?? 'Selecione um deputado'}</h2><p className="mt-1 text-xs text-muted-foreground">{activeDeputy?.leadershipCount ?? 0} relações em {activeDeputy?.cityCount ?? 0} cidades</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-auto"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar liderança" className="h-10 w-full sm:w-auto rounded-lg border border-input bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring" data-testid="input-search-deputy-leaderships" /></div>
            <select value={cityId ?? ''} onChange={(event) => { setCityId(event.target.value ? Number(event.target.value) : undefined); setPage(1); }} className="h-10 w-full sm:w-auto rounded-lg border border-input bg-background px-3 text-xs font-bold text-muted-foreground outline-none focus:ring-2 focus:ring-ring" aria-label="Filtrar cidades do deputado" data-testid="select-deputy-city"><option value="">Todas as cidades</option>{(cities.data ?? []).map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select>
            <select value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setPage(1); }} className="h-10 w-full sm:w-auto rounded-lg border border-input bg-background px-3 text-xs font-bold text-muted-foreground outline-none focus:ring-2 focus:ring-ring" aria-label="Ordenar relações" data-testid="select-sort-deputy"><option value="city">Cidade A–Z</option><option value="name">Liderança A–Z</option><option value="status">Pendências primeiro</option></select>
          </div>
        </div>
      </div>
      {query.isLoading ? <div className="p-5"><LoadingRows count={5} /></div> : query.isError ? <div className="p-5"><ErrorState onRetry={() => void query.refetch()} /></div> : records.length ? <div className="overflow-x-auto">
        <table className="min-w-[1050px] w-full text-left" data-testid="deputy-leadership-table">
          <thead className="bg-muted/45"><tr className="border-b border-border">{['Cidade', 'Articulador', 'Coordenador', 'Contato', 'Liderança', 'Região', 'Contato', 'Religião', ''].map((heading, index) => <th key={`${heading}-${index}`} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {records.map((record) => <tr key={record.id} className="transition-colors hover:bg-muted/30" data-testid={`deputy-leadership-row-${record.id}`}>
              <td className="px-4 py-4"><p className="text-xs font-extrabold">{record.cityName}</p><p className="mt-1 text-[10px] text-muted-foreground">{record.regionName}</p></td>
              <td className="px-4 py-4 text-xs font-bold">{record.articulatorName || 'Não informado'}</td>
              <td className="px-4 py-4 text-xs text-muted-foreground">{record.coordinatorName || 'Não informado'}</td>
              <td className="px-4 py-4 text-xs text-muted-foreground">{record.coordinatorContact || 'Não informado'}</td>
              <td className="px-4 py-4"><Link href={`/liderancas/${record.id}`} className="text-xs font-extrabold text-primary hover:underline">{record.name}</Link><p className="mt-1 text-[11px] text-muted-foreground">{record.leadershipContact || 'Contato não informado'}</p></td>
              <td className="px-4 py-4 text-xs text-muted-foreground">{record.internalRegion || 'Não informado'}</td>
              <td className="px-4 py-4 text-xs text-muted-foreground">{record.leadershipContact || 'Não informado'}</td>
              <td className="px-4 py-4 text-xs text-muted-foreground">{record.religion || 'Não informado'}</td>
              <td className="px-4 py-4">{record.needsReview && <StatusPill tone="warning">Revisar</StatusPill>}</td>
            </tr>)}
          </tbody>
        </table>
      </div> : <div className="p-5"><EmptyState title="Nenhuma relação encontrada" detail="Este deputado ainda não possui uma relação para os filtros selecionados." /></div>}
      <div className="flex items-center justify-between border-t border-border px-5 py-3"><span className="text-[11px] text-muted-foreground">Mostrando {records.length ? ((page - 1) * (query.data?.pageSize ?? 25)) + 1 : 0}–{Math.min(page * (query.data?.pageSize ?? 25), total)} de {total}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded-md border border-border p-2 text-muted-foreground disabled:opacity-30" aria-label="Página anterior"><ChevronLeft size={15} /></button><button disabled={page >= pages} onClick={() => setPage((current) => current + 1)} className="rounded-md border border-border p-2 text-muted-foreground disabled:opacity-30" aria-label="Próxima página"><ChevronRight size={15} /></button></div></div>
    </section>
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-secondary bg-secondary/60 p-4 text-xs text-secondary-foreground"><MapPin size={16} className="shrink-0" /><span>Esta visão é recalculada a partir das abas de cidade. Assim, os totais permanecem alinhados com a base operacional e não duplicam linhas antigas das abas de deputado.</span><UsersRound size={16} className="ml-auto hidden shrink-0 sm:block" /></div>
  </OpsShell>;
}