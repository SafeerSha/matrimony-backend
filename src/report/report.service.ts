import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeText } from '../common/utils/sanitize.util';
import {
  AdminReportQueryDto,
  CreateReportDto,
  UpdateReportStatusDto,
} from './dto/report.dto';

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTargetUserId(rawTargetId: string): Promise<string> {
    const clean = (rawTargetId || '').trim();
    if (!clean) {
      throw new BadRequestException('Invalid member identifier.');
    }

    const directUser = await this.prisma.user.findUnique({
      where: { id: clean },
      select: { id: true, status: true, deletedAt: true },
    });
    if (directUser && directUser.status !== 'DELETED' && !directUser.deletedAt) {
      return directUser.id;
    }

    const byProfileOrCode = await this.prisma.profile.findFirst({
      where: {
        OR: [{ id: clean }, { user: { profileId: clean } }],
      },
      select: {
        userId: true,
        user: { select: { status: true, deletedAt: true } },
      },
    });
    if (
      byProfileOrCode?.userId &&
      byProfileOrCode.user?.status !== 'DELETED' &&
      !byProfileOrCode.user?.deletedAt
    ) {
      return byProfileOrCode.userId;
    }

    throw new NotFoundException('Member account not found.');
  }

  async blockUser(blockerId: string, rawTargetId: string, reason?: string) {
    const blockedId = await this.resolveTargetUserId(rawTargetId);

    if (blockerId === blockedId) {
      throw new ForbiddenException('You cannot block your own account.');
    }

    const existing = await this.prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });
    if (existing) {
      throw new ConflictException('You have already blocked this member.');
    }

    const sanitizedReason = reason ? sanitizeText(reason, 500) : null;

    const record = await this.prisma.blockedUser.create({
      data: {
        blockerId,
        blockedId,
        ...(sanitizedReason ? { reason: sanitizedReason } : {}),
      },
    });

    return {
      success: true,
      message: 'Member has been blocked.',
      block: record,
    };
  }

  async unblockUser(blockerId: string, rawTargetId: string) {
    const clean = (rawTargetId || '').trim();
    if (!clean) {
      throw new BadRequestException('Invalid member identifier.');
    }

    let blockedId = clean;
    const directBlock = await this.prisma.blockedUser.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });

    if (!directBlock) {
      blockedId = await this.resolveTargetUserId(clean);
      const resolvedBlock = await this.prisma.blockedUser.findUnique({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
      if (!resolvedBlock) {
        throw new NotFoundException('Block record not found.');
      }
    }

    await this.prisma.blockedUser.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    return {
      success: true,
      message: 'Member has been unblocked.',
    };
  }

  async getBlockedUsers(blockerId: string) {
    const records = await this.prisma.blockedUser.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            id: true,
            profileId: true,
            firstName: true,
            lastName: true,
            status: true,
            deletedAt: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                city: true,
                state: true,
                country: true,
              },
            },
            photos: {
              select: {
                url: true,
                isPrimary: true,
                createdAt: true,
              },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
              take: 1,
            },
          },
        },
      },
    });

    return records
      .filter((r: any) => r.blocked && r.blocked.status !== 'DELETED' && !r.blocked.deletedAt)
      .map((r: any) => {
        const u = r.blocked;
        const firstName = u.firstName || u.profile?.firstName || '';
        const lastName = u.lastName || u.profile?.lastName || '';
        const name = `${firstName} ${lastName}`.trim() || 'Member';
        const locationParts = [u.profile?.city, u.profile?.state || u.profile?.country].filter(Boolean);

        return {
          id: r.id,
          blockedId: u.id,
          profileId: u.profileId || null,
          name,
          firstName: firstName || null,
          lastName: lastName || null,
          location: locationParts.join(', ') || 'Location unavailable',
          image: u.photos?.[0]?.url || null,
          reason: r.reason || null,
          createdAt: r.createdAt,
        };
      });
  }

  async createReport(reporterId: string, rawTargetId: string, dto: CreateReportDto) {
    const reportedId = await this.resolveTargetUserId(rawTargetId);

    if (reporterId === reportedId) {
      throw new ForbiddenException('You cannot report your own account.');
    }

    const description = dto.description ? sanitizeText(dto.description, 2000) : null;

    const report = await this.prisma.userReport.create({
      data: {
        reporterId,
        reportedId,
        reason: dto.reason,
        ...(description ? { description } : {}),
        status: 'PENDING',
      },
    });

    return {
      success: true,
      message: 'Your report has been submitted for trust & safety review.',
      report,
    };
  }

  async getReportsAdmin(query: AdminReportQueryDto = {}) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      const createdAt: any = {};
      if (query.fromDate) {
        const from = new Date(query.fromDate);
        if (isNaN(from.getTime())) {
          throw new BadRequestException('Invalid fromDate');
        }
        createdAt.gte = from;
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        if (isNaN(to.getTime())) {
          throw new BadRequestException('Invalid toDate');
        }
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: {
              id: true,
              profileId: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reported: {
            select: {
              id: true,
              profileId: true,
              firstName: true,
              lastName: true,
              email: true,
              status: true,
              isBanned: true,
            },
          },
        },
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateReportAdmin(id: string, dto: UpdateReportStatusDto, adminId: string) {
    const existing = await this.prisma.userReport.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Report not found.');
    }

    const adminNotes =
      dto.adminNotes !== undefined ? sanitizeText(dto.adminNotes, 2000) ?? null : undefined;

    const updated = await this.prisma.userReport.update({
      where: { id },
      data: {
        status: dto.status,
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });

    return updated;
  }
}

