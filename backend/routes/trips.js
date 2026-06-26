const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/trips — list user's trips (newest first)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, origin, destination, departure_date, return_date,
              passengers, trip_type, status, notes, offer_id, total_amount, currency, created_at
       FROM Trips
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ trips: result.rows });
  } catch (err) {
    console.error('Get trips error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/trips — create a new trip
router.post(
  '/',
  authMiddleware,
  [
    body('title').trim().notEmpty().withMessage('Trip title is required'),
    body('origin').trim().notEmpty().withMessage('Origin is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
    body('departure_date').isISO8601().withMessage('Valid departure date is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const {
      title, origin, destination, departure_date, return_date,
      passengers, trip_type, notes, offer_id, total_amount, currency,
    } = req.body;

    try {
      const result = await query(
        `INSERT INTO Trips
           (user_id, title, origin, destination, departure_date, return_date,
            passengers, trip_type, notes, offer_id, total_amount, currency)
         VALUES
           ($1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          req.user.id,
          title,
          origin,
          destination,
          departure_date,
          return_date || null,
          passengers || 1,
          trip_type || 'flight',
          notes || null,
          offer_id || null,
          total_amount || null,
          currency || null,
        ]
      );
      res.status(201).json({ message: 'Trip saved!', trip: result.rows[0] });
    } catch (err) {
      console.error('Create trip error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  }
);

// GET /api/trips/:id — get single trip (owner check)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM Trips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }
    res.json({ trip: result.rows[0] });
  } catch (err) {
    console.error('Get trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/trips/:id — update trip status or notes
router.patch('/:id', authMiddleware, async (req, res) => {
  const { status, notes, title } = req.body;
  const validStatuses = ['planned', 'booked', 'completed', 'cancelled'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const check = await query(
      `SELECT id FROM Trips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    await query(
      `UPDATE Trips
       SET
         status = COALESCE($1, status),
         notes = COALESCE($2, notes),
         title = COALESCE($3, title),
         updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [
        status || null,
        notes || null,
        title || null,
        req.params.id,
        req.user.id,
      ]
    );
    res.json({ message: 'Trip updated successfully!' });
  } catch (err) {
    console.error('Update trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/trips/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const check = await query(
      `SELECT id FROM Trips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found.' });
    }

    await query(
      `DELETE FROM Trips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Trip deleted.' });
  } catch (err) {
    console.error('Delete trip error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
