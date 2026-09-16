import { useState } from "react";
import { Download, Info, Link2, Share, Smartphone, X } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa";
import { toast } from "@/hooks/use-toast";

export function PwaInstallCard() {
  const { shouldShow, isIos, canPromptInstall, install, dismiss } = usePwaInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (!shouldShow) return null;

  async function handleInstall() {
    const result = await install();
    if (result === "instructions") setShowInstructions(true);
  }

  async function handleShare() {
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    const url = new URL(base, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Campanha EA 2026",
          text: "Acesse o sistema da Campanha EA 2026 e instale no celular.",
          url,
        });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado", description: "Envie o link para o diretor ou para qualquer pessoa da equipe." });
        return;
      }
      toast({ title: "Link do sistema", description: url });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      toast({ title: "Não foi possível compartilhar", description: "Copie o endereço do navegador e envie para a equipe.", variant: "destructive" });
    }
  }

  return (
    <>
      <section className="relative mb-8 overflow-hidden rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[0_12px_35px_hsl(193_80%_24%_/.18)] sm:p-6" data-testid="pwa-install-card">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-2 text-primary-foreground/65 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
          aria-label="Dispensar convite de instalação"
          data-testid="button-dismiss-pwa-install"
        >
          <X size={16} />
        </button>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/10">
              <Smartphone size={23} />
            </div>
            <div className="min-w-0 pr-5">
              <p className="mono-label text-primary-foreground/60">Acesso rápido</p>
              <h2 className="mt-1 text-lg font-extrabold tracking-tight">Instale o aplicativo da campanha</h2>
              <p className="mt-1 max-w-xl text-sm leading-5 text-primary-foreground/70">
                Abra o painel pela tela inicial do dispositivo, sem precisar procurar o navegador.
              </p>
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary-foreground/25 px-4 py-3 text-xs font-extrabold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              data-testid="button-share-pwa-link"
            >
              <Link2 size={15} />
              Compartilhar link
            </button>
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-foreground px-4 py-3 text-xs font-extrabold text-primary shadow-sm transition-transform hover:-translate-y-0.5"
              data-testid="button-install-pwa"
            >
              <Download size={15} />
              {isIos ? "Como instalar no iPhone" : canPromptInstall ? "Instalar aplicativo" : "Ver como instalar"}
            </button>
          </div>
        </div>
      </section>

      {showInstructions && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pwa-instructions-title" data-testid="pwa-install-instructions">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Info size={19} /></div>
              <div>
                <h2 id="pwa-instructions-title" className="text-lg font-extrabold">Instale na tela inicial</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {isIos
                    ? "No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
                    : "Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial."}
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-muted/45 p-4 text-sm font-semibold text-foreground">
              <div className="flex items-center gap-3"><Share size={17} className="text-primary" /><span>{isIos ? "Compartilhar → Adicionar à Tela de Início" : "Menu do navegador → Instalar aplicativo"}</span></div>
            </div>
            <button type="button" onClick={() => setShowInstructions(false)} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground" data-testid="button-close-pwa-instructions">Entendi</button>
          </div>
        </div>
      )}
    </>
  );
}