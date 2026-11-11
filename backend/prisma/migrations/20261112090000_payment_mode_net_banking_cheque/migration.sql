-- Clinic desks take bank transfers and cheques; payments of either were refused by the database.
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'NET_BANKING';
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'CHEQUE';
