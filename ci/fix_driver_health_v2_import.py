from pathlib import Path
p=Path('src/db/repositories/postgresRepositories.ts')
s=p.read_text()
old='  securityDeposits, securityDepositMovements\n} from \'../schema\';'
new='  securityDeposits, securityDepositMovements, driverHealthProfiles\n} from \'../schema\';'
if old not in s:
    raise SystemExit('postgres repository schema import anchor missing')
p.write_text(s.replace(old,new,1))
