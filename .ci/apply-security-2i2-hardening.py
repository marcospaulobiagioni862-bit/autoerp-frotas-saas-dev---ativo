from pathlib import Path
p=Path('src/server/driverRoutes.ts')
text=p.read_text(encoding='utf-8')
old="""if((status===DriverStatus.BLOCKED||old.status===DriverStatus.BLOCKED)&&!reason)throw new ValidationError('reason');if(old.status===status)return old;const now=new Date().toISOString();"""
new="""if((status===DriverStatus.BLOCKED||old.status===DriverStatus.BLOCKED)&&!reason)throw new ValidationError('reason');if(status===DriverStatus.ACTIVE&&evaluateCnhStatus(old.cnhExpiration).status===DocumentStatus.EXPIRED)throw new ValidationError('expired cnh');if(old.status===status)return old;const now=new Date().toISOString();"""
if text.count(old)!=1: raise SystemExit(f'expired-CNH status anchor count={text.count(old)}')
p.write_text(text.replace(old,new,1),encoding='utf-8')
