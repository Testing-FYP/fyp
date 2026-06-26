const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db/connection');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/reservations — list user's reservations
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, t.title as trip_title
       FROM Reservations r
       LEFT JOIN Trips t ON r.trip_id = t.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json({ reservations: result.rows });
  } catch (err) {
    console.error('Get reservations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/reservations — create a reservation
router.post(
  '/',
  authMiddleware,
  [
    body('reservation_type')
      .isIn(['flight', 'hotel', 'bus'])
      .withMessage('Type must be flight, hotel, or bus'),
    body('origin').trim().notEmpty().withMessage('Origin is required'),
    body('destination').trim().notEmpty().withMessage('Destination is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const {
      trip_id,
      reservation_type,
      provider,
      provider_booking_ref,
      origin,
      destination,
      departure_datetime,
      arrival_datetime,
      passengers,
      total_amount,
      currency,
      cabin_class,
      payment_intent_id,
      booking_details,
    } = req.body;

    try {
      const result = await query(
        `INSERT INTO Reservations
           (user_id, trip_id, reservation_type, provider, provider_booking_ref,
            origin, destination, departure_datetime, arrival_datetime,
            passengers, total_amount, currency, cabin_class, payment_intent_id, booking_details)
         VALUES
           ($1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          req.user.id,
          trip_id || null,
          reservation_type,
          provider || null,
          provider_booking_ref || null,
          origin,
          destination,
          departure_datetime || null,
          arrival_datetime || null,
          passengers || 1,
          total_amount || null,
          currency || 'USD',
          cabin_class || null,
          payment_intent_id || null,
          booking_details ? JSON.stringify(booking_details) : null,
        ]
      );
      res.status(201).json({ message: 'Reservation created!', reservation: result.rows[0] });
    } catch (err) {
      console.error('Create reservation error:', err);
      res.status(500).json({ error: 'Server error.' });
    }
  }
);

// GET /api/reservations/:id — get single reservation
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, t.title as trip_title
       FROM Reservations r
       LEFT JOIN Trips t ON r.trip_id = t.id
       WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }
    res.json({ reservation: result.rows[0] });
  } catch (err) {
    console.error('Get reservation error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/reservations/:id/cancel — cancel reservation
router.put('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const check = await query(
      `SELECT id, status FROM Reservations WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found.' });
    }
    if (check.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Reservation is already cancelled.' });
    }

    await query(
      `UPDATE Reservations SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'Reservation cancelled successfully.' });
  } catch (err) {
    console.error('Cancel reservation error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
