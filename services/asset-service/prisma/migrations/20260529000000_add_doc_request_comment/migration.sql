-- Add comment column to document_requests table
-- Stores the manager's reason for fulfilling or rejecting a document request.
ALTER TABLE "document_requests" ADD COLUMN "comment" TEXT;
