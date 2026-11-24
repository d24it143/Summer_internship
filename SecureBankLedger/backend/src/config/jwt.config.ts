/*
 * SecureBank Ledger — backend/src/config/jwt.config.ts
 * JWT configuration: access token (15m) + refresh token (7d)
 */

export const jwtConfig = {
  accessSecret:  process.env.JWT_SECRET         ?? 'change_this_secret_in_production_min32chars!!',
  refreshSecret: process.env.JWT_REFRESH_SECRET  ?? 'change_this_refresh_secret_in_production!!',
  accessExpiresIn:  process.env.JWT_EXPIRES_IN         ?? '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
};
