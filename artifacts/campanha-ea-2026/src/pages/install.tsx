import { useState } from "react";
import { ArrowRight, CheckCircle2, Download, Info, Share, Smartphone } from "lucide-react";
import { usePwaInstall } from "@/lib/pwa";

function appBaseUrl() {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return new URL(base, window.location.origin).toString();
}

export default function InstallPage() {
  const { installed, isIos, canPromptInstall, install } = usePwaInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  async function handleInstall() {
    const result = await install();
    if (result === "instructions") setShowInstructions(true);
  }

  function openApp() {
    window.location.assign(appBaseUrl());
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#013968] px-4 py-8 text-foreground sm:px-6">
      <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/15 bg-card shadow-2xl">
        <div className="bg-primary px-6 pb-8 pt-10 text-primary-foreground sm:px-9">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-foreground/10">
            <Smartphone size={27} />
          </div>
          <p className="mono-label mt-7 text-primary-foreground/60">Campanha EA 2026</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">Instale o painel no celular</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-primary-foreground/75">
            Tenha acesso rápido ao sistema pela tela inicial, como um aplicativo.
          </p>
        </div>

        <div className="p-6 sm:p-9">
          {installed ? (
            <>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={22} />
                <div>
                  <h2 className="text-lg font-extrabold">Aplicativo já instalado</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    O painel já está disponível na tela inicial deste dispositivo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openApp}
                className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"
                data-testid="button-open-installed-app"
              >
                Abrir o sistema <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 shrink-0 text-primary" size={21} />
                <div>
                  <h2 className="text-lg font-extrabold">
                    {isIos ? "Adicione à tela de início" : "Instale em poucos segundos"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {isIos
                      ? "No iPhone, abra este link no Safari. Depois, use o botão de compartilhar do navegador."
                      : canPromptInstall
                        ? "Toque no botão abaixo e confirme a instalação quando o navegador pedir."
                        : "Toque no botão abaixo para ver onde fica a opção de instalação no navegador."}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border bg-muted/45 p-4">
                <div className="flex items-start gap-3">
                  <Share className="mt-0.5 shrink-0 text-primary" size={19} />
                  <div className="text-sm font-bold leading-6">
                    {isIos ? (
                      <>
                        <p>1. Toque em Compartilhar no Safari</p>
                        <p>2. Escolha Adicionar à Tela de Início</p>
                        <p>3. Confirme em Adicionar</p>
                      </>
                    ) : (
                      <>
                        <p>1. Toque em Instalar aplicativo</p>
                        <p>2. Confirme no aviso do navegador</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleInstall()}
                className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5"
                data-testid="button-install-from-link"
              >
                <Download size={17} />
                {isIos ? "Ver como adicionar no iPhone" : canPromptInstall ? "Instalar aplicativo agora" : "Ver como instalar"}
              </button>
              {showInstructions && (
                <p className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs font-bold leading-5 text-primary">
                  {isIos
                    ? "Abra este endereço no Safari para concluir: toque em Compartilhar e depois em Adicionar à Tela de Início."
                    : "Abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial."}
                </p>
              )}
            </>
          )}

          <a
            href={appBaseUrl()}
            className="mt-6 flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            data-testid="link-continue-browser"
          >
            Continuar no navegador <ArrowRight size={13} />
          </a>
        </div>
      </section>
    </main>
  );
}