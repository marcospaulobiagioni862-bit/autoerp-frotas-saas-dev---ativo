from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Explicit legacy supplement bridge. It is forbidden from importing VehicleRepository/KmRecordRepository.
Path('src/domain/services/VehicleLegacyDetailsBridge.ts').write_text(r'''import {
  DriverRepository,
  ContractRepository,
  MaintenanceRepository,
  TrafficTicketRepository,
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import type { Vehicle, KmRecord } from '../../types/entities';
import { ObligationStatus } from '../../types/enums';

export interface VehicleDetailedSummary {
  vehicle: Vehicle;
  driver?: any;
  activeContract?: any;
  contractHistory: any[];
  maintenances: any[];
  trafficTickets: any[];
  documents: any[];
  insurances: any[];
  trackers: any[];
  kmRecords: KmRecord[];
  financialSummary: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
}

/**
 * Transitional supplement bridge for details tabs not migrated yet.
 * SECURITY-2I1B invariant: Vehicle and KmRecord are supplied by the server caller.
 * This class MUST NOT instantiate VehicleRepository or KmRecordRepository.
 */
export class VehicleLegacyDetailsBridge {
  private driverRepo = new DriverRepository();
  private contractRepo = new ContractRepository();
  private maintenanceRepo = new MaintenanceRepository();
  private ticketRepo = new TrafficTicketRepository();
  private documentRepo = new VehicleDocumentRepository();
  private insuranceRepo = new InsuranceRepository();
  private trackerRepo = new TrackerRepository();
  private receivableRepo = new AccountReceivableRepository();
  private payableRepo = new AccountPayableRepository();

  async compose(vehicle: Vehicle, kmRecords: KmRecord[]): Promise<VehicleDetailedSummary> {
    const vehicleId = vehicle.id;
    const [
      driver,
      activeContract,
      allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      receivables,
      payables,
    ] = await Promise.all([
      vehicle.currentDriverId ? this.driverRepo.findById(vehicle.currentDriverId) : Promise.resolve(null),
      vehicle.currentContractId ? this.contractRepo.findById(vehicle.currentContractId) : Promise.resolve(null),
      this.contractRepo.findAll({ vehicleId }),
      this.maintenanceRepo.findAll({ vehicleId }),
      this.ticketRepo.findAll({ vehicleId }),
      this.documentRepo.findAll({ vehicleId }),
      this.insuranceRepo.findAll({ vehicleId }),
      this.trackerRepo.findAll({ vehicleId }),
      this.receivableRepo.findAll({ vehicleId }),
      this.payableRepo.findAll({ vehicleId }),
    ]);

    const totalRevenue = receivables
      .filter((item) => item.status === ObligationStatus.PAID)
      .reduce((sum, item) => sum + item.paidAmount, 0);
    const totalExpenses = payables
      .filter((item) => item.status === ObligationStatus.PAID)
      .reduce((sum, item) => sum + item.paidAmount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      vehicle,
      driver: driver || undefined,
      activeContract: activeContract || undefined,
      contractHistory: allContracts,
      maintenances,
      trafficTickets,
      documents,
      insurances,
      trackers,
      kmRecords: [...kmRecords],
      financialSummary: { totalRevenue, totalExpenses, netProfit, profitMargin },
    };
  }
}
''', encoding='utf-8')

# Fleet list/status source switches atomically to VehicleClient.
p = Path('src/components/fleet/FleetManagement.tsx')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { VehicleRepository } from '../../persistence/repositories/localRepositories';\nimport { VehicleService } from '../../domain/services/VehicleService';\n",
    "import { VehicleClient } from '../../api/vehicleClient';\n",
    'Fleet imports',
)
text = replace_once(text, "import { useAuth } from '../../hooks/useAuth';\n", "", 'Fleet useAuth import')
text = replace_once(text, "  const { user } = useAuth();\n", "", 'Fleet useAuth')
text = replace_once(
    text,
    "      const repo = new VehicleRepository();\n      const list = await repo.findAll({ companyId: user.companyId });\n      setVehicles(list.filter((v) => !v.isArchived));",
    "      const list = await VehicleClient.list();\n      setVehicles(list);",
    'Fleet server list',
)
text = replace_once(
    text,
    "      const service = new VehicleService();\n      await service.changeStatus(\n        vehicleForStatusChange.id,\n        targetStatus,\n        reason,\n        user.userId,\n        user.name\n      );",
    "      await VehicleClient.changeStatus(vehicleForStatusChange.id, targetStatus, reason);",
    'Fleet server status',
)
text = replace_once(text, "        companyId={user.companyId}\n", "", 'Fleet form company prop')
p.write_text(text, encoding='utf-8')

# Vehicle form switches to session-backed VehicleClient. KM becomes create-only in this form.
p = Path('src/components/fleet/VehicleFormModal.tsx')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { CreateVehicleDTO, UpdateVehicleDTO, VehicleService } from '../../domain/services/VehicleService';",
    "import { VehicleClient } from '../../api/vehicleClient';",
    'form client import',
)
text = replace_once(
    text,
    "  vehicleToEdit?: Vehicle | null;\n  companyId: string;\n}",
    "  vehicleToEdit?: Vehicle | null;\n}\n\ninterface VehicleFormData {\n  plate: string;\n  brand: string;\n  model: string;\n  version?: string;\n  yearFabrication: number;\n  yearModel: number;\n  color: string;\n  renavam: string;\n  chassis: string;\n  currentKm: number;\n  nextMaintenanceKm?: number;\n  fuelType: string;\n  category: string;\n  acquisitionValue: number;\n  currentValue: number;\n  rentalValueBase: number;\n  notes?: string;\n}",
    'form data type',
)
text = replace_once(
    text,
    "  vehicleToEdit,\n  companyId,\n}) => {\n  const [formData, setFormData] = useState<CreateVehicleDTO>({\n    companyId,",
    "  vehicleToEdit,\n}) => {\n  const [formData, setFormData] = useState<VehicleFormData>({",
    'form props/state',
)
text = replace_once(text, "        companyId: vehicleToEdit.companyId,\n", "", 'form edit company')
text = replace_once(text, "        companyId,\n", "", 'form create company')
text = replace_once(text, "  }, [vehicleToEdit, isOpen, companyId]);", "  }, [vehicleToEdit, isOpen]);", 'form effect dependencies')
text = replace_once(text, "  const handleChange = (field: keyof CreateVehicleDTO, value: any) => {", "  const handleChange = (field: keyof VehicleFormData, value: any) => {", 'form change type')
submit_old = """      const service = new VehicleService();
      if (vehicleToEdit) {
        await service.updateVehicle(
          vehicleToEdit.id,
          formData as UpdateVehicleDTO,
          'user-admin-1',
          'Gestor de Frota'
        );
      } else {
        await service.createVehicle(
          formData,
          'user-admin-1',
          'Gestor de Frota'
        );
      }
"""
submit_new = """      if (vehicleToEdit) {
        const { currentKm: _serverManagedKm, ...editableFields } = formData;
        await VehicleClient.update(vehicleToEdit.id, editableFields);
      } else {
        await VehicleClient.create(formData);
      }
"""
text = replace_once(text, submit_old, submit_new, 'form submit')
km_input = """          <Input
            label="KM Atual *"
            type="number"
            required
            value={formData.currentKm}
            onChange={(e) => handleChange('currentKm', Number(e.target.value))}
          />
"""
km_input_new = """          <Input
            label="KM Atual *"
            type="number"
            required
            disabled={!!vehicleToEdit}
            value={formData.currentKm}
            onChange={(e) => handleChange('currentKm', Number(e.target.value))}
            helperText={vehicleToEdit ? 'Use “Registrar KM” para alterar o odômetro.' : 'Leitura inicial do veículo.'}
          />
"""
text = replace_once(text, km_input, km_input_new, 'form km readonly edit')
p.write_text(text, encoding='utf-8')

# KM modal switches to server authority.
p = Path('src/components/fleet/RecordKmModal.tsx')
text = p.read_text(encoding='utf-8')
text = replace_once(text, "import { VehicleService } from '../../domain/services/VehicleService';", "import { VehicleClient } from '../../api/vehicleClient';", 'km modal client import')
record_old = """      const service = new VehicleService();
      await service.recordKm(
        vehicle.id,
        Number(newKm),
        readingType,
        notes,
        'user-admin-1',
        'Gestor de Frota'
      );
"""
record_new = """      await VehicleClient.recordKm(vehicle.id, {
        kmValue: Number(newKm),
        readingType,
        notes,
      });
"""
text = replace_once(text, record_old, record_new, 'km modal server record')
p.write_text(text, encoding='utf-8')

# Detail core+KM switch. Legacy tabs are composed only after server Vehicle/KM have succeeded.
p = Path('src/components/fleet/VehicleDetailsModal.tsx')
text = p.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import { VehicleService, VehicleDetailedSummary } from '../../domain/services/VehicleService';",
    "import { VehicleClient } from '../../api/vehicleClient';\nimport { VehicleLegacyDetailsBridge, VehicleDetailedSummary } from '../../domain/services/VehicleLegacyDetailsBridge';",
    'details server imports',
)
load_old = """    try {
      const service = new VehicleService();
      const data = await service.getVehicleDetailedSummary(vehicleId);
      setSummary(data);
    } catch (err) {
"""
load_new = """    try {
      const [vehicle, kmRecords] = await Promise.all([
        VehicleClient.get(vehicleId),
        VehicleClient.listKm(vehicleId),
      ]);
      const bridge = new VehicleLegacyDetailsBridge();
      const data = await bridge.compose(vehicle, kmRecords);
      setSummary(data);
    } catch (err) {
"""
text = replace_once(text, load_old, load_new, 'details server load')
p.write_text(text, encoding='utf-8')
