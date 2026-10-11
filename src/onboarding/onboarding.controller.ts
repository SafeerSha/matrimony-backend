import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('complete')
  async completeOnboarding(
    @CurrentUser() user: any,
    @Body() dto: CompleteOnboardingDto,
  ) {
    return this.onboardingService.completeOnboarding(user.sub, dto);
  }
}
