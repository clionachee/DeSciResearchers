const express = require('express');
const router = express.Router();
const { handleEventWebhook } = require('../controllers/webhookController');

// Define the route for receiving MultiBaas event webhooks
// Assuming MultiBaas sends POST requests to /webhook/events
router.post('/events', handleEventWebhook);

module.exports = router; 