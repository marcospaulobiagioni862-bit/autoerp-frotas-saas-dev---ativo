import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { moveFlexBlankContractText } from '../../domain/contracts/moveflexDefaultContractTemplate';

const MOVEFLEX_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="72" viewBox="0 0 220 72"><rect width="220" height="72" rx="12" fill="#ffffff"/><circle cx="34" cy="36" r="22" fill="#6d28d9"/><path d="M22 38l8 8 17-20" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="66" y="43" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#111827">MoveFlex</text></svg>';
export const MOVEFLEX_LOGO_DATA_URL = `data:image/svg+xml,${encodeURIComponent(MOVEFLEX_LOGO_SVG)}`;

const BASE_CONTRACT_TEXT = moveFlexBlankContractText();

function wrap(font:PDFFont,text:string,size:number,maxWidth:number):string[] {
  if(!text.trim()) return [''];
  const words=text.trim().split(/\s+/);
  const lines:string[]=[];let current='';
  for(const word of words){
    const candidate=current?`${current} ${word}`:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth){current=candidate;continue;}
    if(current)lines.push(current);
    current=word;
  }
  if(current)lines.push(current);
  return lines;
}

export const MOVEFLEX_BASE_CONTRACT_PDF_FILENAME = 'Contrato_MoveFlex_Modelo_Base.pdf';

export async function buildMoveFlexBaseContractPdf():Promise<Uint8Array> {
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth=595.28,pageHeight=841.89,margin=44,maxWidth=pageWidth-margin*2;
  let page:PDFPage;let y=0;

  const addPage=()=>{
    page=pdf.addPage([pageWidth,pageHeight]);
    page.drawText('MoveFlex',{x:margin,y:pageHeight-56,size:18,font:bold,color:rgb(0.43,0.16,0.85)});
    page.drawText('Locação de Veículos',{x:margin,y:pageHeight-72,size:8.5,font:regular,color:rgb(0.32,0.35,0.42)});
    page.drawText('MoveFlex - Locação de Veículos',{x:pageWidth-250,y:pageHeight-52,size:10,font:bold,color:rgb(0.23,0.12,0.45)});
    page.drawLine({start:{x:margin,y:pageHeight-86},end:{x:pageWidth-margin,y:pageHeight-86},thickness:1,color:rgb(0.42,0.3,0.7)});
    y=pageHeight-108;
  };
  addPage();

  for(const raw of BASE_CONTRACT_TEXT.split('\n')){
    const text=raw.trimEnd();
    const heading=/^(CONTRATO |LOCADORA$|LOCATÁRIO$|CLÁUSULA |ANEXO I|TESTEMUNHAS:)/.test(text);
    const font=heading?bold:regular;
    const size=heading?10.2:8.7;
    const lineHeight=heading?14:11.4;
    const lines=wrap(font,text,size,maxWidth);
    if(y-lines.length*lineHeight<54) addPage();
    for(const line of lines){
      if(line)page!.drawText(line,{x:margin,y,size,font,color:rgb(0.08,0.09,0.12),maxWidth});
      y-=lineHeight;
    }
    if(!text)y-=3;
    else if(heading)y-=3;
  }

  const pages=pdf.getPages();
  pages.forEach((p,index)=>p.drawText(`${index+1} / ${pages.length}`,{x:pageWidth-72,y:24,size:8,font:regular,color:rgb(0.45,0.45,0.5)}));
  return await pdf.save();
}

export function downloadPreparedMoveFlexBaseContractPdf(bytes:Uint8Array):void {
  const blob=new Blob([bytes],{type:'application/pdf'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=MOVEFLEX_BASE_CONTRACT_PDF_FILENAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}

export async function downloadMoveFlexBaseContractPdf():Promise<void> {
  downloadPreparedMoveFlexBaseContractPdf(await buildMoveFlexBaseContractPdf());
}
