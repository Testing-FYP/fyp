const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { query } = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Multer setup for avatar uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads/avatars';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    if (ok) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  },
});

// GET /api/profile — get current user's profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at,
              p.phone, p.date_of_birth, p.nationality, p.passport_number,
              p.address, p.city, p.country, p.bio, p.avatar_url,
              p.preferred_currency, p.preferred_language, p.notifications_enabled
       FROM Users u
       LEFT JOIN Profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found.' });
    }
    res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/profile — update profile fields
router.put('/', authMiddleware, async (req, res) => {
  const {
    first_name,
    last_name,
    phone,
    date_of_birth,
    nationality,
    passport_number,
    address,
    city,
    country,
    bio,
    preferred_currency,
    preferred_language,
    notifications_enabled,
  } = req.body;

  try {
    // Update Users table if names changed
    if ((first_name && first_name.trim()) || (last_name && last_name.trim())) {
      await query(
        `UPDATE Users SET 
           first_name = COALESCE($1, first_name), 
           last_name = COALESCE($2, last_name), 
           updated_at = NOW() 
         WHERE id = $3`,
        [ 
          first_name ? first_name.trim() : null, 
          last_name ? last_name.trim() : null, 
          req.user.id 
        ]
      );
    }

    // Upsert Profile (update existing row)
    await query(
      `UPDATE Profiles
       SET
         phone = COALESCE($1, phone),
         date_of_birth = COALESCE($2, date_of_birth),
         nationality = COALESCE($3, nationality),
         passport_number = COALESCE($4, passport_number),
         address = COALESCE($5, address),
         city = COALESCE($6, city),
         country = COALESCE($7, country),
         bio = COALESCE($8, bio),
         preferred_currency = COALESCE($9, preferred_currency),
         preferred_language = COALESCE($10, preferred_language),
         notifications_enabled = COALESCE($11, notifications_enabled),
         updated_at = NOW()
       WHERE user_id = $12`,
      [
        phone || null,
        date_of_birth || null,
        nationality || null,
        passport_number || null,
        address || null,
        city || null,
        country || null,
        bio || null,
        preferred_currency || null,
        preferred_language || null,
        notifications_enabled !== undefined ? Boolean(notifications_enabled) : null,
        req.user.id,
      ]
    );

    res.json({ message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/profile/avatar — upload profile avatar
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const avatar_url = `/uploads/avatars/${req.file.filename}`;

  try {
    await query(
      `UPDATE Profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [avatar_url, req.user.id]
    );
    res.json({ message: 'Avatar uploaded!', avatar_url });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
