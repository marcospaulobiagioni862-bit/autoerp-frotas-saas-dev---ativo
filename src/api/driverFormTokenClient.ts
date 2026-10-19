export interface GeneratedDriverFormToken {
  token: string;
  publicUrl: string;
  whatsappUrl: string;
  expiresAt: string;
}

export interface PublicDriverFormData {
  token: string;
  expiresAt: string;
  readOnlyCnh: {
    fullName: string;
    cpf: string;
    cnhNumber: string;
    cnhCategory: string;
    cnhExpiration: string;
  };
  address: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    residenceType?: string;
    residenceTypeOther?: string;
    condominiumName?: string;
    blockTower?: string;
    unit?: string;
    floor?: string;
    reference?: string;
  };
  profession: string;
  motherName: string;
  health: {
    bloodType?: string;
    allergies?: string;
    relevantConditions?: string;
    continuousMedications?: string;
    controlledMedications?: string;
    emergencyContactName?: string;
    emergencyContactRelationship?: string;
    emergencyContactPhone?: string;
    emergencyNotes?: string;
  };
  lgpdText: string;
  lgpdVersion: string;
}

export interface SubmitPublicDriverFormInput {
  address: PublicDriverFormData['address'];
  profession?: string;
  motherName?: string;
  health?: PublicDriverFormData['health'];
  lgpdConsent?: boolean;
}

export class DriverFormTokenClient {
  static async generateToken(driverId: string): Promise<GeneratedDriverFormToken> {
    const response = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/form-token`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao gerar link do formulário.');
    }
    return response.json();
  }

  static async getPublicFormData(token: string): Promise<PublicDriverFormData> {
    const response = await fetch(`/api/public/driver-form/${encodeURIComponent(token)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.error || 'Falha ao consultar formulário.');
      (error as any).code = err.code || (response.status === 410 ? 'EXPIRED' : 'NOT_FOUND');
      (error as any).status = response.status;
      throw error;
    }
    return response.json();
  }

  static async submitPublicForm(token: string, payload: SubmitPublicDriverFormInput): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`/api/public/driver-form/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const error = new Error(err.error || 'Falha ao enviar formulário.');
      (error as any).code = err.code;
      (error as any).status = response.status;
      throw error;
    }
    return response.json();
  }
}
