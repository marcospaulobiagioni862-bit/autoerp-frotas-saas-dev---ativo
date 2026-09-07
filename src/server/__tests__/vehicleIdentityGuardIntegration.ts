import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import { createServer } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import type { AuthenticatedPrincipal } from '../auth';
import { registerVehicleRoutes } from '../vehicleRoutes';

function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function pgCode(error:unknown):string{
  let current:any=error;
  for(let depth=0;depth<6&&current;depth++){if(typeof current.code==='string')return current.code;current=current.cause;}
  return '';
}

const companyId='vehicle-identity-guard-company';
const admin:AuthenticatedPrincipal={
  companyId,userId:'vehicle-identity-guard-admin',name:'Vehicle Identity Guard Admin',role:'ADMIN',permissions:['*'],
};

async function seed():Promise<void>{
  await db.execute(sql`DELETE FROM vehicles WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM users WHERE company_id=${companyId}`);
  await db.execute(sql`DELETE FROM companies WHERE id=${companyId}`);
  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES(${companyId},'Vehicle Identity Guard','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at)
    VALUES(${admin.userId},${companyId},'Vehicle Identity Guard Admin','vehicle-identity-guard@example.test','ADMIN',true,NOW(),NOW())`);
}

async function main():Promise<void>{
  await seed();

  await db.execute(sql`
    INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at)
    VALUES('vehicle-identity-existing',${companyId},'dup-1a23 ',' 001.234.567-89 ','AVAILABLE',1000,NOW(),NOW())
  `);
  const stored=rows(await db.execute(sql`SELECT plate,renavam FROM vehicles WHERE company_id=${companyId} AND id='vehicle-identity-existing'`))[0];
  assert(stored.plate==='DUP1A23','database guard did not canonicalize the legacy-formatted plate');
  assert(stored.renavam==='00123456789','database guard did not canonicalize the legacy-formatted RENAVAM');

  let duplicatePlateCode='';
  try{
    await db.execute(sql`
      INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at)
      VALUES('vehicle-identity-dup-plate',${companyId},'dup1a23','99887766554','AVAILABLE',0,NOW(),NOW())
    `);
  }catch(error){duplicatePlateCode=pgCode(error);}
  assert(duplicatePlateCode==='23505','database guard allowed a normalized duplicate plate');

  let duplicateRenavamCode='';
  try{
    await db.execute(sql`
      INSERT INTO vehicles(id,company_id,plate,renavam,status,current_km,created_at,updated_at)
      VALUES('vehicle-identity-dup-renavam',${companyId},'XYZ9Z99','001-234-567-89','AVAILABLE',0,NOW(),NOW())
    `);
  }catch(error){duplicateRenavamCode=pgCode(error);}
  assert(duplicateRenavamCode==='23505','database guard allowed a normalized duplicate RENAVAM');

  const app=express();
  app.use(express.json());
  app.use((req:Request,_res:ExpressResponse,next:NextFunction)=>{
    (req as Request&{principal?:AuthenticatedPrincipal}).principal=admin;
    next();
  });
  registerVehicleRoutes(app);
  const server=createServer(app);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const address=server.address();
    assert(address&&typeof address==='object','vehicle identity HTTP server unavailable');
    const base=`http://127.0.0.1:${address.port}`;
    const vehicle={
      plate:'DUP1A23',renavam:'88776655443',brand:'VW',model:'Gol',yearFabrication:2022,yearModel:2023,
      color:'Branco',chassis:'9BWZZZ377VT004251',fuelType:'Flex',category:'Hatch / Sedan Compacto',
      currentKm:1000,acquisitionValue:50000,currentValue:45000,rentalValueBase:850,
    };
    let response=await fetch(`${base}/api/fleet/vehicles`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(vehicle),
    });
    assert(response.status===409,`normalized duplicate plate expected 409, got ${response.status}`);
    let payload=await response.json() as any;
    assert(String(payload.error).includes('já possui cadastro'),'duplicate plate response did not explain existing vehicle');

    response=await fetch(`${base}/api/fleet/vehicles`,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({...vehicle,plate:'ABC1D23',renavam:'001.234.567-89',chassis:'9BWZZZ377VT004252'}),
    });
    assert(response.status===409,`normalized duplicate RENAVAM expected 409, got ${response.status}`);
    payload=await response.json() as any;
    assert(String(payload.error).includes('RENAVAM'),'duplicate RENAVAM response did not identify the conflict');
  }finally{
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }

  const count=Number(rows(await db.execute(sql`SELECT count(*)::int count FROM vehicles WHERE company_id=${companyId}`))[0].count);
  assert(count===1,`duplicate protection left ${count} vehicle rows instead of one`);

  console.log('Vehicle normalized identity guard integration: PASS');
}

main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
