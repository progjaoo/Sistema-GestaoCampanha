import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Filter, Plus, Search, X } from 'lucide-react';
import { Link } from 'wouter';
import { useCreateLeadership, useListCities, useListLeaderships } from '@workspace/api-client-react';
import { EmptyState, ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from '@/components/ops-shell';

export default function LeadershipsPage() {
  const [search, setSearch] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const params = useMemo(() => ({ search: search || undefined, reviewOnly: reviewOnly || undefined, page, pageSize: 12 }), [search, reviewOnly, page]);
  const query = useListLeaderships(params);
  const cities = useListCities();
  const create = useCreateLeadership();
  const records = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (query.data?.pageSize ?? 12)));
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({ data: { name: String(form.get('name') ?? ''), cityId: Number(form.get('cityId')), leadershipContact: String(form.get('contact') || '') || null, internalRegion: null, articulatorId: null, coordinatorId: null, coordinatorContact: null, federalDeputyId: null, allianceStatus: null, originalFederalDeputy: null, religion: null } } as Parameters<typeof create.mutate>[0], { onSuccess: () => { setShowCreate(false); void query.refetch(); } });
  };
  return <OpsShell>
    <PageHeading eyebrow="Base territorial / lideranças" title="Lideranças" description="Encontre uma liderança, confira o vínculo territorial e preserve a origem do registro." action={<button onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5" data-testid="button-create-leadership"><Plus size={15} /> Nova liderança</button>} />
    <div className="mb-5 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome, cidade ou articulador" className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" data-testid="input-search-leaderships" /></div>
        <button onClick={() => { setReviewOnly(!reviewOnly); setPage(1); }} className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-xs font-extrabold transition-colors ${reviewOnly ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-input text-muted-foreground hover:text-foreground'}`} data-testid="button-filter-review"><Filter size={15} /> Apenas revisão {reviewOnly && '· ativa'}</button>
        {(search || reviewOnly) && <button onClick={() => { setSearch(''); setReviewOnly(false); setPage(1); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="button-clear-filters"><X size={14} /> Limpar</button>}
      </div>
    </div>
    {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : <section className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="leadership-table-section">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><span className="text-sm font-extrabold">Registros encontrados</span><span className="ml-2 font-mono text-xs text-muted-foreground">{total.toLocaleString('pt-BR')}</span></div><span className="mono-label text-muted-foreground">Página {page} / {pages}</span></div>
      {records.length ? <div className="divide-y divide-border">{records.map((record) => <Link href={`/liderancas/${record.id}`} key={record.id} className="group grid gap-3 px-5 py-4 transition-colors hover:bg-muted/45 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center" data-testid={`row-leadership-${record.id}`}>
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-extrabold">{record.name}</span>{record.needsReview && <StatusPill tone="warning">revisar</StatusPill>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{record.leadershipContact || 'Contato não informado'}</p></div>
        <div><p className="mono-label text-muted-foreground">Território</p><p className="mt-1 truncate text-xs font-bold">{record.cityName}</p><p className="truncate text-[11px] text-muted-foreground">{record.regionName}</p></div>
        <div><p className="mono-label text-muted-foreground">Coordenação</p><p className="mt-1 truncate text-xs font-bold">{record.coordinatorName || 'Sem coordenador'}</p></div>
        <ChevronRight size={17} className="hidden text-muted-foreground transition-transform group-hover:translate-x-1 sm:block" />
      </Link>)}</div> : <EmptyState title="Nenhuma liderança encontrada" detail="Tente outro nome, cidade ou remova os filtros ativos." />}
      <div className="flex items-center justify-between border-t border-border px-5 py-3"><span className="text-[11px] text-muted-foreground">Mostrando {records.length ? ((page - 1) * (query.data?.pageSize ?? 12)) + 1 : 0}–{Math.min(page * (query.data?.pageSize ?? 12), total)} de {total}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-border p-2 text-muted-foreground disabled:opacity-30" aria-label="Página anterior" data-testid="button-previous-page"><ChevronLeft size={15} /></button><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-border p-2 text-muted-foreground disabled:opacity-30" aria-label="Próxima página" data-testid="button-next-page"><ChevronRight size={15} /></button></div></div>
    </section>}
    {showCreate && <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" data-testid="dialog-create-leadership"><form onSubmit={submitCreate} className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Novo registro</p><h2 className="mt-1 text-xl font-extrabold">Adicionar liderança</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar formulário" data-testid="button-close-create"><X size={18} /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold">Nome completo</span><input name="name" required className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="input-create-name" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Cidade</span><select name="cityId" required defaultValue="" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="select-create-city"><option value="" disabled>Selecione a cidade</option>{(cities.data ?? []).map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Contato</span><input name="contact" placeholder="Telefone ou e-mail" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="input-create-contact" /></label></div><button disabled={create.isPending} className="mt-7 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-submit-create">{create.isPending ? 'Salvando registro…' : 'Salvar liderança'}</button>{create.isError && <p className="mt-3 text-center text-xs font-semibold text-destructive">Não foi possível salvar. Verifique os dados e tente novamente.</p>}</form></div>}
  </OpsShell>;
}