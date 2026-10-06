import { FileAttachmentRepository } from '../../persistence/repositories/localRepositories';
import { FileAttachment } from '../../types/entities';
import { getAttachmentStorageProvider } from '../../persistence/adapters/AttachmentStorageProvider';
import { AuditLogger } from '../../shared/utils/auditLogger';
import { AuditAction } from '../../types/enums';
import { DriverService } from './DriverService';

// Configurations
export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export class AttachmentService {
  private attachmentRepo = new FileAttachmentRepository();

  // Simple, fast FNV-1a or similar mock checksum algorithm to calculate SHA-256 style signature
  public static async calculateSHA256Checksum(base64Data: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(base64Data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  public async upload({
    companyId,
    entityType,
    entityId,
    documentType,
    fileName,
    mimeType,
    dataBase64,
    description,
    issueDate,
    expirationDate,
    userId,
    userName,
    userContext,
  }: {
    companyId: string;
    entityType: string;
    entityId: string;
    documentType: string;
    fileName: string;
    mimeType: string;
    dataBase64: string;
    description?: string;
    issueDate?: string;
    expirationDate?: string;
    userId: string;
    userName: string;
    userContext?: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] };
  }): Promise<FileAttachment> {
    // 1. Validations
    if (!companyId || !entityId || !entityType) {
      throw new Error('Parâmetros obrigatórios ausentes.');
    }

    // Security check: path traversal or malicious character filter
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error('Nome de arquivo inválido ou malicioso detectado.');
    }

    if (!ALLOWED_FILE_TYPES.includes(mimeType)) {
      throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
    }

    const estimatedSize = Math.round(dataBase64.length * 0.75);
    if (estimatedSize > MAX_FILE_SIZE) {
      throw new Error(`Tamanho de arquivo excede o limite máximo de ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
    }

    // Health attachment RBAC checks:
    if (documentType === 'HEALTH_RECORD' || entityType === 'HealthAndEmergency') {
      const driverService = new DriverService();
      // Look up driver
      const driverRepo = (driverService as any).driverRepo;
      const driver = await driverRepo.findById(entityId);
      if (driver) {
        const isAuth = DriverService.isHealthAuthorized('EDIT_DRIVER_HEALTH', driver, userContext);
        if (!isAuth) {
          throw new Error('Acesso negado: Sem permissão para editar dados de saúde.');
        }
      }
    }

    const checksum = await AttachmentService.calculateSHA256Checksum(dataBase64);

    // 2. Save file via storage abstraction provider
    const provider = getAttachmentStorageProvider();
    const mode = typeof process !== 'undefined' && process.env && process.env.ATTACHMENT_STORAGE_MODE
      ? process.env.ATTACHMENT_STORAGE_MODE
      : ((import.meta as any)?.env?.VITE_ATTACHMENT_STORAGE_MODE || 'LOCAL');

    const storageKey = `attachments/${companyId}/${entityType}/${entityId}/${Date.now()}_${fileName}`;
    await provider.save(companyId, storageKey, dataBase64, mimeType);

    // 3. Persist document metadata (no embedded base64 in entities)
    const attachment: FileAttachment = {
      id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      companyId,
      entityId,
      entityType,
      documentType,
      fileName,
      mimeType,
      fileSize: estimatedSize,
      entityName: entityType,
      uploadedBy: userName || userId,
      createdAt: new Date().toISOString(),
      storageProvider: mode as 'LOCAL' | 'CLOUD',
      storageKey,
      checksum,
      createdBy: userId,
      isArchived: false,
      description,
      issueDate,
      expirationDate,
    };

    const saved = await this.attachmentRepo.create(attachment);

    // 4. Audit Log
    await AuditLogger.logAction(
      companyId,
      'FileAttachment',
      saved.id,
      AuditAction.CREATE,
      userId,
      userName,
      undefined,
      { entityType, entityId, documentType, fileName, checksum }
    );

    return saved;
  }

  public async getAttachment(
    id: string,
    userContext: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): Promise<FileAttachment & { rawBase64: string }> {
    const attachment = await this.attachmentRepo.findById(id);
    if (!attachment) {
      throw new Error(`Anexo ${id} não encontrado.`);
    }

    // Tenant Isolation Guard
    if (attachment.companyId !== userContext.companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant access blocked.');
    }

    // Health attachment RBAC checks:
    if (attachment.documentType === 'HEALTH_RECORD' || attachment.entityType === 'HealthAndEmergency') {
      const driverService = new DriverService();
      const driverRepo = (driverService as any).driverRepo;
      const driver = await driverRepo.findById(attachment.entityId);
      if (driver) {
        const isAuth = DriverService.isHealthAuthorized('VIEW_DRIVER_HEALTH', driver, userContext);
        if (!isAuth) {
          throw new Error('Acesso negado: Sem permissão para visualizar dados de saúde.');
        }
      }
    }

    // Retrieve raw binary data base64 via provider
    const provider = getAttachmentStorageProvider();
    const rawBase64 = await provider.get(userContext.companyId, attachment.storageKey || `legacy_${attachment.id}`);

    // Audit view/download
    await AuditLogger.logAction(
      userContext.companyId,
      'FileAttachment',
      attachment.id,
      AuditAction.UPDATE, // Action represents access/retrieval here
      userContext.userId,
      userContext.userId,
      undefined,
      { action: 'DOWNLOAD', fileName: attachment.fileName }
    );

    return {
      ...attachment,
      rawBase64,
    };
  }

  public async archive(
    id: string,
    userContext: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): Promise<FileAttachment> {
    const attachment = await this.attachmentRepo.findById(id);
    if (!attachment) {
      throw new Error(`Anexo ${id} não encontrado.`);
    }

    if (attachment.companyId !== userContext.companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant archive blocked.');
    }

    // Health RBAC Check
    if (attachment.documentType === 'HEALTH_RECORD' || attachment.entityType === 'HealthAndEmergency') {
      const driverService = new DriverService();
      const driverRepo = (driverService as any).driverRepo;
      const driver = await driverRepo.findById(attachment.entityId);
      if (driver) {
        const isAuth = DriverService.isHealthAuthorized('EDIT_DRIVER_HEALTH', driver, userContext);
        if (!isAuth) {
          throw new Error('Acesso negado: Sem permissão para editar dados de saúde.');
        }
      }
    }

    const updated = await this.attachmentRepo.update(id, { isArchived: true });

    await AuditLogger.logAction(
      userContext.companyId,
      'FileAttachment',
      id,
      AuditAction.UPDATE,
      userContext.userId,
      userContext.userId,
      { isArchived: false },
      { isArchived: true }
    );

    return updated;
  }

  public async restore(
    id: string,
    userContext: { userId: string; role: string; active: boolean; companyId: string; permissions?: string[] }
  ): Promise<FileAttachment> {
    const attachment = await this.attachmentRepo.findById(id);
    if (!attachment) {
      throw new Error(`Anexo ${id} não encontrado.`);
    }

    if (attachment.companyId !== userContext.companyId) {
      throw new Error('Acesso não autorizado: Cross-tenant restore blocked.');
    }

    // Health RBAC Check
    if (attachment.documentType === 'HEALTH_RECORD' || attachment.entityType === 'HealthAndEmergency') {
      const driverService = new DriverService();
      const driverRepo = (driverService as any).driverRepo;
      const driver = await driverRepo.findById(attachment.entityId);
      if (driver) {
        const isAuth = DriverService.isHealthAuthorized('EDIT_DRIVER_HEALTH', driver, userContext);
        if (!isAuth) {
          throw new Error('Acesso negado: Sem permissão para editar dados de saúde.');
        }
      }
    }

    const updated = await this.attachmentRepo.update(id, { isArchived: false });

    await AuditLogger.logAction(
      userContext.companyId,
      'FileAttachment',
      id,
      AuditAction.UPDATE,
      userContext.userId,
      userContext.userId,
      { isArchived: true },
      { isArchived: false }
    );

    return updated;
  }

  public async findByEntity(companyId: string, entityType: string, entityId: string): Promise<FileAttachment[]> {
    const all = await this.attachmentRepo.findAll();
    return all.filter(a => a && a.companyId === companyId && a.entityType === entityType && a.entityId === entityId);
  }

  public async findAll(companyId: string): Promise<FileAttachment[]> {
    const all = await this.attachmentRepo.findAll();
    return all.filter(a => a && a.companyId === companyId);
  }
}
