/*
 * SecureBank Ledger — backend/src/config/db.config.ts
 * Sequelize configuration: SQLite in development/test, PostgreSQL in production
 */

import { Sequelize } from 'sequelize';
import path from 'path';
import { logger } from '../utils/logger';

const isDev = process.env.NODE_ENV === 'development' || !process.env.DATABASE_URL;
const isTest = process.env.NODE_ENV === 'test';

export const sequelize = (isDev || isTest)
  ? new Sequelize({
      dialect: 'sqlite',
      storage: path.resolve(__dirname, '../../../database.sqlite'),
      logging: (msg) => logger.debug(msg),
      define: {
        underscored: true,
        timestamps: true,
      },
    })
  : new Sequelize(process.env.DATABASE_URL!, {
      dialect: 'postgres',
      logging: (msg) => logger.debug(msg),
      pool: {
        max: 20,
        min: 2,
        acquire: 30000,
        idle: 10000,
      },
      define: {
        underscored: true,
        timestamps: true,
      },
    });

export async function connectDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    // SQLite does not support advanced alter operations — use simple sync
    if (isDev || isTest) {
      await sequelize.sync();
    } else {
      await sequelize.sync({ alter: true });
    }
    logger.info(`Database connected and synchronized (${isDev ? 'SQLite' : 'PostgreSQL'})`);
  } catch (error) {
    logger.error('Database connection failed', { error });
    throw error;
  }
}
