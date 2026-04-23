-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN "emailAddress" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "sendgridApiKey" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "sendgridFromEmail" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "telegramBotToken" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "twilioAccountSid" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "twilioAuthToken" TEXT;
ALTER TABLE "NotificationPreferences" ADD COLUMN "twilioPhoneNumber" TEXT;
