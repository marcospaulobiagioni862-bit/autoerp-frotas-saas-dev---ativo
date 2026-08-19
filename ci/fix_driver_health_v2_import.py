from pathlib import Path
p=Path('src/db/repositories/postgresRepositories.ts')
s=p.read_text()
old='  securityDeposits, securityDepositMovements\n} from \'../schema\';'
new='  securityDeposits, securityDepositMovements, driverHealthProfiles\n} from \'../schema\';'
if old not in s:
    raise SystemExit('postgres repository schema import anchor missing')
s=s.replace(old,new,1)
p.write_text(s.rstrip() + '\n')
