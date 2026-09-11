import { useEffect, useState } from "react";
import { ExternalLink, FileSpreadsheet, RefreshCw } from "lucide-react";
import { authFetch, useAuth } from "@/lib/auth";
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";

type SheetData = {
  title: string;
  spreadsheetUrl: string | null;
  tabs: string[];
  selectedTab: string | null;
  headers: string[];
  rows: Array<{ sourceRow: number; values: string[] }>;
  matches: number[];
  totalRows: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível consultar a planilha.");
  return body as T;
}

export default function SheetsPage() {
  const { can } = useAuth();
  const [data, setData] = useState<SheetData | null>(null);
  const [tab, setTab] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(selectedTab = tab) {
    setLoading(true);
    setError("");
    try {
      const query = selectedTab ? `?tab=${encodeURIComponent(selectedTab)}` : "";
      const next = await readJson<SheetData>(await authFetch(`/api/sheets/campaign${query}`));
      setData(next);
      if (!tab && next.selectedTab) setTab(next.selectedTab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível consultar a planilha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (can("sheets:view")) void load(); }, [can]);

  if (!can("sheets:view")) return <OpsShell><PageHeading eyebrow="Integrações" title="Planilha da campanha" description="Seu perfil não possui permissão para consultar a fonte oficial." /></OpsShell>;
  if (loading && !data) return <OpsShell><PageHeading eyebrow="Integrações / Google Sheets" title="Planilha da campanha" description="Consulta somente leitura da Campanha_EA_2026_REV-006." /><LoadingRows count={5} /></OpsShell>;
  if (error && !data) return <OpsShell><PageHeading eyebrow="Integrações / Google Sheets" title="Planilha da campanha" description="Consulta somente leitura da Campanha_EA_2026_REV-006." /><ErrorState label={error} onRetry={() => void load()} /></OpsShell>;

  return <OpsShell>
    <PageHeading
      eyebrow="Integrações / Google Sheets"
      title={data?.title ?? "Planilha da campanha"}
      description="Fonte oficial em modo somente leitura para conferência e cruzamento com os registros do sistema."
      action={<div className="flex items-center gap-2">{data?.spreadsheetUrl && <a href={data.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-extrabold hover:bg-muted"><ExternalLink size={14} /> Abrir no Google Sheets</a>}<button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground"><RefreshCw size={14} /> Atualizar</button></div>}
    />
    {error && <p className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
    <section className="mb-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet size={18} className="text-primary" />
        {data?.tabs.map((item) => <button key={item} onClick={() => { setTab(item); void load(item); }} className={`rounded-lg px-3 py-2 text-xs font-extrabold ${item === data.selectedTab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>{item}</button>)}
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div><p className="text-sm font-extrabold">Aba: {data?.selectedTab ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">{data?.totalRows ?? 0} linhas carregadas para conferência.</p></div>
        <StatusPill tone="success">{data?.matches.length ?? 0} linhas relacionadas ao sistema</StatusPill>
      </div>
      <div className="max-h-[65vh] overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-3">Linha</th>{data?.headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-3">{header || `Coluna ${index + 1}`}</th>)}</tr></thead>
          <tbody>{data?.rows.map((row) => <tr key={row.sourceRow} className={`border-t border-border ${data.matches.includes(row.sourceRow) ? "bg-emerald-50/60" : ""}`}><td className="px-3 py-2 font-mono text-muted-foreground">{row.sourceRow}</td>{row.values.map((value, index) => <td key={`${row.sourceRow}-${index}`} className="max-w-[280px] whitespace-nowrap px-3 py-2">{value || "—"}</td>)}</tr>)}</tbody>
        </table>
        {!data?.rows.length && <p className="p-10 text-center text-sm text-muted-foreground">A aba selecionada não possui linhas de dados.</p>}
      </div>
    </section>
  </OpsShell>;
}