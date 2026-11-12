import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RevenueService } from './revenue.service';
import {
  RevenueBreakdownQueryDto,
  RevenueExportQueryDto,
  RevenueOverviewQueryDto,
  RevenueTimeSeriesQueryDto,
  RevenueTransactionQueryDto,
} from './dto/revenue-query.dto';

@ApiTags('Admin Revenue')
@ApiBearerAuth('JWT-auth')
@Controller('admin/revenue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RevenueController {
  constructor(private readonly revenueService: RevenueService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get executive KPI scorecard for platform revenue' })
  async getOverview(@Query() query: RevenueOverviewQueryDto) {
    return this.revenueService.getOverview(query);
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Get bucketed revenue and transaction volume time-series data' })
  async getTimeSeries(@Query() query: RevenueTimeSeriesQueryDto) {
    return this.revenueService.getTimeSeries(query);
  }

  @Get('by-plan')
  @ApiOperation({ summary: 'Get revenue breakdown grouped by subscription plan' })
  async getRevenueByPlan(@Query() query: RevenueBreakdownQueryDto) {
    return this.revenueService.getRevenueByPlan(query);
  }

  @Get('by-method')
  @ApiOperation({ summary: 'Get revenue breakdown grouped by payment method (UPI, Card, etc.)' })
  async getRevenueByMethod(@Query() query: RevenueBreakdownQueryDto) {
    return this.revenueService.getRevenueByMethod(query);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List paginated, filtered transactions with user details' })
  async getTransactions(@Query() query: RevenueTransactionQueryDto) {
    return this.revenueService.getTransactions(query);
  }

  @Get('export-csv')
  @ApiOperation({ summary: 'Export transaction ledger as safe RFC 4180 CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() query: RevenueExportQueryDto,
    @Res() res: Response,
  ) {
    const csvData = await this.revenueService.exportCsv(query);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ishtamchat-revenue-${dateStr}.csv"`,
    );
    res.send(csvData);
  }
}
