import { FileDown } from 'lucide-react';

interface MobileHeaderProps {
  title: string;
  onExportPDF?: () => void;
}

export default function MobileHeader({
  title,
  onExportPDF,
}: MobileHeaderProps) {
  const handleSavePDF = () => {
    if (onExportPDF) {
      onExportPDF();
    } else {
      window.print();
    }
  };

  return (
    <header className="md:hidden bg-white py-3 px-4 border-b border-slate-200 flex items-center justify-between no-print">
      <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider truncate mr-2">
        {title}
      </h2>
      <button
        onClick={handleSavePDF}
        title="Salvar esta aba como PDF"
        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs px-2.5 py-1.5 rounded-md shadow-xs active:scale-95 shrink-0 select-none cursor-pointer"
      >
        <FileDown className="w-3.5 h-3.5 shrink-0" />
        <span>Salvar PDF</span>
      </button>
    </header>
  );
}
