import { AlertCircle } from 'lucide-react';
import { OpsShell, PageHeading } from '@/components/ops-shell';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <OpsShell>
      <PageHeading eyebrow="Erro 404" title="Página não encontrada" description="O caminho que você tentou acessar não existe ou não está disponível para o seu perfil." action={<Link href="/" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-sm">Voltar ao início</Link>} />
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertCircle size={24} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-extrabold">Endereço incorreto</p>
        <p className="mt-1 text-xs text-muted-foreground">Verifique a URL ou use a navegação lateral.</p>
      </div>
    </OpsShell>
  );
}
