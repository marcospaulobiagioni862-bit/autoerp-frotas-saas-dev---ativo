import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { moveFlexBlankContractText } from '../../domain/contracts/moveflexDefaultContractTemplate';
import { MOVEFLEX_LOGO_DATA_URL, MOVEFLEX_LOGO_JPEG_BASE64 } from '../../domain/contracts/moveflexBrand';

export { MOVEFLEX_LOGO_DATA_URL };

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
  const logo=await pdf.embedJpg(Uint8Array.from(atob(MOVEFLEX_LOGO_JPEG_BASE64), (char) => char.charCodeAt(0)));
  const pageWidth=595.28,pageHeight=841.89,margin=44,maxWidth=pageWidth-margin*2;
  let page:PDFPage;let y=0;

  const addPage=()=>{
    page=pdf.addPage([pageWidth,pageHeight]);
    page.drawImage(logo,{x:margin,y:pageHeight-113,width:176,height:99});
    page.drawText('CONTRATO DE LOCAÇÃO DE VEÍCULO',{x:pageWidth-312,y:pageHeight-49,size:12,font:bold,color:rgb(0.30,0.10,0.55)});
    page.drawText('Modelo profissional • sujeito a versionamento',{x:pageWidth-312,y:pageHeight-66,size:8,font:regular,color:rgb(0.38,0.41,0.48)});
    page.drawLine({start:{x:margin,y:pageHeight-122},end:{x:pageWidth-margin,y:pageHeight-122},thickness:1.4,color:rgb(0.42,0.16,0.75)});
    page.drawText('MOVEFLEX',{x:185,y:pageHeight/2,size:58,font:bold,color:rgb(0.43,0.16,0.85),opacity:0.035});
    y=pageHeight-145;
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
  pages.forEach((p,index)=>{p.drawLine({start:{x:margin,y:38},end:{x:pageWidth-margin,y:38},thickness:0.7,color:rgb(0.76,0.70,0.86)});p.drawText('MoveFlex • Locação de Veículos',{x:margin,y:22,size:7.5,font:regular,color:rgb(0.38,0.41,0.48)});p.drawText(`Página ${index+1} de ${pages.length}`,{x:pageWidth-96,y:22,size:7.5,font:regular,color:rgb(0.45,0.45,0.5)});});
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
