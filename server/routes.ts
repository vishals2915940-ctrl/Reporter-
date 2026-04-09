import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Mark any stale in_progress reports as failed on startup (prevents connection flood on restart)
  failStaleInProgressReports().catch(err => {
    console.error("Failed to clean up stale in-progress reports:", err);
  });

  app.get(api.accounts.list.path, async (req, res) => {
    const accounts = await storage.getAccounts();
    res.json(accounts);
  });

  app.post(api.accounts.create.path, async (req, res) => {
    try {
      const input = api.accounts.create.input.parse(req.body);
      const account = await storage.createOrUpdateAccount(input);
      res.status(201).json(account);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.accounts.delete.path, async (req, res) => {
    await storage.deleteAccount(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.reports.list.path, async (req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
  });

  app.post(api.reports.create.path, async (req, res) => {
    try {
      const input = api.reports.create.input.parse(req.body);
      
      const allAccounts = await storage.getAccounts();
      const activeAccounts = allAccounts.filter(a => a.status === 'active');
      if (activeAccounts.length === 0) {
        return res.status(400).json({ message: "No active Telegram accounts available for reporting" });
      }

    const report = await storage.createReport(input);

    // Use a background process that persists even if the request ends
    setImmediate(() => {
      startReportJob(report.id, input.targetLink, input.reportType, input.reportCount, input.speed ?? "normal")
        .catch(err => console.error(`Background report job ${report.id} failed:`, err));
    });

    res.status(201).json(report);

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.templates.list.path, async (req, res) => {
    const templates = await storage.getTemplates();
    res.json(templates);
  });

  app.post(api.templates.create.path, async (req, res) => {
    try {
      const input = api.templates.create.input.parse(req.body);
      const template = await storage.createTemplate(input);
      res.status(201).json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.templates.setDefault.path, async (req, res) => {
    const template = await storage.setDefaultTemplate(Number(req.params.id));
    res.json(template);
  });

  app.delete(api.templates.delete.path, async (req, res) => {
    await storage.deleteTemplate(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}

async function reportMessages(client: TelegramClient, {
  targetLink,
  messageIds,
  reportType = "spam",
  text = ""
}: {
  targetLink: string;
  messageIds: number[];
  reportType?: string;
  text?: string;
}) {
  if (!targetLink) throw new Error("targetLink required");

  // --- Strict Sanitizer for message IDs ---
  function normalizeMessageIds(input: any) {
    return ([] as any[])
      .concat(input || [])
      .map(v => {
        // primitive number
        if (typeof v === "number") return v;
        // BigInt
        if (typeof v === "bigint") return Number(v);
        // GramJS sometimes uses .id.value or just .value
        if (v && typeof v === "object") {
          if ("value" in (v as any) && (typeof (v as any).value === "number" || typeof (v as any).value === "bigint")) return Number((v as any).value);
          if ("id" in (v as any) && (v as any).id && typeof (v as any).id === "object" && "value" in (v as any).id) return Number((v as any).id.value);
        }
        // strings
        if (typeof v === "string") {
          const n = Number((v as any).trim());
          return Number.isInteger(n) ? n : NaN;
        }
        return NaN;
      })
      .filter(v => Number.isInteger(v) && v > 0);
  }

  // --- resolve entity ---
  let entity: any;
  const cleanUsername = targetLink
    .replace("https://t.me/", "")
    .replace("t.me/", "")
    .replace("@", "")
    .split('/')
    .filter(Boolean)[0]
    ?.trim();

  if (!cleanUsername) throw new Error("Invalid target link");

  try {
    entity = await client.getEntity(cleanUsername);
  } catch (e: any) {
    console.error(`Failed to resolve entity for ${cleanUsername}:`, e);
    throw e;
  }

  if (!entity) throw new Error("Entity not found");

  // --- build peer safely ---
  const peer = await client.getInputEntity(entity);

  if (!peer) throw new Error("Could not create input peer");

  const ids = normalizeMessageIds(messageIds);

  const reasonMap: Record<string, () => any> = {
    "child abuse": () => new Api.InputReportReasonChildAbuse(),
    "child_abuse": () => new Api.InputReportReasonChildAbuse(),
    "copyright": () => new Api.InputReportReasonCopyright(),
    "fake": () => new Api.InputReportReasonFake(),
    "illegal drugs": () => new Api.InputReportReasonIllegalDrugs(),
    "illegal_drugs": () => new Api.InputReportReasonIllegalDrugs(),
    "personal details": () => new Api.InputReportReasonPersonalDetails(),
    "personal_details": () => new Api.InputReportReasonPersonalDetails(),
    "pornography": () => new Api.InputReportReasonPornography(),
    "spam": () => new Api.InputReportReasonSpam(),
    "violence": () => new Api.InputReportReasonViolence(),
    "scam": () => new (Api as any).InputReportReasonScam(),
  };

  const reason = reasonMap[reportType.toLowerCase()]?.() || new Api.InputReportReasonSpam();

  console.log("Debug Report Info:", {
    peerClass: peer?.constructor?.name,
    ids,
    allIdsAreNumbers: ids.every(n => typeof n === "number"),
    reasonClass: reason?.constructor?.name,
    messageType: typeof text,
    accessHashPresent: !!(peer as any).accessHash
  });

  // --- invoke safely ---
  try {
    if (ids.length > 0) {
      console.log(`Reporting ${ids.length} messages in ${cleanUsername}`);
      const ReportModel = (Api.messages as any).ReportMessages || (Api.messages as any).Report;
      
      // Fixed: In GramJS 2.26.x, the 'messages.Report' method requires 'option' as bytes (Buffer)
      // due to a schema mismatch or update. Passing Buffer.alloc(0) satisfies the type check.
      const result = await client.invoke(new ReportModel({
        peer: peer,
        id: ids as any,
        reason: reason,
        message: String(text || "Spam"),
        option: Buffer.alloc(0)
      }));
      return !!result;
    } else {
      console.log(`Reporting entire entity: ${cleanUsername}`);
      const result = await client.invoke(new Api.account.ReportPeer({
        peer: peer,
        reason: reason,
        message: String(text || "")
      }));
      return !!result;
    }
  } catch (err: any) {
    console.error("GramJS invoke error details:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
      name: err.name
    });
    throw err;
  }
}

async function startReportJob(reportId: number, targetLink: string, reportType: string, totalCount: number, speed: string = "normal") {
  try {
    await storage.updateReportStatus(reportId, "in_progress");

    const allAccounts = await storage.getAccounts();
    const accounts = allAccounts.filter(a => a.status === 'active');
    if (accounts.length === 0) {
      throw new Error("No active accounts available for reporting");
    }

    const defaultTemplate = await storage.getDefaultTemplate();
    const reportMessage = defaultTemplate?.content || "Report";

    const clients: Map<number, TelegramClient> = new Map();
    const cachedData: Map<number, { entity: any; msgIds: number[] }> = new Map();

    const getClient = async (account: any) => {
      if (clients.has(account.id)) return clients.get(account.id)!;
      const apiId = parseInt(account.apiId, 10);
      const apiHash = account.apiHash;
      const stringSession = new StringSession(account.sessionString);
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 3,
        useWSS: false,
        autoReconnect: false,
      });
      await client.connect();
      clients.set(account.id, client);
      return client;
    };

    const report = await storage.getReport(reportId);
    let successfulCount = 0;
    let failedCount = 0;
    if (report) {
      successfulCount = report.successfulCount || 0;
      failedCount = report.failedCount || 0;
    }

    const runSingleReport = async (i: number) => {
      const account = accounts[i % accounts.length];
      const client = await getClient(account);
      let data = cachedData.get(account.id);

      if (!data) {
        let entity: any;
        let msgIds: number[] = [];

        const parts = targetLink.replace(/^https?:\/\//, '').split('/').filter(Boolean);
        const potentialId = parseInt(parts[parts.length - 1], 10);
        const isMessageLink = !isNaN(potentialId) && parts.length >= 3;

        if (isMessageLink) {
          const channelName = parts[parts.length - 2];
          entity = await client.getEntity(channelName);
          msgIds = [potentialId];
        } else {
          entity = await client.getEntity(targetLink);
          try {
            const history = await client.getMessages(entity, { limit: 10 });
            msgIds = history.map(m => m.id);
          } catch (e) {
            console.log("Could not fetch messages for entity");
          }
        }
        data = { entity, msgIds };
        cachedData.set(account.id, data);
      }

      console.log(`Sending report ${i + 1}/${totalCount} for ${targetLink} using account ${account.apiId}`);

      const result = await reportMessages(client, {
        targetLink,
        messageIds: data.msgIds,
        reportType,
        text: reportMessage
      });

      return { success: !!result, accountApiId: account.apiId };
    };

    if (speed === "fast") {
      // Fast: process in batches of 5 concurrent reports, 500ms pause between batches
      const BATCH_SIZE = 5;
      const start = successfulCount + failedCount;
      for (let batch = start; batch < totalCount; batch += BATCH_SIZE) {
        const batchIndices = Array.from(
          { length: Math.min(BATCH_SIZE, totalCount - batch) },
          (_, k) => batch + k
        );
        const batchResults = await Promise.allSettled(batchIndices.map(i => runSingleReport(i)));

        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value.success) {
            successfulCount++;
            console.log(`Successfully reported ${targetLink} with account ${result.value.accountApiId}`);
          } else {
            failedCount++;
            if (result.status === "rejected") {
              console.error(`Batch report failed:`, result.reason);
            }
          }
        }
        await storage.updateReportCounts(reportId, successfulCount, failedCount);
        if (batch + BATCH_SIZE < totalCount) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else {
      // Normal: sequential with 2s delay between each
      for (let i = successfulCount + failedCount; i < totalCount; i++) {
        try {
          const result = await runSingleReport(i);
          if (result.success) {
            successfulCount++;
            console.log(`Successfully reported ${targetLink} with account ${result.accountApiId}`);
          } else {
            failedCount++;
          }
          await storage.updateReportCounts(reportId, successfulCount, failedCount);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e: any) {
          console.error(`Error on report ${i + 1}:`, e);
          failedCount++;
          await storage.updateReportCounts(reportId, successfulCount, failedCount);
        }
      }
    }

    for (const client of Array.from(clients.values())) {
      await client.disconnect();
    }

    await storage.updateReportStatus(reportId, successfulCount > 0 ? "completed" : "failed");
  } catch (error: any) {
    console.error("Reporting failed completely:", error);
    await storage.updateReportStatus(reportId, "failed");
  }
}

async function failStaleInProgressReports() {
  const allReports = await storage.getReports();
  const inProgress = allReports.filter(r => r.status === "in_progress");

  for (const report of inProgress) {
    console.log(`Marking stale report ${report.id} as failed (server restarted)`);
    await storage.updateReportStatus(report.id, "failed");
  }
}
