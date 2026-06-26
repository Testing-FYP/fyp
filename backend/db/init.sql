-- Clean up any partial failed run first
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TABLE IF EXISTS "Reservations" CASCADE;
DROP TABLE IF EXISTS "Trips" CASCADE;
DROP TABLE IF EXISTS "Profiles" CASCADE;
DROP TABLE IF EXISTS "Users" CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TravelEliteDB - Full Schema Initialization Script
-- Run this ONCE to create all tables in TravelEliteDB
-- ============================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_plaintext VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  otp VARCHAR(6) NULL,
  otp_expires_at TIMESTAMPTZ NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  google_id VARCHAR(255) NULL,
  CONSTRAINT UQ_Users_Email UNIQUE (email)
);

-- Profiles Table (1-to-1 with Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  phone VARCHAR(50),
  date_of_birth DATE,
  nationality VARCHAR(100),
  passport_number VARCHAR(100),
  address VARCHAR(500),
  city VARCHAR(100),
  country VARCHAR(100),
  bio VARCHAR(1000),
  avatar_url VARCHAR(500),
  preferred_currency VARCHAR(10) DEFAULT 'USD',
  preferred_language VARCHAR(10) DEFAULT 'en',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT FK_Profiles_Users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT UQ_Profiles_UserId UNIQUE (user_id)
);

-- Trips Table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  passengers INT DEFAULT 1,
  trip_type VARCHAR(50) DEFAULT 'flight',
  status VARCHAR(50) DEFAULT 'planned',
  notes VARCHAR(2000),
  offer_id VARCHAR(255),
  total_amount DECIMAL(10,2),
  currency VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT FK_Trips_Users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT CHK_Trips_Type CHECK (trip_type IN ('flight', 'hotel', 'bus', 'bundle')),
  CONSTRAINT CHK_Trips_Status CHECK (status IN ('planned', 'booked', 'completed', 'cancelled'))
);

-- Reservations Table
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trip_id UUID,
  reservation_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100),
  provider_booking_ref VARCHAR(255),
  origin VARCHAR(100),
  destination VARCHAR(100),
  departure_datetime TIMESTAMPTZ,
  arrival_datetime TIMESTAMPTZ,
  passengers INT DEFAULT 1,
  total_amount DECIMAL(10,2),
  currency VARCHAR(10) DEFAULT 'USD',
  cabin_class VARCHAR(50),
  status VARCHAR(50) DEFAULT 'confirmed',
  payment_intent_id VARCHAR(255) NULL,
  booking_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT FK_Reservations_Users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT FK_Reservations_Trips FOREIGN KEY (trip_id) REFERENCES trips(id),
  CONSTRAINT CHK_Reservations_Type CHECK (reservation_type IN ('flight', 'hotel', 'bus')),
  CONSTRAINT CHK_Reservations_Status CHECK (status IN ('confirmed', 'cancelled', 'pending'))
);


-- Enable Row Level Security explicitly
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
