import { randomBytes, randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { UnitOfWork } from '../db/uow';
import { driverFormTokens, driverHealthProfiles, drivers } from '../db/schema';
import { AuditAction } from '../types/enums';
import type { AuthenticatedPrincipal } from './auth';
import { cleanCepDigits, cleanPhoneDigits } from '../shared/utils/phoneAndZipCode';

export const LGPD_HEALTH_CONSENT_TEXT =
  'Autorizo a locadora a coletar e armazenar temporariamente meus dados de saúde (medicamentos contínuos ou controlados, restrições para dirigir, alergias, tipo sanguíneo e contato de emergência) com a finalidade exclusiva de prestar socorro e assistência médica em caso de acidente de trânsito ou emergência durante a locação do veículo. Declaro ciência de que estes dados sensíveis são confidenciais, acessíveis apenas pela equipe de gestão operacional da frota, mantidos pelo prazo de vigência da locação acrescido de 30 dias após a devolução do veículo, podendo minha autorização ser revogada a qualquer momento mediante solicitação à locadora.';

export const LGPD_HEALTH_CONSENT_VERSION = '1.0';

const ALLOWED_HEALTH_KEYS = [
  'bloodType',
  'allergies',
  'relevantConditions',
  'continuousMedications',
  'controlledMedications',
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
  'emergencyNotes',
] as const;

function principalFrom(req: Request): AuthenticatedPrincipal | undefined {
  return (req as Request & { principal?: AuthenticatedPrincipal }).principal;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function registerDriverFormTokenRoutes(app: Express): void {
  // 1. Gera link externo de 24h para envio via WhatsApp (wa.me)
  app.post('/api/drivers/:id/form-token', async (req: Request, res: Response) => {
    const principal = principalFrom(req);
    if (!principal) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const driverId = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!driverId) {
      res.status(400).json({ error: 'ID do motorista inválido.' });
      return;
    }

    try {
      const result = await UnitOfWork.run(principal.companyId, async (tx) => {
        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);
        if (!driver || driver.isArchived) {
          return null;
        }

        // Token criptograficamente imprevisível (64 caracteres hexadecimais a partir de 32 bytes aleatórios)
        const token = randomBytes(32).toString('hex');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const tokenId = randomUUID();

        const rawTx = tx.getRawTransaction();
        await rawTx.insert(driverFormTokens).values({
          id: tokenId,
          companyId: principal.companyId,
          driverId: driver.id,
          token,
          createdBy: principal.userId,
          expiresAt,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });

        const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
        const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
        const publicUrl = `${proto}://${host}/public/driver-form/${token}`;

        let phoneDigits = cleanPhoneDigits(driver.whatsapp || driver.phone || '');
        if (phoneDigits && phoneDigits.length >= 10 && phoneDigits.length <= 11 && !phoneDigits.startsWith('55')) {
          phoneDigits = `55${phoneDigits}`;
        }

        const message = `Olá, ${driver.fullName}! Por favor, complete seus dados cadastrais (endereço e contato de emergência) pelo link seguro: ${publicUrl}. O link é de uso único e expira em 24 horas.`;
        const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}` : '';

        await tx.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: principal.companyId,
          entityName: 'DriverFormToken',
          entityId: driver.id,
          action: AuditAction.CREATE,
          userId: principal.userId,
          userName: principal.name,
          newState: JSON.stringify({
            event: 'DRIVER_FORM_TOKEN_GENERATED',
            tokenId,
            driverId: driver.id,
            expiresAt,
            phoneDigits,
          }),
          timestamp: now.toISOString(),
        });

        return {
          token,
          publicUrl,
          whatsappUrl,
          expiresAt,
        };
      });

      if (!result) {
        res.status(404).json({ error: 'Motorista não encontrado.' });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('AUTOERP_DRIVER_FORM_TOKEN_GENERATE_ERROR', error);
      res.status(500).json({ error: 'Falha ao gerar link do formulário do motorista.' });
    }
  });

  // 2. Consulta pública dos dados para preenchimento (sem autenticação prévia)
  app.get('/api/public/driver-form/:token', async (req: Request, res: Response) => {
    const tokenStr = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!tokenStr || tokenStr.length < 32) {
      res.status(404).json({ error: 'Link de formulário inválido ou não encontrado.' });
      return;
    }

    try {
      const rawRows = await db
        .select()
        .from(driverFormTokens)
        .where(eq(driverFormTokens.token, tokenStr))
        .limit(1);

      const tokenRecord = rawRows[0];
      if (!tokenRecord) {
        res.status(404).json({ error: 'Link de formulário não encontrado.' });
        return;
      }

      // Regra 2: Uso único
      if (tokenRecord.consumedAt) {
        res.status(410).json({
          code: 'ALREADY_CONSUMED',
          error: 'Este formulário já foi preenchido e enviado anteriormente. O link era de uso único e já foi encerrado.',
        });
        return;
      }

      // Regra 1: Expiração em 24h
      const expiresAtMs = new Date(tokenRecord.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
        res.status(410).json({
          code: 'EXPIRED',
          error: 'Este link expirou após 24 horas de validade. Entre em contato com a locadora para receber um novo link.',
        });
        return;
      }

      // Regra 5: Auditoria de abertura com IP e data
      const now = new Date().toISOString();
      const ip = clientIp(req);
      await db
        .update(driverFormTokens)
        .set({
          openedAt: now,
          openedIp: ip,
          updatedAt: now,
        })
        .where(eq(driverFormTokens.id, tokenRecord.id));

      const driverData = await UnitOfWork.run(tokenRecord.companyId, async (tx) => {
        const driver = await tx.getDriverRepo().findByIdForCompany(tokenRecord.companyId, tokenRecord.driverId);
        if (!driver || driver.isArchived) return null;

        const healthProfile = await tx.getDriverHealthRepo().findByDriverId(driver.id);
        return { driver, healthProfile };
      });

      if (!driverData) {
        res.status(404).json({ error: 'Cadastro do motorista não encontrado.' });
        return;
      }

      const { driver, healthProfile } = driverData;

      // Os campos que vieram da CNH aparecem TRAVADOS no client
      res.json({
        token: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt,
        readOnlyCnh: {
          fullName: driver.fullName,
          cpf: driver.cpf,
          cnhNumber: driver.cnhNumber,
          cnhCategory: driver.cnhCategory,
          cnhExpiration: driver.cnhExpiration,
        },
        address: driver.address || {},
        profession: driver.profession || '',
        motherName: driver.motherName || '',
        health: healthProfile || {},
        lgpdText: LGPD_HEALTH_CONSENT_TEXT,
        lgpdVersion: LGPD_HEALTH_CONSENT_VERSION,
      });
    } catch (error) {
      console.error('AUTOERP_PUBLIC_DRIVER_FORM_READ_ERROR', error);
      res.status(500).json({ error: 'Erro ao carregar dados do formulário.' });
    }
  });

  // 3. Envio público do formulário preenchido pelo motorista
  app.post('/api/public/driver-form/:token', async (req: Request, res: Response) => {
    const tokenStr = typeof req.params.token === 'string' ? req.params.token.trim() : '';
    if (!tokenStr || tokenStr.length < 32) {
      res.status(404).json({ error: 'Link de formulário inválido.' });
      return;
    }

    try {
      const rawRows = await db
        .select()
        .from(driverFormTokens)
        .where(eq(driverFormTokens.token, tokenStr))
        .limit(1);

      const tokenRecord = rawRows[0];
      if (!tokenRecord) {
        res.status(404).json({ error: 'Link de formulário não encontrado.' });
        return;
      }

      // Regra 2: Uso único
      if (tokenRecord.consumedAt) {
        res.status(410).json({
          code: 'ALREADY_CONSUMED',
          error: 'Este formulário já foi enviado anteriormente. O link era de uso único.',
        });
        return;
      }

      // Regra 1: Expiração 24h
      const expiresAtMs = new Date(tokenRecord.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
        res.status(410).json({
          code: 'EXPIRED',
          error: 'Este link expirou após 24 horas de validade.',
        });
        return;
      }

      const body = req.body || {};

      // Validação LGPD (PH-059): Obrigatória se houver dados de saúde
      const rawHealth = body.health || {};
      const hasHealthFields = ALLOWED_HEALTH_KEYS.some((k) => {
        const val = rawHealth[k];
        return typeof val === 'string' && val.trim().length > 0;
      });

      if (hasHealthFields && body.lgpdConsent !== true) {
        res.status(400).json({
          code: 'LGPD_CONSENT_REQUIRED',
          error: 'É obrigatório aceitar o termo de consentimento da LGPD para registrar dados médicos e de emergência.',
        });
        return;
      }

      const now = new Date().toISOString();
      const ip = clientIp(req);

      // Regra 4: ESCOPO SERVER-SIDE — a gravação ocorre SEMPRE no driverId do token, NUNCA no que o navegador mandou!
      const targetDriverId = tokenRecord.driverId;
      const targetCompanyId = tokenRecord.companyId;

      await UnitOfWork.run(targetCompanyId, async (tx) => {
        const driver = await tx.getDriverRepo().findByIdForCompany(targetCompanyId, targetDriverId);
        if (!driver || driver.isArchived) {
          throw new Error('DRIVER_NOT_FOUND');
        }

        const rawAddr = body.address || {};
        const updatedAddress = {
          ...driver.address,
          street: typeof rawAddr.street === 'string' && rawAddr.street.trim() ? rawAddr.street.trim() : driver.address.street,
          number: typeof rawAddr.number === 'string' && rawAddr.number.trim() ? rawAddr.number.trim() : driver.address.number,
          complement: typeof rawAddr.complement === 'string' ? rawAddr.complement.trim() : driver.address.complement,
          neighborhood: typeof rawAddr.neighborhood === 'string' && rawAddr.neighborhood.trim() ? rawAddr.neighborhood.trim() : driver.address.neighborhood,
          city: typeof rawAddr.city === 'string' && rawAddr.city.trim() ? rawAddr.city.trim() : driver.address.city,
          state: typeof rawAddr.state === 'string' && rawAddr.state.trim() ? rawAddr.state.trim() : driver.address.state,
          zipCode: typeof rawAddr.zipCode === 'string' ? cleanCepDigits(rawAddr.zipCode) : driver.address.zipCode,
          residenceType: typeof rawAddr.residenceType === 'string' ? (rawAddr.residenceType as any) : driver.address.residenceType,
          residenceTypeOther: typeof rawAddr.residenceTypeOther === 'string' ? rawAddr.residenceTypeOther.trim() : driver.address.residenceTypeOther,
          condominiumName: typeof rawAddr.condominiumName === 'string' ? rawAddr.condominiumName.trim() : driver.address.condominiumName,
          blockTower: typeof rawAddr.blockTower === 'string' ? rawAddr.blockTower.trim() : driver.address.blockTower,
          unit: typeof rawAddr.unit === 'string' ? rawAddr.unit.trim() : driver.address.unit,
          floor: typeof rawAddr.floor === 'string' ? rawAddr.floor.trim() : driver.address.floor,
          reference: typeof rawAddr.reference === 'string' ? rawAddr.reference.trim() : driver.address.reference,
        };

        const updatedDriver = {
          ...driver,
          address: updatedAddress,
          profession: typeof body.profession === 'string' ? body.profession.trim() : driver.profession,
          motherName: typeof body.motherName === 'string' ? body.motherName.trim() : driver.motherName,
          updatedAt: now,
        };

        await tx.getDriverRepo().updateForCompany(targetCompanyId, targetDriverId, updatedDriver);

        // Atualiza saúde se informado e consentido
        if (hasHealthFields && body.lgpdConsent === true) {
          const healthToSave: Record<string, string> = {};
          for (const key of ALLOWED_HEALTH_KEYS) {
            if (typeof rawHealth[key] === 'string') {
              healthToSave[key] = rawHealth[key].trim();
            }
          }

          const existingHealth = await tx.getDriverHealthRepo().findByDriverId(targetDriverId);
          await tx.getDriverHealthRepo().upsert({
            id: existingHealth?.id || randomUUID(),
            companyId: targetCompanyId,
            driverId: targetDriverId,
            ...(existingHealth || {}),
            ...healthToSave,
            lastUpdateDate: now,
            responsibleUser: tokenRecord.createdBy, // Credita ao usuário de origem que gerou o token
            lgpdConsentAt: now,
            lgpdConsentVersion: LGPD_HEALTH_CONSENT_VERSION,
            createdAt: existingHealth?.createdAt || now,
            updatedAt: now,
          });
        }

        // Queima o token (uso único) e grava IP e data
        const rawTx = tx.getRawTransaction();
        await rawTx
          .update(driverFormTokens)
          .set({
            consumedAt: now,
            consumedIp: ip,
            updatedAt: now,
          })
          .where(eq(driverFormTokens.id, tokenRecord.id));

        // Trilha de auditoria
        await tx.getAuditLogRepo().create({
          id: randomUUID(),
          companyId: targetCompanyId,
          entityName: 'Driver',
          entityId: targetDriverId,
          action: AuditAction.UPDATE,
          userId: tokenRecord.createdBy,
          userName: 'Public Driver Form Submission',
          newState: JSON.stringify({
            event: 'DRIVER_PUBLIC_FORM_SUBMITTED',
            tokenId: tokenRecord.id,
            submittedIp: ip,
            hasHealthData: hasHealthFields,
            lgpdConsent: body.lgpdConsent === true,
            lgpdVersion: LGPD_HEALTH_CONSENT_VERSION,
          }),
          timestamp: now,
        });
      });

      res.json({
        success: true,
        message: 'Dados cadastrais enviados e registrados com sucesso.',
      });
    } catch (error) {
      console.error('AUTOERP_PUBLIC_DRIVER_FORM_SUBMIT_ERROR', error);
      res.status(500).json({ error: 'Falha ao salvar dados do formulário.' });
    }
  });
}
