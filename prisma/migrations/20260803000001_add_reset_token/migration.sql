-- Migration: Add reset token fields to users table
-- Permite recuperacion de contrasena via token

ALTER TABLE "users" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "users" ADD COLUMN "resetTokenExpiry" TIMESTAMP(3);
