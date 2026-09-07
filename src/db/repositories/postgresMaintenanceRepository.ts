import { sql } from 'drizzle-orm';
import type {
  Part,
  Supplier,
  WorkOrder,
  WorkOrderFinancialComponent,
  WorkOrderLaborItem,
  WorkOrderPartItem,
  WorkOrderServiceItem,
  WorkOrderStatus,
} from '../../types/entities';

export interface WorkOrderLifecyclePatch {
  status: WorkOrderStatus;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  exitKm?: number;
  notes?: string;
  accountPayableId?: string;
  updatedAt: string;
}

function rows(result: any): any[] {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date(String(value)).toISOString();
}

function optionalIso(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return iso(value);
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function mapSupplier(row: any): Supplier {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name || ''),
    tradeName: optionalText(row.trade_name),
    document: String(row.document || ''),
    phone: String(row.phone || ''),
    email: optionalText(row.email),
    address: optionalText(row.address),
    category: String(row.category || ''),
    status: String(row.status) as Supplier['status'],
    notes: optionalText(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapPart(row: any): Part {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    code: String(row.code || ''),
    name: String(row.name || ''),
    description: optionalText(row.description),
    manufacturer: optionalText(row.manufacturer),
    category: String(row.category || ''),
    unit: String(row.unit || 'UN'),
    currentCost: Number(row.current_cost || 0),
    minimumStock: Number(row.minimum_stock || 0),
    currentStock: Number(row.current_stock || 0),
    status: String(row.status) as Part['status'],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapPartItem(row: any): WorkOrderPartItem {
  return {
    id: String(row.id),
    partId: optionalText(row.part_id),
    description: String(row.description || ''),
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    totalCost: Number(row.total_cost || 0),
  };
}

function mapServiceItem(row: any): WorkOrderServiceItem {
  return {
    id: String(row.id),
    serviceId: optionalText(row.service_id),
    description: String(row.description || ''),
    quantity: Number(row.quantity || 0),
    unitCost: Number(row.unit_cost || 0),
    totalCost: Number(row.total_cost || 0),
  };
}

function mapLaborItem(row: any): WorkOrderLaborItem {
  return {
    id: String(row.id),
    description: String(row.description || ''),
    hours: Number(row.hours || 0),
    hourlyRate: Number(row.hourly_rate || 0),
    totalCost: Number(row.total_cost || 0),
  };
}

function mapFinancialComponent(row: any): WorkOrderFinancialComponent {
  return {
    id: String(row.id),
    kind: String(row.kind) as WorkOrderFinancialComponent['kind'],
    supplierId: optionalText(row.supplier_id),
    categoryId: String(row.category_id || ''),
    paymentMethodId: String(row.payment_method_id || ''),
    paymentCondition: String(row.payment_condition) as WorkOrderFinancialComponent['paymentCondition'],
    installmentsCount: Number(row.installments_count || 1),
    firstDueDate: String(row.first_due_date || '').slice(0,10),
    grossAmount: Number(row.gross_amount || 0),
    discountAmount: Number(row.discount_amount || 0),
    netAmount: Number(row.net_amount || 0),
    hasInvoice: Boolean(row.has_invoice),
    invoiceNumber: optionalText(row.invoice_number),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapWorkOrderBase(row: any): WorkOrder {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    number: String(row.number || ''),
    vehicleId: String(row.vehicle_id),
    supplierId: optionalText(row.supplier_id),
    status: String(row.status) as WorkOrderStatus,
    openedAt: iso(row.opened_at),
    serviceDate: String(row.service_date || '').slice(0,10),
    startedAt: optionalIso(row.started_at),
    completedAt: optionalIso(row.completed_at),
    cancelledAt: optionalIso(row.cancelled_at),
    entryKm: Number(row.entry_km || 0),
    exitKm: row.exit_km === null || row.exit_km === undefined ? undefined : Number(row.exit_km),
    description: String(row.description || ''),
    diagnosis: optionalText(row.diagnosis),
    notes: optionalText(row.notes),
    parts: [],
    services: [],
    laborItems: [],
    financialComponents: [],
    subtotalParts: Number(row.subtotal_parts || 0),
    subtotalServices: Number(row.subtotal_services || 0),
    subtotalLabor: Number(row.subtotal_labor || 0),
    discount: Number(row.discount || 0),
    total: Number(row.total || 0),
    accountPayableId: optionalText(row.account_payable_id),
    createdBy: optionalText(row.created_by),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresSupplierRepository {
  constructor(private readonly tx: any) {}

  async findByIdForCompany(companyId: string, id: string): Promise<Supplier | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM suppliers WHERE company_id = ${companyId} AND id = ${id} LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? mapSupplier(row) : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Supplier | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM suppliers WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE
    `);
    const row = rows(result)[0];
    return row ? mapSupplier(row) : null;
  }

  async findAllByCompany(companyId: string): Promise<Supplier[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM suppliers WHERE company_id = ${companyId} ORDER BY name, id
    `);
    return rows(result).map(mapSupplier);
  }

  async findByDocument(companyId: string, document: string): Promise<Supplier | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM suppliers
      WHERE company_id = ${companyId} AND upper(document) = upper(${document})
      LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? mapSupplier(row) : null;
  }

  async create(item: Supplier): Promise<Supplier> {
    const result = await this.tx.execute(sql`
      INSERT INTO suppliers (
        id, company_id, name, trade_name, document, phone, email, address,
        category, status, notes, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.name}, ${item.tradeName || null}, ${item.document},
        ${item.phone || null}, ${item.email || null}, ${item.address || null}, ${item.category},
        ${item.status}, ${item.notes || null}, ${item.createdAt}, ${item.updatedAt}
      ) RETURNING *
    `);
    return mapSupplier(rows(result)[0]);
  }

  async updateForCompany(companyId: string, id: string, item: Supplier): Promise<Supplier | null> {
    const result = await this.tx.execute(sql`
      UPDATE suppliers SET
        name = ${item.name}, trade_name = ${item.tradeName || null}, document = ${item.document},
        phone = ${item.phone || null}, email = ${item.email || null}, address = ${item.address || null},
        category = ${item.category}, status = ${item.status}, notes = ${item.notes || null},
        updated_at = ${item.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING *
    `);
    const row = rows(result)[0];
    return row ? mapSupplier(row) : null;
  }
}

export class PostgresPartRepository {
  constructor(private readonly tx: any) {}

  async findByIdForCompany(companyId: string, id: string): Promise<Part | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM parts WHERE company_id = ${companyId} AND id = ${id} LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? mapPart(row) : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<Part | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM parts WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE
    `);
    const row = rows(result)[0];
    return row ? mapPart(row) : null;
  }

  async findAllByCompany(companyId: string): Promise<Part[]> {
    const result = await this.tx.execute(sql`
      SELECT * FROM parts WHERE company_id = ${companyId} ORDER BY name, id
    `);
    return rows(result).map(mapPart);
  }

  async findByCode(companyId: string, code: string): Promise<Part | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM parts WHERE company_id = ${companyId} AND code = ${code} LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? mapPart(row) : null;
  }

  async create(item: Part): Promise<Part> {
    const result = await this.tx.execute(sql`
      INSERT INTO parts (
        id, company_id, code, name, description, manufacturer, category, unit,
        current_cost, minimum_stock, current_stock, status, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.code}, ${item.name}, ${item.description || null},
        ${item.manufacturer || null}, ${item.category}, ${item.unit}, ${String(item.currentCost)},
        ${String(item.minimumStock)}, ${String(item.currentStock)}, ${item.status}, ${item.createdAt}, ${item.updatedAt}
      ) RETURNING *
    `);
    return mapPart(rows(result)[0]);
  }

  async updateForCompany(companyId: string, id: string, item: Part): Promise<Part | null> {
    const result = await this.tx.execute(sql`
      UPDATE parts SET
        code = ${item.code}, name = ${item.name}, description = ${item.description || null},
        manufacturer = ${item.manufacturer || null}, category = ${item.category}, unit = ${item.unit},
        current_cost = ${String(item.currentCost)}, minimum_stock = ${String(item.minimumStock)},
        current_stock = ${String(item.currentStock)}, status = ${item.status}, updated_at = ${item.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING *
    `);
    const row = rows(result)[0];
    return row ? mapPart(row) : null;
  }
}

export class PostgresWorkOrderRepository {
  constructor(private readonly tx: any) {}

  private async hydrate(row: any): Promise<WorkOrder> {
    const item = mapWorkOrderBase(row);
    const [partsResult, servicesResult, laborResult, financeResult] = await Promise.all([
      this.tx.execute(sql`
        SELECT * FROM work_order_parts
        WHERE company_id = ${item.companyId} AND work_order_id = ${item.id}
        ORDER BY id
      `),
      this.tx.execute(sql`
        SELECT * FROM work_order_services
        WHERE company_id = ${item.companyId} AND work_order_id = ${item.id}
        ORDER BY id
      `),
      this.tx.execute(sql`
        SELECT * FROM work_order_labor
        WHERE company_id = ${item.companyId} AND work_order_id = ${item.id}
        ORDER BY id
      `),
      this.tx.execute(sql`
        SELECT * FROM work_order_financial_components
        WHERE company_id = ${item.companyId} AND work_order_id = ${item.id}
        ORDER BY kind, id
      `),
    ]);
    item.parts = rows(partsResult).map(mapPartItem);
    item.services = rows(servicesResult).map(mapServiceItem);
    item.laborItems = rows(laborResult).map(mapLaborItem);
    item.financialComponents = rows(financeResult).map(mapFinancialComponent);
    return item;
  }

  async findByIdForCompany(companyId: string, id: string): Promise<WorkOrder | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM work_orders WHERE company_id = ${companyId} AND id = ${id} LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? await this.hydrate(row) : null;
  }

  async findByIdForCompanyWithLock(companyId: string, id: string): Promise<WorkOrder | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM work_orders WHERE company_id = ${companyId} AND id = ${id} FOR UPDATE
    `);
    const row = rows(result)[0];
    return row ? await this.hydrate(row) : null;
  }

  async findAllByCompany(companyId: string, vehicleId?: string): Promise<WorkOrder[]> {
    const result = vehicleId
      ? await this.tx.execute(sql`
          SELECT * FROM work_orders
          WHERE company_id = ${companyId} AND vehicle_id = ${vehicleId}
          ORDER BY opened_at DESC, id DESC
        `)
      : await this.tx.execute(sql`
          SELECT * FROM work_orders
          WHERE company_id = ${companyId}
          ORDER BY opened_at DESC, id DESC
        `);
    return await Promise.all(rows(result).map((row) => this.hydrate(row)));
  }

  async findByNumber(companyId: string, number: string): Promise<WorkOrder | null> {
    const result = await this.tx.execute(sql`
      SELECT * FROM work_orders WHERE company_id = ${companyId} AND number = ${number} LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? await this.hydrate(row) : null;
  }

  async hasBlockingWorkOrder(companyId: string, vehicleId: string, excludeId: string): Promise<boolean> {
    const result = await this.tx.execute(sql`
      SELECT id FROM work_orders
      WHERE company_id = ${companyId}
        AND vehicle_id = ${vehicleId}
        AND id <> ${excludeId}
        AND status IN ('IN_PROGRESS','WAITING_PARTS','WAITING_APPROVAL')
      LIMIT 1
    `);
    return rows(result).length > 0;
  }

  async create(item: WorkOrder): Promise<WorkOrder> {
    await this.tx.execute(sql`
      INSERT INTO work_orders (
        id, company_id, number, vehicle_id, supplier_id, status, opened_at, service_date, started_at,
        completed_at, cancelled_at, entry_km, exit_km, description, diagnosis, notes,
        subtotal_parts, subtotal_services, subtotal_labor, discount, total,
        account_payable_id, created_by, created_at, updated_at
      ) VALUES (
        ${item.id}, ${item.companyId}, ${item.number}, ${item.vehicleId}, ${item.supplierId || null},
        ${item.status}, ${item.openedAt}, ${item.serviceDate}, ${item.startedAt || null}, ${item.completedAt || null},
        ${item.cancelledAt || null}, ${item.entryKm}, ${item.exitKm ?? null}, ${item.description},
        ${item.diagnosis || null}, ${item.notes || null}, ${String(item.subtotalParts)},
        ${String(item.subtotalServices)}, ${String(item.subtotalLabor)}, ${String(item.discount)},
        ${String(item.total)}, ${item.accountPayableId || null}, ${item.createdBy || item.companyId},
        ${item.createdAt}, ${item.updatedAt}
      )
    `);

    for (const part of item.parts) {
      await this.tx.execute(sql`
        INSERT INTO work_order_parts (
          id, company_id, work_order_id, part_id, description, quantity, unit_cost, total_cost
        ) VALUES (
          ${part.id}, ${item.companyId}, ${item.id}, ${part.partId || null}, ${part.description},
          ${String(part.quantity)}, ${String(part.unitCost)}, ${String(part.totalCost)}
        )
      `);
    }
    for (const service of item.services) {
      await this.tx.execute(sql`
        INSERT INTO work_order_services (
          id, company_id, work_order_id, service_id, description, quantity, unit_cost, total_cost
        ) VALUES (
          ${service.id}, ${item.companyId}, ${item.id}, ${service.serviceId || null}, ${service.description},
          ${String(service.quantity)}, ${String(service.unitCost)}, ${String(service.totalCost)}
        )
      `);
    }
    for (const labor of item.laborItems) {
      await this.tx.execute(sql`
        INSERT INTO work_order_labor (
          id, company_id, work_order_id, description, hours, hourly_rate, total_cost
        ) VALUES (
          ${labor.id}, ${item.companyId}, ${item.id}, ${labor.description}, ${String(labor.hours)},
          ${String(labor.hourlyRate)}, ${String(labor.totalCost)}
        )
      `);
    }
    for (const finance of item.financialComponents || []) {
      await this.tx.execute(sql`
        INSERT INTO work_order_financial_components (
          id, company_id, work_order_id, kind, supplier_id, category_id, payment_method_id, payment_condition,
          installments_count, first_due_date, gross_amount, discount_amount, net_amount, has_invoice, invoice_number, created_at, updated_at
        ) VALUES (
          ${finance.id}, ${item.companyId}, ${item.id}, ${finance.kind}, ${finance.supplierId || null}, ${finance.categoryId},
          ${finance.paymentMethodId}, ${finance.paymentCondition}, ${finance.installmentsCount}, ${finance.firstDueDate},
          ${String(finance.grossAmount)}, ${String(finance.discountAmount)}, ${String(finance.netAmount)}, ${finance.hasInvoice},
          ${finance.invoiceNumber || null}, ${finance.createdAt}, ${finance.updatedAt}
        )
      `);
    }
    const created = await this.findByIdForCompany(item.companyId, item.id);
    if (!created) throw new Error('Ordem de serviço não foi persistida');
    return created;
  }

  async updateLifecycle(companyId: string, id: string, patch: WorkOrderLifecyclePatch): Promise<WorkOrder | null> {
    const result = await this.tx.execute(sql`
      UPDATE work_orders SET
        status = ${patch.status},
        started_at = COALESCE(${patch.startedAt || null}, started_at),
        completed_at = COALESCE(${patch.completedAt || null}, completed_at),
        cancelled_at = COALESCE(${patch.cancelledAt || null}, cancelled_at),
        exit_km = COALESCE(${patch.exitKm ?? null}, exit_km),
        notes = CASE WHEN ${patch.notes !== undefined} THEN ${patch.notes ?? null} ELSE notes END,
        account_payable_id = COALESCE(${patch.accountPayableId || null}, account_payable_id),
        updated_at = ${patch.updatedAt}
      WHERE company_id = ${companyId} AND id = ${id}
      RETURNING *
    `);
    const row = rows(result)[0];
    return row ? await this.hydrate(row) : null;
  }
}
