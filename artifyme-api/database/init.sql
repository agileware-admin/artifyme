-- ArtifyMe Database Initialization Script
-- This script runs when PostgreSQL container starts for the first time

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Create initial coupon
INSERT INTO "Coupon" (id, code, description, "discountType", "discountValue", "maxUses", "isActive", "createdAt")
VALUES (
    uuid_generate_v4(),
    'BEMVINDO10',
    'Cupom de boas-vindas - 10% de desconto',
    'percentage',
    10,
    NULL,
    true,
    NOW()
) ON CONFLICT (code) DO NOTHING;

-- Create indexes for better performance (Prisma will also create these, but explicit is better)
-- Note: Prisma migrations should handle most indexes, this is just for init

-- Grant permissions (if using specific roles)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO artifyme;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO artifyme;
