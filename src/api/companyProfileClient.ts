export interface CompanyProfile {
  id:string; name:string; tradeName:string; document:string; email:string; phone:string; whatsapp:string;
  address:{street:string;number:string;complement:string;neighborhood:string;city:string;state:string;zipCode:string};
  legalRepresentative:{name:string;cpf:string};
  updatedAt:string;
}
async function item(response:Response):Promise<CompanyProfile>{
  if(!response.ok) throw new Error(`Company profile request failed (${response.status})`);
  const payload=await response.json() as {item:CompanyProfile};
  return payload.item;
}
export class CompanyProfileClient{
  static async get():Promise<CompanyProfile>{
    return item(await fetch('/api/company-profile',{credentials:'include'}));
  }
  static async update(input:Omit<CompanyProfile,'id'|'updatedAt'>):Promise<CompanyProfile>{
    return item(await fetch('/api/company-profile',{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
  }
}
