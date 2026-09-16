import { FileDown } from 'lucide-react';

interface DesktopHeaderProps {
  title: string;
  onExportPDF?: () => void;
}

export default function DesktopHeader({
  title,
  onExportPDF,
}: DesktopHeaderProps) {
  const handleSavePDF = () => {
    if (onExportPDF) {
      onExportPDF();
    } else {
      window.print();
    }
  };

  return (
    <header className="hidden md:flex bg-white h-16 border-b border-slate-200/80 px-8 items-center justify-between sticky top-0 z-30 shadow-xs no-print">
      <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
        {title}
      </h1>
      <div className="flex items-center gap-4 text-sm">
        <button
          onClick={handleSavePDF}
          title="Salvar/Exportar esta aba em formato PDF"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all hover:shadow-md cursor-pointer select-none"
        >
          <FileDown className="w-4 h-4 shrink-0" />
          <span>Salvar PDF</span>
        </button>
        <span className="text-slate-400 font-medium font-mono border-l border-slate-200 pl-4">
          AutoERP Enterprise v1.2
        </span>
        <div className="h-8 w-8 bg-red-600 rounded-full flex items-center justify-center font-black text-white text-xs select-none shadow-sm shadow-red-500/20">
          A
        </div>
      </div>
    </header>
  );
}
