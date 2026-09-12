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

// Convert column index (0-based) to letter (A, B, C...)
function getColumnLetter(colIndex: number) {
  let letter = "";
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
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
      action={<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{data?.spreadsheetUrl && <a href={data.spreadsheetUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-extrabold hover:bg-muted sm:flex-none" data-testid="link-open-google-sheets"><ExternalLink size={14} /> Abrir no Google Sheets</a>}<button onClick={() => void load()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground sm:flex-none" data-testid="button-refresh-sheet"><RefreshCw size={14} /> Atualizar</button></div>}
    />
    {error && <p className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
    <section className="mb-5 overflow-x-auto rounded-xl border border-border bg-card p-2 scrollbar-thin sm:p-3">
      <div className="flex items-center gap-2 w-max">
        <FileSpreadsheet size={18} className="mx-2 hidden text-primary sm:block" />
        {data?.tabs.map((item, index) => <button key={item} onClick={() => { setTab(item); void load(item); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-extrabold transition-colors ${item === data.selectedTab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"}`} data-testid={`button-sheet-tab-${index}`}>{item}</button>)}
      </div>
    </section>

    <section className="flex h-[calc(100dvh-17rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:h-[calc(100dvh-15rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 p-3 sm:p-4">
        <div><p className="text-sm font-extrabold">Aba: {data?.selectedTab ?? "—"}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{data?.totalRows ?? 0} linhas carregadas · somente leitura</p></div>
      </div>
      <div className="flex-1 overflow-auto bg-background scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <table className="min-w-max border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[#f8f9fa] shadow-[0_1px_0_hsl(var(--border))] dark:bg-[#1a1d1e]">
            <tr>
              <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-[#f8f9fa] text-center align-middle font-normal text-muted-foreground dark:bg-[#1a1d1e]"></th>
              {data?.headers.map((_, index) => (
                <th key={`col-${index}`} className="min-w-[128px] border-b border-r border-border px-2 py-1 text-center align-middle font-normal text-muted-foreground select-none">
                  {getColumnLetter(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((row) => (
              <tr key={row.sourceRow} className="group hover:bg-muted/30">
                <td className="sticky left-0 z-10 w-12 border-b border-r border-border bg-[#f8f9fa] text-center font-mono text-muted-foreground select-none dark:bg-[#1a1d1e]">
                  {row.sourceRow}
                </td>
                {row.values.map((value, index) => (
                  <td key={`${row.sourceRow}-${index}`} className="max-w-[360px] border-b border-r border-border px-3 py-2 align-top text-foreground/80 [overflow-wrap:anywhere] group-hover:text-foreground">
                    {value || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.rows.length && <div className="flex flex-col items-center justify-center p-10 text-muted-foreground"><FileSpreadsheet size={32} className="mb-3 opacity-20" /><p className="text-sm font-semibold">A aba selecionada está vazia.</p></div>}
      </div>
    </section>
  </OpsShell>;
}