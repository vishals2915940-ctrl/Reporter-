import { pgTable, text, serial, integer, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const telegramAccounts = pgTable("telegram_accounts", {
  id: serial("id").primaryKey(),
  apiId: text("api_id").notNull(),
  apiHash: text("api_hash").notNull(),
  sessionString: text("session_string").notNull(),
  status: text("status").default('active'), 
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  unq: uniqueIndex("api_credentials_unq").on(t.apiId, t.apiHash),
}));

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  targetLink: text("target_link").notNull(),
  reportType: text("report_type").notNull(),
  reportCount: integer("report_count").notNull(),
  successfulCount: integer("successful_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  speed: text("speed").notNull().default("normal"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTelegramAccountSchema = createInsertSchema(telegramAccounts).omit({ id: true, createdAt: true, status: true });
export const insertReportSchema = createInsertSchema(reports).omit({ id: true, createdAt: true, status: true });
export const insertReportTemplateSchema = createInsertSchema(reportTemplates).omit({ id: true, createdAt: true });

export type TelegramAccount = typeof telegramAccounts.$inferSelect;
export type InsertTelegramAccount = z.infer<typeof insertTelegramAccountSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type InsertReportTemplate = z.infer<typeof insertReportTemplateSchema>;

export type CreateAccountRequest = InsertTelegramAccount;
export type CreateReportRequest = InsertReport;
export type CreateTemplateRequest = InsertReportTemplate;

export type AccountResponse = TelegramAccount;
export type ReportResponse = Report;
export type TemplateResponse = ReportTemplate;
