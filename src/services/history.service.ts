import { and, desc, eq } from "drizzle-orm";

import { db } from "../db/connection";
import { requestHistory } from "../db/schema";

interface HistoryQuery {
  page: number;
  limit: number;
  userId?: string;
}

export async function getRequestHistory(
  accountId: string,
  query: HistoryQuery
) {
  const offset = (query.page - 1) * query.limit;

  const filters = [
    eq(requestHistory.accountId, accountId),
  ];

  if (query.userId) {
    filters.push(eq(requestHistory.userId, query.userId));
  }

  const rows = await db
    .select({
      id: requestHistory.id,
      requestId: requestHistory.requestId,
      userId: requestHistory.userId,
      units: requestHistory.requestedUnits,
      status: requestHistory.status,
      rejectionLevel: requestHistory.rejectionLevel,
      rejectionRule: requestHistory.rejectionRule,
      processedAt: requestHistory.processedAt,
    })
    .from(requestHistory)
    .where(and(...filters))
    .orderBy(
      desc(requestHistory.processedAt),
      desc(requestHistory.id)
    )
    .limit(query.limit + 1)
    .offset(offset);

  const hasMore = rows.length > query.limit;

  return {
    history: rows.slice(0, query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      hasMore,
    },
  };
}