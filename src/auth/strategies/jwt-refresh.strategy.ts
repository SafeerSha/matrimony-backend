import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          let data = request?.cookies?.['refreshToken'] || request?.body?.refreshToken;
          if (!data && request?.headers?.authorization) {
            const auth = request.headers.authorization;
            if (auth.startsWith('Bearer ')) {
              data = auth.substring(7).trim();
            }
          }
          return data || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const refreshToken =
      req.cookies?.['refreshToken'] ||
      req.body?.refreshToken ||
      (req.headers?.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : null);
    if (!refreshToken) {
      throw new UnauthorizedException();
    }
    
    return { ...payload, refreshToken };
  }
}
