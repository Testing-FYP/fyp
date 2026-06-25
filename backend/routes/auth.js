const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db/connection');
const authMiddleware = require('../middleware/auth');
const { generateOTP, getOTPExpiry } = require('../utils/otp');
const { sendOTPEmail } = require('../utils/mailer');

const router = express.Router();

// Helper: generate JWT
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/signup
router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('first_name').trim().notEmpty().withMessage('First name is required'),
    body('last_name').trim().notEmpty().withMessage('Last name is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, first_name, last_name } = req.body;

    try {
      // Check if email already exists
      const existing = await query(
        'SELECT id FROM Users WHERE email = @email',
        { email }
      );
      if (existing.recordset.length > 0) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 12);

      const userResult = await query(
        `INSERT INTO Users (email, password_hash, password_plaintext, first_name, last_name)
         OUTPUT INSERTED.id, INSERTED.email, INSERTED.first_name, INSERTED.last_name, INSERTED.created_at
         VALUES (@email, @password_hash, @password_plaintext, @first_name, @last_name)`,
        { email, password_hash, password_plaintext: password, first_name, last_name }
      );
      const user = userResult.recordset[0];

      // Create empty profile
      await query(
        `INSERT INTO Profiles (user_id) VALUES (@user_id)`,
        { user_id: user.id }
      );

      const otp = generateOTP();
      const expiry = getOTPExpiry();

      await query(
        `UPDATE Users SET otp = @otp, otp_expires_at = @otp_expires_at
         WHERE email = @email`,
        { otp, otp_expires_at: expiry, email }
      );

      try {
        await sendOTPEmail(email, otp, first_name);
        res.status(201).json({ needsVerification: true, email });
      } catch (emailErr) {
        console.error('Signup OTP email error:', emailErr);
        res.status(201).json({ needsVerification: true, email, emailError: true });
      }
    } catch (err) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Server error during signup.' });
    }
  }
);

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { googleId, email, firstName, lastName } = req.body;

  if (!googleId || !email) {
    return res.status(400).json({ error: 'Missing Google credentials' });
  }

  try {
    let result = await query(
      'SELECT * FROM Users WHERE google_id = @googleId',
      { googleId }
    );
    let user = result.recordset[0];

    if (!user) {
      result = await query(
        'SELECT * FROM Users WHERE email = @email',
        { email }
      );
      user = result.recordset[0];

      if (user) {
        await query(
          `UPDATE Users
           SET google_id = @googleId, email_verified = 1
           WHERE email = @email`,
          { googleId, email }
        );
        result = await query(
          'SELECT * FROM Users WHERE email = @email',
          { email }
        );
        user = result.recordset[0];
      } else {
        const insertResult = await query(
          `INSERT INTO Users
             (email, first_name, last_name, google_id,
              email_verified, password_hash, password_plaintext)
           OUTPUT INSERTED.id
           VALUES
             (@email, @firstName, @lastName, @googleId,
              1, '', '')`,
          { email, firstName, lastName, googleId }
        );
        const newId = insertResult.recordset[0].id;

        await query(
          `INSERT INTO Profiles (user_id) VALUES (@user_id)`,
          { user_id: newId }
        );

        result = await query(
          'SELECT * FROM Users WHERE id = @id',
          { id: newId }
        );
        user = result.recordset[0];
      }
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google sign-in failed' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, otp, otp_expires_at, email_verified
       FROM Users WHERE email = @email`,
      { email }
    );
    const user = result.recordset[0];

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.email_verified === true) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ error: 'OTP expired' });
    }

    await query(
      `UPDATE Users SET email_verified = 1, otp = NULL, otp_expires_at = NULL
       WHERE email = @email`,
      { email }
    );

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      },
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Server error during OTP verification.' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    const result = await query(
      'SELECT id, email, first_name, email_verified FROM Users WHERE email = @email',
      { email }
    );
    const user = result.recordset[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.email_verified === true) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const otp = generateOTP();
    const expiry = getOTPExpiry();

    await query(
      `UPDATE Users SET otp = @otp, otp_expires_at = @otp_expires_at
       WHERE email = @email`,
      { otp, otp_expires_at: expiry, email }
    );

    await sendOTPEmail(email, otp, user.first_name);

    res.status(200).json({ message: 'OTP resent successfully' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Server error while resending OTP.' });
  }
});

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Valid email and password are required.' });
    }

    const { email, password } = req.body;

    try {
      const result = await query(
        'SELECT id, email, first_name, last_name, password_hash, email_verified FROM Users WHERE email = @email',
        { email }
      );

      if (result.recordset.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = result.recordset[0];
      if (!user.email_verified) {
        return res.status(403).json({
          error: 'Please verify your email before signing in.',
          needsVerification: true,
          email: user.email,
        });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = generateToken(user);
      res.json({
        message: 'Login successful!',
        token,
        user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error during login.' });
    }
  }
);

// POST /api/auth/logout (stateless — just respond OK so client can clear token)
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me — returns current user + profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
              p.phone, p.date_of_birth, p.nationality, p.passport_number,
              p.address, p.city, p.country, p.bio, p.avatar_url,
              p.preferred_currency, p.preferred_language, p.notifications_enabled
       FROM Users u
       LEFT JOIN Profiles p ON u.id = p.user_id
       WHERE u.id = @id`,
      { id: req.user.id }
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user: result.recordset[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
