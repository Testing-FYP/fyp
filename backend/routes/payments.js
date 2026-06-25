const express = require('express');
const Stripe = require('stripe');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/payments/create-intent
router.post('/create-intent', authMiddleware, async (req, res) => {
  const { amount, currency = 'usd' } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: { userId: req.user.id },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe create-intent error:', err);
    res.status(500).json({ error: 'Failed to create payment intent.' });
  }
});

module.exports = router;
