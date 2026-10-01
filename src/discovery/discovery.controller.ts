import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('discovery')
@UseGuards(JwtAuthGuard)
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('search')
  async search(@Query() query: SearchQueryDto, @CurrentUser() user: any) {
    return this.discoveryService.searchProfiles(query, user.sub);
  }

  @Get('recommendations')
  async recommendations(@CurrentUser() user: any) {
    return this.discoveryService.getRecommendations(user.sub);
  }
}
