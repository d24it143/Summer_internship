/*
 * SecureBank Ledger — backend/src/jobs/loanEmiReminder.job.ts
 * Cron: runs daily at 8:00 AM — check upcoming EMI dues
 */

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { LoanCC } from '../fabric/chaincodeHelper';

// Daily at 08:00
cron.schedule('0 8 * * *', async () => {
  logger.info('[Cron] Running EMI reminder check...');
  try {
    // Use admin identity to query overdue loans
    const overdueJson = await LoanCC.getOverdueLoans('bank-admin');
    const overdueLoans: any[] = JSON.parse(overdueJson);

    for (const loan of overdueLoans) {
      logger.warn(`[EMI Reminder] Loan ${loan.loanId} is overdue. Customer: ${loan.customerId}. Next due: ${loan.nextDueDate}`);
      // In production: send email/SMS notification via notification service
    }

    logger.info(`[Cron] EMI check complete. Overdue loans: ${overdueLoans.length}`);
  } catch (err) {
    logger.error('[Cron] EMI reminder job failed', { err });
  }
});

logger.info('EMI reminder cron job scheduled (daily 08:00)');
