import { z } from 'zod';
import { insertTelegramAccountSchema, insertReportSchema, insertReportTemplateSchema, telegramAccounts, reports, reportTemplates } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  accounts: {
    list: {
      method: 'GET' as const,
      path: '/tg-api/accounts' as const,
      responses: {
        200: z.array(z.custom<typeof telegramAccounts.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/tg-api/accounts' as const,
      input: insertTelegramAccountSchema,
      responses: {
        201: z.custom<typeof telegramAccounts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/tg-api/accounts/:id' as const,
      responses: {
        204: z.void(),
      },
    }
  },
  reports: {
    list: {
      method: 'GET' as const,
      path: '/tg-api/reports' as const,
      responses: {
        200: z.array(z.custom<typeof reports.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/tg-api/reports' as const,
      input: insertReportSchema,
      responses: {
        201: z.custom<typeof reports.$inferSelect>(),
        400: errorSchemas.validation,
      },
    }
  },
  templates: {
    list: {
      method: 'GET' as const,
      path: '/tg-api/templates' as const,
      responses: {
        200: z.array(z.custom<typeof reportTemplates.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/tg-api/templates' as const,
      input: insertReportTemplateSchema,
      responses: {
        201: z.custom<typeof reportTemplates.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    setDefault: {
      method: 'POST' as const,
      path: '/tg-api/templates/:id/default' as const,
      responses: {
        200: z.custom<typeof reportTemplates.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/tg-api/templates/:id' as const,
      responses: {
        204: z.void(),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
