import { ArrowLeft, Printer } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PlanDocumentView } from "../components/PlanDocument";
import { useAppState } from "../state/store";

export function DocumentPrint() {
  const { documentId } = useParams();
  const { state } = useAppState();
  const document = state.planDocuments.find((item) => item.id === documentId);

  if (!document && !state.loading) return <Navigate to="/documentos" replace />;
  if (!document) return null;

  return (
    <main className="min-h-screen bg-white px-5 py-5 text-text print:p-0">
      <div className="mx-auto mb-5 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <Link to="/documentos" className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text">
          <ArrowLeft className="h-4 w-4" />
          Documentos
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-4 text-sm font-medium text-text transition hover:border-accent/30"
        >
          <Printer className="h-4 w-4" />
          Imprimir ou salvar PDF
        </button>
      </div>
      <PlanDocumentView document={document} printMode />
    </main>
  );
}
