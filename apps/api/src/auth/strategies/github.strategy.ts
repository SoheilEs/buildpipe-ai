import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { AuthProvider } from '@prisma/client';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'disabled',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'disabled',
      callbackURL:
        config.get<string>('GITHUB_CALLBACK_URL') || 'http://localhost:3000/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new Error('GitHub account must have a public email');
    return this.authService.findOrCreateOAuthUser({
      email,
      provider: AuthProvider.github,
      providerId: profile.id,
    });
  }
}
