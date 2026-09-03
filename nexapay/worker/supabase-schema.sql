-- =============================================================================
-- FIAT-TO-CRYPTO GATEWAY - SUPABASE SCHEMA
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- Create an explicit enum for payment tracking states
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create the foundational orders tracking table
CREATE TABLE orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    amount_fiat NUMERIC(10, 2) NOT NULL,
    currency_fiat VARCHAR(10) DEFAULT 'USD',
    amount_crypto_expected NUMERIC(18, 6),
    crypto_asset VARCHAR(10) DEFAULT 'USDT',
    blockchain_network VARCHAR(50) DEFAULT 'polygon',
    status payment_status DEFAULT 'pending',
    onramp_transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index the tracking numbers for lightning-fast webhook lookup performance
CREATE INDEX idx_orders_onramp_id ON orders(onramp_transaction_id);

-- Optional: auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Row Level Security (recommended for production)
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- For a pure backend worker using the service role key you can leave RLS off,
-- or create policies that only allow the service role full access.
