import { db } from "./db";
import {
  telegramAccounts,
  reports,
  reportTemplates,
  type TelegramAccount,
  type InsertTelegramAccount,
  type Report,
  type InsertReport,
  type ReportTemplate,
  type InsertReportTemplate
} from "@shared/schema";
import { eq, and, desc, not } from "drizzle-orm";

export interface IStorage {
  getAccounts(): Promise<TelegramAccount[]>;
  createOrUpdateAccount(account: InsertTelegramAccount): Promise<TelegramAccount>;
  deleteAccount(id: number): Promise<void>;
  
  getReports(): Promise<Report[]>;
  getReport(id: number): Promise<Report | undefined>;
  createReport(report: InsertReport): Promise<Report>;
  updateReportStatus(id: number, status: string): Promise<void>;
  updateReportCounts(id: number, successfulCount: number, failedCount: number): Promise<void>;

  getTemplates(): Promise<ReportTemplate[]>;
  getDefaultTemplate(): Promise<ReportTemplate | undefined>;
  createTemplate(template: InsertReportTemplate): Promise<ReportTemplate>;
  setDefaultTemplate(id: number): Promise<ReportTemplate>;
  deleteTemplate(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getAccounts(): Promise<TelegramAccount[]> {
    return await db.select().from(telegramAccounts);
  }

  async createOrUpdateAccount(account: InsertTelegramAccount): Promise<TelegramAccount> {
    const existing = await db.select().from(telegramAccounts).where(
      and(
        eq(telegramAccounts.apiId, account.apiId),
        eq(telegramAccounts.apiHash, account.apiHash)
      )
    ).limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(telegramAccounts)
        .set({ sessionString: account.sessionString })
        .where(eq(telegramAccounts.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(telegramAccounts).values(account).returning();
      return created;
    }
  }

  async deleteAccount(id: number): Promise<void> {
    await db.delete(telegramAccounts).where(eq(telegramAccounts.id, id));
  }

  async getReports(): Promise<Report[]> {
    return await db.select().from(reports).orderBy(desc(reports.createdAt));
  }

  async getReport(id: number): Promise<Report | undefined> {
    const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    return report;
  }

  async createReport(report: InsertReport): Promise<Report> {
    const [created] = await db.insert(reports).values(report).returning();
    return created;
  }

  async updateReportStatus(id: number, status: string): Promise<void> {
    await db.update(reports).set({ status }).where(eq(reports.id, id));
  }

  async updateReportCounts(id: number, successfulCount: number, failedCount: number): Promise<void> {
    await db.update(reports).set({ successfulCount, failedCount }).where(eq(reports.id, id));
  }

  async getTemplates(): Promise<ReportTemplate[]> {
    return await db.select().from(reportTemplates).orderBy(desc(reportTemplates.createdAt));
  }

  async getDefaultTemplate(): Promise<ReportTemplate | undefined> {
    const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.isDefault, true)).limit(1);
    return template;
  }

  async createTemplate(template: InsertReportTemplate): Promise<ReportTemplate> {
    if (template.isDefault) {
      await db.update(reportTemplates).set({ isDefault: false });
    }
    const [created] = await db.insert(reportTemplates).values(template).returning();
    return created;
  }

  async setDefaultTemplate(id: number): Promise<ReportTemplate> {
    await db.update(reportTemplates).set({ isDefault: false });
    const [updated] = await db.update(reportTemplates).set({ isDefault: true }).where(eq(reportTemplates.id, id)).returning();
    return updated;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
  }
}

export const storage = new DatabaseStorage();
