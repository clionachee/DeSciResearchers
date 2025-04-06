// Controller for handling incoming webhooks from MultiBaas

const MAX_EVENTS_STORED = 50; // Make sure this matches the value in server.js or read from config

/**
 * Handles incoming event webhooks from MultiBaas.
 * Parses relevant event data and stores it in app.locals.recentEvents.
 * Responds quickly with 200 OK.
 */
const handleEventWebhook = async (req, res) => {
  console.log('[Webhook Controller] Received event webhook payload.');
  // console.log(JSON.stringify(req.body, null, 2)); // Log full payload if needed for debugging

  const receivedEvents = req.body; // Assuming body is an array of events

  if (!Array.isArray(receivedEvents)) {
    console.warn('[Webhook Controller] Received non-array payload.');
    return res.status(400).json({ status: 'error', message: 'Expected an array of events.' });
  }

  const recentEvents = req.app.locals.recentEvents;

  receivedEvents.forEach(webhookItem => {
    if (webhookItem.event === 'event.emitted' && webhookItem.data && webhookItem.data.event) {
      const eventData = webhookItem.data.event;
      const txData = webhookItem.data.transaction;

      // Extract key information (adjust based on the events you monitor)
      const processedEvent = {
        webhookId: webhookItem.id,
        eventName: eventData.name,
        eventSignature: eventData.signature,
        contractLabel: eventData.contract.label,
        contractAddress: eventData.contract.address,
        blockNumber: txData.blockNumber,
        transactionHash: txData.txHash,
        timestamp: webhookItem.data.triggeredAt, // Use the webhook trigger time
        // Parse event inputs (example for Transfer(address,address,uint256))
        params: eventData.inputs.reduce((acc, input) => {
          acc[input.name] = input.value;
          return acc;
        }, {})
      };

      console.log(`[Webhook Controller] Processing event: ${processedEvent.eventName} from tx ${processedEvent.transactionHash}`);

      // Add to the beginning of the array (most recent first)
      recentEvents.unshift(processedEvent);

      // Keep the array size limited
      if (recentEvents.length > MAX_EVENTS_STORED) {
        recentEvents.pop(); // Remove the oldest event
      }
    } else {
      console.warn('[Webhook Controller] Received webhook item with unexpected structure:', webhookItem);
    }
  });

  // Update the shared array in app.locals
  req.app.locals.recentEvents = recentEvents;
  // console.log(`[Webhook Controller] Stored events count: ${recentEvents.length}`);

  // Respond immediately to MultiBaas to acknowledge receipt
  res.status(200).json({ status: 'webhook received and processed' });
};

module.exports = {
  handleEventWebhook,
}; 