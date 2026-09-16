import { DriverStatus, DocumentStatus } from '../enums';

export interface DriverHealthAndEmergency {
  bloodType?: string;
  allergies?: string;
  relevantConditions?: string;
  continuousMedications?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  emergencyNotes?: string;
  lastUpdateDate?: string;
  responsibleUser?: string;
}

export interface Driver {
  id: string; // UUID
  companyId: string;
  fullName: string;
  cpf: string; // Unique
  rg?: string;
  birthDate: string;
  phone: string;
  whatsapp: string;
  email?: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiration: string;
  cnhStatus: DocumentStatus;
  appPlatforms: string[]; // e.g., ['Uber', '99', 'Indrive']
  status: DriverStatus;
  currentVehicleId?: string;
  currentContractId?: string;
  photoUrl?: string;
  notes?: string;
  healthAndEmergency?: DriverHealthAndEmergency;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDocument {
  id: string; // UUID
  companyId: string;
  driverId: string;
  documentType: string; // CNH, Comprovante de Residência, Certidão de Antecedentes, etc.
  documentNumber?: string;
  expirationDate?: string;
  status: DocumentStatus;
  fileUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationLog {
  id: string;
  companyId: string;
  driverId: string;
  type: 'RENT_CHARGE' | 'DUE_REMINDER' | 'TICKET_ALERT' | 'MAINTENANCE_ALERT' | 'CUSTOM';
  phone: string;
  message: string;
  relatedRef?: string;
  user: string;
  dateTime: string;
  status: 'DRAFT' | 'OPENED_IN_WHATSAPP' | 'MANUALLY_CONFIRMED_SENT';
}
