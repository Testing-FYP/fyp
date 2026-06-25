-- ============================================================
-- TravelEliteDB - Full Schema Initialization Script
-- Run this ONCE to create all tables in TravelEliteDB
-- ============================================================

-- Users Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
CREATE TABLE Users (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  email NVARCHAR(255) NOT NULL,
  password_hash NVARCHAR(255) NOT NULL,
  password_plaintext NVARCHAR(255),
  first_name NVARCHAR(100),
  last_name NVARCHAR(100),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  otp VARCHAR(6) NULL,
  otp_expires_at DATETIME NULL,
  email_verified BIT NOT NULL DEFAULT 0,
  google_id NVARCHAR(255) NULL,
  CONSTRAINT UQ_Users_Email UNIQUE (email)
);

-- Profiles Table (1-to-1 with Users)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Profiles' AND xtype='U')
CREATE TABLE Profiles (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL,
  phone NVARCHAR(50),
  date_of_birth DATE,
  nationality NVARCHAR(100),
  passport_number NVARCHAR(100),
  address NVARCHAR(500),
  city NVARCHAR(100),
  country NVARCHAR(100),
  bio NVARCHAR(1000),
  avatar_url NVARCHAR(500),
  preferred_currency NVARCHAR(10) DEFAULT 'USD',
  preferred_language NVARCHAR(10) DEFAULT 'en',
  notifications_enabled BIT DEFAULT 1,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Profiles_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT UQ_Profiles_UserId UNIQUE (user_id)
);

-- Trips Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Trips' AND xtype='U')
CREATE TABLE Trips (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL,
  title NVARCHAR(255) NOT NULL,
  origin NVARCHAR(100) NOT NULL,
  destination NVARCHAR(100) NOT NULL,
  departure_date DATE NOT NULL,
  return_date DATE,
  passengers INT DEFAULT 1,
  trip_type NVARCHAR(50) DEFAULT 'flight',
  status NVARCHAR(50) DEFAULT 'planned',
  notes NVARCHAR(2000),
  offer_id NVARCHAR(255),
  total_amount DECIMAL(10,2),
  currency NVARCHAR(10),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Trips_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT CHK_Trips_Type CHECK (trip_type IN ('flight', 'hotel', 'bus', 'bundle')),
  CONSTRAINT CHK_Trips_Status CHECK (status IN ('planned', 'booked', 'completed', 'cancelled'))
);

-- Reservations Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Reservations' AND xtype='U')
CREATE TABLE Reservations (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  user_id UNIQUEIDENTIFIER NOT NULL,
  trip_id UNIQUEIDENTIFIER,
  reservation_type NVARCHAR(50) NOT NULL,
  provider NVARCHAR(100),
  provider_booking_ref NVARCHAR(255),
  origin NVARCHAR(100),
  destination NVARCHAR(100),
  departure_datetime DATETIME2,
  arrival_datetime DATETIME2,
  passengers INT DEFAULT 1,
  total_amount DECIMAL(10,2),
  currency NVARCHAR(10) DEFAULT 'USD',
  cabin_class NVARCHAR(50),
  status NVARCHAR(50) DEFAULT 'confirmed',
  booking_details NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),
  CONSTRAINT FK_Reservations_Users FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
  CONSTRAINT FK_Reservations_Trips FOREIGN KEY (trip_id) REFERENCES Trips(id),
  CONSTRAINT CHK_Reservations_Type CHECK (reservation_type IN ('flight', 'hotel', 'bus')),
  CONSTRAINT CHK_Reservations_Status CHECK (status IN ('confirmed', 'cancelled', 'pending'))
);

PRINT 'TravelEliteDB schema created successfully!';
