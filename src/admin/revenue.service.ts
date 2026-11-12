import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RevenueBreakdownQueryDto,
  RevenueExportQueryDto,
  RevenueOverviewQueryDto,
  RevenueTimeSeriesQueryDto,
  RevenueTransactionQueryDto,
  REVENUE_PRESETS,
} from './dto/revenue-query.dto';

export interface DateRangeResolution {
  start: Date;
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  preset: string;
  from: string;
  to: string;
  timezone: string;
}

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves query preset or custom from/to into current and prior comparative ranges.
   */
  public resolveRange(dto: RevenueOverviewQueryDto): DateRangeResolution {
    const now = new Date();
    const preset = dto.preset || '30d';
    const tz = dto.timezone || 'UTC';

    let start: Date;
    let end: Date = now;
    let prevStart: Date | null = null;
    let prevEnd: Date | null = null;

    if (preset === 'today') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
      end = now;
      const durationMs = end.getTime() - start.getTime();
      prevEnd = new Date(start.getTime());
      prevStart = new Date(prevEnd.getTime() - Math.max(durationMs, 24 * 60 * 60 * 1000));
    } else if (preset === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(start.getTime());
      prevStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (preset === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(start.getTime());
      prevStart = new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (preset === '90d') {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      prevEnd = new Date(start.getTime());
      prevStart = new Date(start.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (preset === 'ytd') {
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      prevStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0));
      prevEnd = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    } else if (preset === 'all') {
      start = new Date(0);
      end = now;
      prevStart = null;
      prevEnd = null;
    } else if (preset === 'custom') {
      if (!dto.from || !dto.to) {
        throw new BadRequestException('Custom preset requires both "from" and "to" parameters');
      }
      start = new Date(dto.from);
      end = new Date(dto.to);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException('Invalid date format for "from" or "to"');
      }
      if (start > end) {
        throw new BadRequestException('"from" date must be earlier than or equal to "to" date');
      }
      if (end.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Date range cannot be set in the future');
      }

      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 366) {
        throw new BadRequestException('Date range cannot exceed 366 days');
      }

      const durationMs = Math.max(end.getTime() - start.getTime(), 1000 * 60 * 60 * 24);
      prevEnd = new Date(start.getTime());
      prevStart = new Date(start.getTime() - durationMs);
    } else {
      throw new BadRequestException(`Unknown preset: ${preset}`);
    }

    return {
      start,
      end,
      prevStart,
      prevEnd,
      preset,
      from: start.toISOString(),
      to: end.toISOString(),
      timezone: tz,
    };
  }

  public calculateDelta(current: number, previous: number | null): number | null {
    if (previous === null || previous === 0) {
      return current > 0 ? 100.0 : null;
    }
    const delta = ((current - previous) / previous) * 100;
    return Math.round(delta * 10) / 10;
  }

  /**
   * Executive KPI Scorecard: Gross Revenue, MRR, ARPPU, Active Paid Subs, Success Rate.
   */
  async getOverview(dto: RevenueOverviewQueryDto) {
    const range = this.resolveRange(dto);

    // 1. Current gross revenue and count
    const [currentGrossAgg, currentSuccessCount] = await Promise.all([
      this.prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: {
          status: 'SUCCESS',
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.paymentTransaction.count({
        where: {
          status: 'SUCCESS',
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
    ]);

    const currentRevenue = currentGrossAgg._sum.amount || 0;

    // 2. Previous gross revenue
    let previousRevenue: number | null = null;
    if (range.prevStart && range.prevEnd) {
      const prevGrossAgg = await this.prisma.paymentTransaction.aggregate({
        _sum: { amount: true },
        where: {
          status: 'SUCCESS',
          createdAt: { gte: range.prevStart, lte: range.prevEnd },
        },
      });
      previousRevenue = prevGrossAgg._sum.amount || 0;
    }

    const revenueDelta = this.calculateDelta(currentRevenue, previousRevenue);

    // 3. Distinct paying users in current vs previous period (for ARPPU)
    const [currentPayingUsers, prevPayingUsers] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where: {
          status: 'SUCCESS',
          createdAt: { gte: range.start, lte: range.end },
        },
        distinct: ['userId'],
        select: { userId: true },
      }),
      range.prevStart && range.prevEnd
        ? this.prisma.paymentTransaction.findMany({
            where: {
              status: 'SUCCESS',
              createdAt: { gte: range.prevStart, lte: range.prevEnd },
            },
            distinct: ['userId'],
            select: { userId: true },
          })
        : Promise.resolve([]),
    ]);

    const currentPayingUsersCount = currentPayingUsers.length;
    const prevPayingUsersCount = prevPayingUsers.length;

    const currentArppu = currentPayingUsersCount > 0 ? Math.round(currentRevenue / currentPayingUsersCount) : 0;
    const prevArppu = prevPayingUsersCount > 0 && previousRevenue !== null ? Math.round(previousRevenue / prevPayingUsersCount) : null;
    const arppuDelta = this.calculateDelta(currentArppu, prevArppu);

    // 4. Active paid subscriptions count & MRR calculation
    const [activePaidSubs, activePaidCount, newPaidInPeriod, prevNewPaidInPeriod] = await Promise.all([
      this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          tier: { not: 'FREE' },
        },
        select: {
          amountPaid: true,
          tier: true,
          startDate: true,
          expiresAt: true,
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          tier: { not: 'FREE' },
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          tier: { not: 'FREE' },
          startDate: { gte: range.start, lte: range.end },
        },
      }),
      range.prevStart && range.prevEnd
        ? this.prisma.subscription.count({
            where: {
              status: 'ACTIVE',
              tier: { not: 'FREE' },
              startDate: { gte: range.prevStart, lte: range.prevEnd },
            },
          })
        : Promise.resolve(null),
    ]);

    // Calculate MRR from active paid subscriptions normalized to 30 days
    let currentMrr = 0;
    for (const sub of activePaidSubs) {
      const amount = sub.amountPaid || 0;
      if (amount <= 0) continue;

      let durationDays = 30;
      if (sub.startDate && sub.expiresAt) {
        const diffMs = sub.expiresAt.getTime() - sub.startDate.getTime();
        const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (days > 0) durationDays = days;
      }
      // Monthly normalized contribution = (amount / durationDays) * 30
      currentMrr += (amount / durationDays) * 30;
    }
    currentMrr = Math.round(currentMrr);

    // 5. Payment success rate & attempts breakdown
    const [successAttempts, failedAttempts, pendingAttempts, droppedAttempts] = await Promise.all([
      this.prisma.paymentTransaction.count({
        where: { status: 'SUCCESS', createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.paymentTransaction.count({
        where: { status: 'FAILED', createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.paymentTransaction.count({
        where: { status: 'PENDING', createdAt: { gte: range.start, lte: range.end } },
      }),
      this.prisma.paymentTransaction.count({
        where: { status: 'USER_DROPPED', createdAt: { gte: range.start, lte: range.end } },
      }),
    ]);

    const totalAttempts = successAttempts + failedAttempts + pendingAttempts + droppedAttempts;
    const settledAttempts = successAttempts + failedAttempts + droppedAttempts;
    const successRatePct = settledAttempts > 0 ? Math.round((successAttempts / settledAttempts) * 1000) / 10 : 100;

    const avgTicket = currentSuccessCount > 0 ? Math.round((currentRevenue / currentSuccessCount) * 10) / 10 : 0;

    return {
      range: {
        preset: range.preset,
        from: range.from,
        to: range.to,
        timezone: range.timezone,
        previousPeriod: range.prevStart && range.prevEnd ? {
          from: range.prevStart.toISOString(),
          to: range.prevEnd.toISOString(),
        } : null,
      },
      grossRevenue: {
        current: currentRevenue,
        previous: previousRevenue,
        deltaPct: revenueDelta,
        currency: 'INR',
      },
      mrr: {
        current: currentMrr,
        currency: 'INR',
      },
      arppu: {
        current: currentArppu,
        previous: prevArppu,
        deltaPct: arppuDelta,
        currency: 'INR',
        payingUsersCount: currentPayingUsersCount,
      },
      paidSubscribers: {
        activePaidCount,
        newPaidInPeriod,
        prevNewPaidInPeriod,
        deltaPct: this.calculateDelta(newPaidInPeriod, prevNewPaidInPeriod),
      },
      successRate: {
        ratePct: successRatePct,
        totalAttempts,
        successCount: successAttempts,
        failedCount: failedAttempts,
        pendingCount: pendingAttempts,
        droppedCount: droppedAttempts,
      },
      transactions: {
        successfulCount: currentSuccessCount,
        avgTicket,
      },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Bucketed time-series data for charting gross revenue and transaction count.
   */
  async getTimeSeries(dto: RevenueTimeSeriesQueryDto) {
    const range = this.resolveRange(dto);

    // Determine bucket granularity
    let bucket = dto.bucket || 'auto';
    const durationMs = range.end.getTime() - range.start.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    if (bucket === 'auto') {
      if (durationDays <= 35) {
        bucket = 'day';
      } else if (durationDays <= 180) {
        bucket = 'week';
      } else {
        bucket = 'month';
      }
    }

    // Fetch all successful transactions in range
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Bucket aggregation
    const bucketMap = new Map<string, { revenue: number; count: number }>();

    // Helper to format date key based on bucket
    const toDateKey = (date: Date): string => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');

      if (bucket === 'month') {
        return `${year}-${month}`;
      } else if (bucket === 'week') {
        // Find Monday of the week
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayOfWeek = d.getUTCDay();
        const diff = d.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        d.setUTCDate(diff);
        const wy = d.getUTCFullYear();
        const wm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const wd = String(d.getUTCDate()).padStart(2, '0');
        return `${wy}-${wm}-${wd}`;
      }
      return `${year}-${month}-${day}`;
    };

    // Pre-populate empty dates across range so chart is continuous
    if (range.preset !== 'all' && durationDays <= 366) {
      const cur = new Date(range.start);
      while (cur <= range.end) {
        const key = toDateKey(cur);
        if (!bucketMap.has(key)) {
          bucketMap.set(key, { revenue: 0, count: 0 });
        }
        // Increment day
        cur.setUTCDate(cur.getUTCDate() + (bucket === 'week' ? 7 : 1));
      }
    }

    // Populate transaction amounts into buckets
    let totalRevenue = 0;
    let totalTransactions = transactions.length;

    for (const tx of transactions) {
      const key = toDateKey(tx.createdAt);
      const existing = bucketMap.get(key) || { revenue: 0, count: 0 };
      existing.revenue += tx.amount;
      existing.count += 1;
      bucketMap.set(key, existing);
      totalRevenue += tx.amount;
    }

    // Sort chronologically and format points
    const sortedKeys = Array.from(bucketMap.keys()).sort();
    const points = sortedKeys.map((key) => {
      const data = bucketMap.get(key)!;
      return {
        date: key,
        label: key,
        revenue: Math.round(data.revenue * 100) / 100,
        transactions: data.count,
        avgTicket: data.count > 0 ? Math.round((data.revenue / data.count) * 10) / 10 : 0,
      };
    });

    return {
      range: {
        preset: range.preset,
        from: range.from,
        to: range.to,
        bucket,
      },
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalTransactions,
        avgOrderValue: totalTransactions > 0 ? Math.round((totalRevenue / totalTransactions) * 10) / 10 : 0,
      },
      points,
    };
  }

  /**
   * Plan breakdown: group successful transactions by planCode.
   */
  async getRevenueByPlan(dto: RevenueBreakdownQueryDto) {
    const range = this.resolveRange(dto);

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        planCode: true,
        planName: true,
        amount: true,
      },
    });

    let totalRevenue = 0;
    const planMap = new Map<string, { planCode: string; planName: string; count: number; revenue: number }>();

    for (const tx of transactions) {
      const code = tx.planCode || 'CUSTOM';
      const name = tx.planName || code;
      const existing = planMap.get(code) || {
        planCode: code,
        planName: name,
        count: 0,
        revenue: 0,
      };

      existing.count += 1;
      existing.revenue += tx.amount;
      planMap.set(code, existing);
      totalRevenue += tx.amount;
    }

    const plans = Array.from(planMap.values())
      .map((p) => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 1000) / 10 : 0,
        avgTicket: p.count > 0 ? Math.round((p.revenue / p.count) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCount: transactions.length,
      plans,
    };
  }

  /**
   * Payment method breakdown (UPI, Card, NetBanking, etc.)
   */
  async getRevenueByMethod(dto: RevenueBreakdownQueryDto) {
    const range = this.resolveRange(dto);

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: range.start, lte: range.end },
      },
      select: {
        paymentMethod: true,
        amount: true,
      },
    });

    let totalRevenue = 0;
    const methodMap = new Map<string, { method: string; count: number; revenue: number }>();

    for (const tx of transactions) {
      let method = (tx.paymentMethod || 'OTHER').toUpperCase().trim();
      if (!method || method === 'NULL' || method === 'UNDEFINED') {
        method = 'OTHER';
      }

      const existing = methodMap.get(method) || {
        method,
        count: 0,
        revenue: 0,
      };

      existing.count += 1;
      existing.revenue += tx.amount;
      methodMap.set(method, existing);
      totalRevenue += tx.amount;
    }

    const methods = Array.from(methodMap.values())
      .map((m) => ({
        ...m,
        revenue: Math.round(m.revenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((m.revenue / totalRevenue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCount: transactions.length,
      methods,
    };
  }

  /**
   * Builds Prisma where filter for transaction queries and CSV export.
   */
  private buildTransactionFilter(dto: {
    status?: string;
    plan?: string;
    method?: string;
    search?: string;
    from?: string;
    to?: string;
  }) {
    const where: any = {};

    if (dto.status && dto.status !== 'ALL') {
      where.status = dto.status.toUpperCase();
    }

    if (dto.plan && dto.plan !== 'ALL') {
      where.planCode = dto.plan;
    }

    if (dto.method && dto.method !== 'ALL') {
      where.paymentMethod = {
        equals: dto.method,
        mode: 'insensitive',
      };
    }

    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) where.createdAt.gte = new Date(dto.from);
      if (dto.to) where.createdAt.lte = new Date(dto.to);
    }

    if (dto.search && dto.search.trim()) {
      const q = dto.search.trim();
      where.OR = [
        { orderId: { contains: q, mode: 'insensitive' } },
        { cfPaymentId: { contains: q, mode: 'insensitive' } },
        { cfOrderId: { contains: q, mode: 'insensitive' } },
        { planName: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { profileId: { contains: q, mode: 'insensitive' } } },
        { user: { phone: { contains: q, mode: 'insensitive' } } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  /**
   * Paginated transaction ledger with associated member profile details.
   */
  async getTransactions(query: RevenueTransactionQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where = this.buildTransactionFilter(query);

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const [total, transactions] = await Promise.all([
      this.prisma.paymentTransaction.count({ where }),
      this.prisma.paymentTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
              profileId: true,
              subscriptionTier: true,
              photos: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true },
              },
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items = transactions.map((tx) => {
      const u = tx.user;
      const firstName = u?.firstName || u?.profile?.firstName || '';
      const lastName = u?.lastName || u?.profile?.lastName || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Anonymous Member';
      const avatarUrl = u?.photos?.[0]?.url || null;

      return {
        id: tx.id,
        orderId: tx.orderId,
        cfOrderId: tx.cfOrderId,
        cfPaymentId: tx.cfPaymentId,
        planCode: tx.planCode,
        planName: tx.planName,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        paymentMethod: tx.paymentMethod || 'N/A',
        paymentMessage: tx.paymentMessage,
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString(),
        user: {
          id: u?.id || tx.userId,
          profileId: u?.profileId || 'N/A',
          customerName,
          email: u?.email || 'N/A',
          phone: u?.phone || 'N/A',
          subscriptionTier: u?.subscriptionTier || 'BASIC',
          avatarUrl,
        },
      };
    });

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Sanitizes a cell string against CSV / spreadsheet formula injection (CWE-1236).
   * If a string starts with '=', '+', '-', '@', '\t', or '\r', we prefix with a single quote.
   */
  private sanitizeCsvCell(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    let str = String(value).trim();
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    // Escape double quotes and enclose in quotes if needed
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Generates safe RFC 4180 CSV export for accounting and audit compliance.
   */
  async exportCsv(query: RevenueExportQueryDto): Promise<string> {
    const where = this.buildTransactionFilter(query);

    // Safety cap: up to 5,000 records to prevent memory exhaustion
    const transactions = await this.prisma.paymentTransaction.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            profileId: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    const headers = [
      'Transaction ID',
      'Order ID',
      'Gateway Payment ID',
      'Date (UTC)',
      'Member ID',
      'Customer Name',
      'Email',
      'Phone',
      'Plan Code',
      'Plan Name',
      'Amount (INR)',
      'Payment Method',
      'Status',
      'Payment Message',
    ];

    const rows = transactions.map((tx) => {
      const u = tx.user;
      const firstName = u?.firstName || u?.profile?.firstName || '';
      const lastName = u?.lastName || u?.profile?.lastName || '';
      const customerName = `${firstName} ${lastName}`.trim() || 'Anonymous';

      return [
        this.sanitizeCsvCell(tx.id),
        this.sanitizeCsvCell(tx.orderId),
        this.sanitizeCsvCell(tx.cfPaymentId || tx.cfOrderId || 'N/A'),
        this.sanitizeCsvCell(tx.createdAt.toISOString()),
        this.sanitizeCsvCell(u?.profileId || 'N/A'),
        this.sanitizeCsvCell(customerName),
        this.sanitizeCsvCell(u?.email || 'N/A'),
        this.sanitizeCsvCell(u?.phone || 'N/A'),
        this.sanitizeCsvCell(tx.planCode),
        this.sanitizeCsvCell(tx.planName),
        this.sanitizeCsvCell(tx.amount.toFixed(2)),
        this.sanitizeCsvCell(tx.paymentMethod || 'N/A'),
        this.sanitizeCsvCell(tx.status),
        this.sanitizeCsvCell(tx.paymentMessage || ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }
}
