/*
 * SecureBank Ledger — backend/src/jobs/defaultDetection.job.ts
 * Cron: runs daily at 09:00 — auto-mark severely overdue loans as DEFAULTED
 * Grace period: 90 days past nextDueDate
 */

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { LoanCC } from '../fabric/chaincodeHelper';

const GRACE_PERIOD_DAYS = 90;

cron.schedule('0 9 * * *', async () => {
  logger.info('[Cron] Running default detection...');
  try {
    const overdueJson = await LoanCC.getOverdueLoans('bank-admin');
    const overdueLoans: any[] = JSON.parse(overdueJson);
    const now = Date.now();

    let defaulted = 0;
    for (const loan of overdueLoans) {
      const dueDateMs = new Date(loan.nextDueDate).getTime();
      const daysPastDue = (now - dueDateMs) / (1000 * 60 * 60 * 24);

      if (daysPastDue > GRACE_PERIOD_DAYS) {
        try {
          await LoanCC.markDefault('bank-admin', loan.loanId);
          logger.warn(`[Default] Loan ${loan.loanId} marked as DEFAULTED (${Math.floor(daysPastDue)} days past due)`);
          defaulted++;
        } catch (err) {
          logger.error(`[Default] Failed to mark loan ${loan.loanId} as defaulted`, { err });
        }
      }
    }

    logger.info(`[Cron] Default detection complete. Marked: ${defaulted}`);
  } catch (err) {
    logger.error('[Cron] Default detection job failed', { err });
  }
});

logger.info('Default detection cron job scheduled (daily 09:00)');
