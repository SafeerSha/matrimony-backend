import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'MSG91_AUTH_KEY') return 'test_auth_key';
              if (key === 'MSG91_TEMPLATE_ID') return 'test_template_id';
              if (key === 'MSG91_OTP_EXPIRY_MINUTES') return 10;
              return null;
            },
          },
        },
      ],
    }).compile();

    service = module.get<SmsService>(SmsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return true for isConfigured when auth key and template id are provided', () => {
    expect(service.isConfigured()).toBe(true);
  });
});

