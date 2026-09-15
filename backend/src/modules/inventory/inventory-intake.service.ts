import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../shared/database/prisma.service';
import { InventoryWorkspaceService } from './inventory-workspace.service';
import { PharmacyPurchaseInvoiceService } from '../pharmacy/pharmacy-purchase-invoice.service';
import { WorkflowActor } from './inventory-workflow.types';

@Injectable()
export class InventoryIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: InventoryWorkspaceService,
    private readonly purchases: PharmacyPurchaseInvoiceService,
  ) {}
  /**
   * @cc [owner:nareshshah139,label:product] purchase-csv-preview-before-post
   * CSV parsing MUST retain the source and every data row, report malformed values by row, and
   * return a review draft without changing stock. Repeated headers must identify the same bill.
   */
  async csv(actor: WorkflowActor, file: Express.Multer.File) {
    await this.workspace.require(actor, 'inventory:po:create');
    if (!file?.buffer?.length || file.buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('Choose a CSV under 10 MB');
    if (!/\.csv$/i.test(file.originalname) || file.buffer.includes(0))
      throw new BadRequestException('Choose a UTF-8 CSV invoice');
    const text = file.buffer.toString('utf8'),
      book = XLSX.read(text, { type: 'string', raw: true }),
      rows = XLSX.utils.sheet_to_json<Record<string, any>>(
        book.Sheets[book.SheetNames[0]],
        { defval: '', raw: false },
      );
    if (!rows.length || rows.length > 1000)
      throw new BadRequestException('CSV must contain 1–1,000 invoice lines');
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const original = await this.prisma.pharmacyPurchaseInvoiceDocument.upsert({
      where: { branchId_sha256: { branchId: actor.branchId, sha256: hash } },
      update: {},
      create: {
        branchId: actor.branchId,
        uploadedBy: actor.id,
        fileName: file.originalname.replace(/[^\w .-]/g, '_').slice(0, 200),
        mimeType: 'text/csv',
        sizeBytes: file.buffer.length,
        sha256: hash,
        data: file.buffer,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        purchaseInvoiceId: true,
      },
    });
    if (original.purchaseInvoiceId)
      return {
        duplicateInvoiceId: original.purchaseInvoiceId,
        sourceDocument: original,
      };
    const header = rows[0],
      issues: string[] = [];
    const num = (row: any, key: string, index: number, optional = false) => {
      if (row[key] === '' || row[key] == null) {
        if (!optional) issues.push(`Row ${index + 2}: ${key} is missing`);
        return 0;
      }
      const n = Number(String(row[key]).replaceAll(',', ''));
      if (!Number.isFinite(n) || n < 0) {
        issues.push(`Row ${index + 2}: ${key} must be nonnegative`);
        return 0;
      }
      return n;
    };
    const items = rows.map((r, index) => {
      for (const key of ['invoiceNumber', 'distributorGstin', 'invoiceDate'])
        if (r[key] !== header[key])
          issues.push(
            `Row ${index + 2}: ${key} identifies a different invoice`,
          );
      return {
        serialNumber: index + 1,
        productName: String(r.productName || ''),
        manufacturer: String(r.manufacturer || ''),
        packSize: String(r.packSize || ''),
        packUnitType: String(r.packUnitType || ''),
        hsnCode: String(r.hsnCode || ''),
        batchNumber: String(r.batchNumber || ''),
        expiryMonth: num(r, 'expiryMonth', index),
        expiryYear: num(r, 'expiryYear', index),
        quantityPurchased: num(r, 'quantityPurchased', index),
        freeQuantity: num(r, 'freeQuantity', index, true),
        mrp: num(r, 'mrp', index),
        purchaseRate: num(r, 'purchaseRate', index),
        discountPercent: num(r, 'discountPercent', index, true),
        specialDiscountPercent: num(r, 'specialDiscountPercent', index, true),
        schemeAmount: num(r, 'schemeAmount', index, true),
        taxableAmount: num(r, 'taxableAmount', index),
        cgstPercent: num(r, 'cgstPercent', index, true),
        sgstPercent: num(r, 'sgstPercent', index, true),
        igstPercent: num(r, 'igstPercent', index, true),
        gstAmount: num(r, 'gstAmount', index),
        lineTotal: num(r, 'lineTotal', index),
      };
    });
    const sum = (key: string) =>
      Math.round(
        items.reduce((n, i) => n + Number((i as any)[key] || 0), 0) * 100,
      ) / 100;
    const draft: any = {
      source: 'CSV',
      sourceDocumentId: original.id,
      distributorName: header.distributorName || '',
      distributorGstin: header.distributorGstin || '',
      distributorDlNo: header.distributorDlNo || '',
      invoiceNumber: header.invoiceNumber || '',
      invoiceDate: header.invoiceDate || '',
      goodsReceivedDate: header.goodsReceivedDate || '',
      billType: header.billType || '',
      dueDate: header.dueDate || '',
      doctorNameOrRegNo: header.doctorNameOrRegNo || '',
      grossAmount: items.reduce(
        (n, i) => n + i.quantityPurchased * i.purchaseRate,
        0,
      ),
      taxableAmount: sum('taxableAmount'),
      totalGst: sum('gstAmount'),
      totalCgst: items.reduce(
        (n, i) => n + (i.taxableAmount * i.cgstPercent) / 100,
        0,
      ),
      totalSgst: items.reduce(
        (n, i) => n + (i.taxableAmount * i.sgstPercent) / 100,
        0,
      ),
      totalIgst: items.reduce(
        (n, i) => n + (i.taxableAmount * i.igstPercent) / 100,
        0,
      ),
      rounding: num(header, 'rounding', 0, true),
      netPayable: header.netPayable
        ? num(header, 'netPayable', 0)
        : sum('lineTotal'),
      items,
      ocrFlags: issues,
    };
    return { draft, sourceDocument: original, rowCount: items.length, issues };
  }
  private configured() {
    return !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REDIRECT_URI &&
      process.env.INVENTORY_TOKEN_KEY
    );
  }
  private client() {
    if (!this.configured())
      throw new ServiceUnavailableException(
        'Gmail connection is not configured. Ask the administrator to set Gmail OAuth and the token encryption key.',
      );
    return new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI,
    );
  }
  private key() {
    const key = Buffer.from(process.env.INVENTORY_TOKEN_KEY || '', 'base64');
    if (key.length !== 32)
      throw new ServiceUnavailableException(
        'The inventory token encryption key must contain 32 bytes',
      );
    return key;
  }
  private encrypt(value: any) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv),
      data = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  private decrypt(value: string) {
    const data = Buffer.from(value, 'base64'),
      cipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        data.subarray(0, 12),
      );
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString('utf8'),
    );
  }
  async mailboxStatus(actor: WorkflowActor) {
    await this.workspace.require(actor, 'inventory:po:create');
    const row = await this.prisma.inventoryMailboxConnection.findUnique({
      where: {
        branchId_userId: { branchId: actor.branchId, userId: actor.id },
      },
    });
    return {
      configured: this.configured(),
      connected: !!row?.encryptedTokens,
      email: row?.email || null,
      lastSyncAt: row?.lastSyncAt || null,
    };
  }
  async connect(actor: WorkflowActor) {
    await this.workspace.require(actor, 'inventory:po:create');
    const client = this.client();
    this.key();
    const state = randomBytes(32).toString('base64url'),
      stateHash = createHash('sha256').update(state).digest('hex');
    await this.prisma.inventoryMailboxConnection.upsert({
      where: {
        branchId_userId: { branchId: actor.branchId, userId: actor.id },
      },
      create: {
        branchId: actor.branchId,
        userId: actor.id,
        stateHash,
        stateExpiresAt: new Date(Date.now() + 10 * 60000),
      },
      update: { stateHash, stateExpiresAt: new Date(Date.now() + 10 * 60000) },
    });
    return {
      url: client.generateAuthUrl({
        scope: ['https://www.googleapis.com/auth/gmail.readonly'],
        access_type: 'offline',
        prompt: 'consent',
        state,
      }),
    };
  }
  async exchange(actor: WorkflowActor, code: string, state: string) {
    await this.workspace.require(actor, 'inventory:po:create');
    const row = await this.prisma.inventoryMailboxConnection.findUnique({
      where: {
        branchId_userId: { branchId: actor.branchId, userId: actor.id },
      },
    });
    if (
      !row ||
      !state ||
      row.stateHash !== createHash('sha256').update(state).digest('hex') ||
      !row.stateExpiresAt ||
      row.stateExpiresAt < new Date()
    )
      throw new BadRequestException(
        'Gmail connection expired. Start Connect Gmail again.',
      );
    const client = this.client();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token)
      throw new BadRequestException(
        'Google did not return offline access. Reconnect and approve access.',
      );
    client.setCredentials(tokens);
    const profile = await google
      .gmail({ version: 'v1', auth: client })
      .users.getProfile({ userId: 'me' });
    await this.prisma.inventoryMailboxConnection.update({
      where: { id: row.id, stateHash: row.stateHash },
      data: {
        encryptedTokens: this.encrypt(tokens),
        email: profile.data.emailAddress,
        stateHash: null,
        stateExpiresAt: null,
      },
    });
    return this.mailboxStatus(actor);
  }
  async disconnect(actor: WorkflowActor) {
    await this.workspace.require(actor, 'inventory:po:create');
    await this.prisma.inventoryMailboxConnection.deleteMany({
      where: { branchId: actor.branchId, userId: actor.id },
    });
    return { connected: false };
  }
  private async gmail(actor: WorkflowActor) {
    await this.workspace.require(actor, 'inventory:po:create');
    const row = await this.prisma.inventoryMailboxConnection.findUnique({
      where: {
        branchId_userId: { branchId: actor.branchId, userId: actor.id },
      },
    });
    if (!row?.encryptedTokens)
      throw new BadRequestException('Connect your Gmail account first');
    const client = this.client();
    client.setCredentials(this.decrypt(row.encryptedTokens));
    return google.gmail({ version: 'v1', auth: client });
  }
  private attachments(parts: any[]): any[] {
    return parts.flatMap((p) => [
      ...(p.filename &&
      p.body?.attachmentId &&
      /^(image\/|application\/pdf)/.test(p.mimeType)
        ? [
            {
              id: p.body.attachmentId,
              name: p.filename,
              mimeType: p.mimeType,
              size: p.body.size,
            },
          ]
        : []),
      ...this.attachments(p.parts || []),
    ]);
  }
  async messages(actor: WorkflowActor, query: string, pageToken?: string) {
    const gmail = await this.gmail(actor);
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `has:attachment ${String(query || 'newer_than:30d').slice(0, 200)}`,
      maxResults: 20,
      pageToken,
    });
    const messages = [] as any[];
    for (const message of list.data.messages || []) {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full',
      });
      const headers = data.payload?.headers || [],
        get = (key: string) =>
          headers.find((h) => h.name?.toLowerCase() === key)?.value;
      const attachments = this.attachments(data.payload?.parts || []);
      if (attachments.length)
        messages.push({
          id: data.id,
          subject: get('subject') || '(No subject)',
          from: get('from'),
          date: get('date'),
          attachments,
        });
    }
    await this.prisma.inventoryMailboxConnection.update({
      where: {
        branchId_userId: { branchId: actor.branchId, userId: actor.id },
      },
      data: { lastSyncAt: new Date() },
    });
    return { messages, nextPageToken: list.data.nextPageToken };
  }
  async importAttachment(actor: WorkflowActor, input: Record<string, any>) {
    const gmail = await this.gmail(actor);
    const { data: message } = await gmail.users.messages.get({
      userId: 'me',
      id: String(input.messageId),
      format: 'full',
    });
    const file = this.attachments(message.payload?.parts || []).find(
      (a) => a.id === input.attachmentId,
    );
    if (!file || file.size > 25 * 1024 * 1024)
      throw new BadRequestException(
        'Choose a PDF or photo attachment under 25 MB',
      );
    const { data } = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: String(input.messageId),
      id: file.id,
    });
    const buffer = Buffer.from(data.data || '', 'base64url');
    const result = await this.purchases.extractDraftFromDocument(
      {
        buffer,
        size: buffer.length,
        originalname: file.name,
        mimetype: file.mimeType,
      } as Express.Multer.File,
      actor.branchId,
      actor.id,
    );
    return { ...result, draft: { ...result.draft, source: 'GMAIL' } };
  }
}
