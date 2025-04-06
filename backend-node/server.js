const express = require('express');
const { SelfBackendVerifier, getUserIdentifier } = require('@selfxyz/core');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

const apiRoutes = require('./routes/apiRoutes');
// const multibaasClient = require('./multibaasClient'); // REMOVED: Not used in this service

// Temporary in-memory stores
app.locals.verificationStatus = {}; // Stores status keyed by userId (or nullifier)
app.locals.sessionIdToUserIdMap = {}; // Maps sessionId to userId after successful callback

app.use(express.json());

app.get('/ping', (req, res) => {
  res.status(200).json({ message: 'pong' });
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// --- Self Protocol Routes ---

// POST /self/initiate-verification
// Generates a sessionId and sets initial status to pending.
// Frontend (Unity) is responsible for generating the actual QR code using this sessionId.
app.post('/self/initiate-verification', (req, res) => {
  // Generate a unique session ID.
  const sessionId = require('crypto').randomUUID();

  try {
    console.log(`[Self Initiate] Initiating verification, generated session: ${sessionId}`);

    // Set initial status for this session ID to pending
    app.locals.verificationStatus[sessionId] = { status: 'pending' };
    console.log('[Self Initiate] Current verification statuses:', app.locals.verificationStatus);

    // Return only the session ID to the frontend.
    // Frontend will use this sessionId as conversation_id when generating QR request.
    res.status(200).json({ sessionId });

  } catch (error) {
    console.error('[Self Initiate] Error initiating Self verification session:', error);
    // Store error status against sessionId if something went wrong during initiation
    app.locals.verificationStatus[sessionId] = { status: 'error_initiation' };
    res.status(500).json({ error: 'Failed to initiate verification session' });
  }
});

// POST /self/callback
app.post('/self/callback', async (req, res) => {
  console.log('[Self Callback] Received request body:', JSON.stringify(req.body, null, 2)); // Log the received body
  const { proof, publicSignals } = req.body; // Extract relevant parts

  // Check for required data in real callbacks
  if (!proof || !publicSignals) {
      // Allow mock requests to proceed even without proof/signals if they match the mock pattern
      if (req.body.proof !== "mock_proof" || req.body.publicSignals !== "mock_signals") {
          console.warn('[Self Callback] Received REAL callback without proof or publicSignals');
          return res.status(400).json({ error: 'Invalid callback data: proof and publicSignals required for non-mock requests' });
      }
  }

  // Use the Polygon Amoy RPC URL for Self Protocol verification
  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL; // CORRECTED: Use Polygon Amoy RPC
  const scope = process.env.SCOPE;

  if (!rpcUrl || !scope) {
      console.error('[Self Callback] POLYGON_AMOY_RPC_URL or SCOPE not configured correctly in .env.');
      // Still return 200 to Self Protocol, but log the server error.
      return res.status(200).send('Callback received, but server configuration error prevents verification.');
  }

  let sessionId = null; // Initialize potentially extractable sessionId (cid)
  let userId = null;
  let result = null; // Initialize result variable

  try {
    // --- MOCKING FOR TESTING ---
    // Check if it's our specific mock request (check before attempting real verification)
    if (req.body.proof === "mock_proof" && req.body.publicSignals === "mock_signals") {
        const mockSessionId = req.body.sessionId; // Use sessionId from mock request body
        console.log('[Self Callback] Received MOCK callback for session:', mockSessionId);
        if (mockSessionId) {
             // Simulate extracting a mock userId (e.g., from sessionId)
             const mockUserId = `mock_user_for_${mockSessionId}`;
             app.locals.verificationStatus[mockUserId] = { status: 'verified', details: { mock: true, message: "Mock verification successful" } };
             app.locals.sessionIdToUserIdMap[mockSessionId] = mockUserId;
             console.log(`[Self Callback] MOCK Verification successful for session: ${mockSessionId}, mapped to user: ${mockUserId}`);
             console.log('[Self Callback] Final verification statuses (after mock):', app.locals.verificationStatus);
             console.log('[Self Callback] Final sessionId->userId map (after mock):', app.locals.sessionIdToUserIdMap);
             return res.status(200).send('Mock callback verification successful.');
        } else {
             console.warn('[Self Callback] Received MOCK callback without a sessionId in the body.');
             return res.status(400).send('Mock callback requires sessionId in body.');
        }
    }
    // --- END MOCKING ---

    // --- Real Verification Logic ---
    console.log('[Self Callback] Received REAL callback. Initializing SelfBackendVerifier...');
    console.log('[Self Callback] DEBUG: Attempting to initialize SelfBackendVerifier...');
    const selfBackendVerifier = new SelfBackendVerifier(rpcUrl, scope);
    console.log(`[Self Callback] DEBUG: Verifier initialized successfully with RPC: ${rpcUrl}, Scope: ${scope}`);

    console.log('[Self Callback] DEBUG: Attempting to call selfBackendVerifier.verify...');
    result = await selfBackendVerifier.verify(proof, publicSignals);
    console.log('[Self Callback] DEBUG: selfBackendVerifier.verify call completed.');
    console.log('[Self Callback] Verification result:', JSON.stringify(result, null, 2));
    // --- Real Verification Logic continues below ---

    // Extract sessionId (cid) and userId (sub/nullifier)
    sessionId = result?.cid; // Assuming cid is the conversation_id/sessionId
    try {
        // Prefer getUserIdentifier to get the DID
        userId = await getUserIdentifier(publicSignals);
        console.log(`[Self Callback] Extracted userId (sub) from publicSignals: ${userId}`);
    } catch (uidError) {
        console.warn('[Self Callback] Could not extract userId (sub) from publicSignals, will attempt to use nullifier:', uidError.message);
        // Fallback to nullifier if getUserIdentifier fails or returns nothing
        userId = result?.nullifier;
        if(userId) console.log(`[Self Callback] Using nullifier as userId: ${userId}`);
    }

    // Add check for nullifier if userId is still null after attempting both
    if (!userId && result?.nullifier) {
        userId = result.nullifier;
        console.log(`[Self Callback] Using nullifier as userId after failed sub extraction: ${userId}`);
    }


    if (!sessionId) {
        console.warn('[Self Callback] Could not determine session ID (cid) from verification result. Status check by sessionId might fail.');
        // If the sessionId wasn't in the result, try to get it from the original request if provided (less reliable)
        sessionId = req.body.sessionId || sessionId;
    }
    if (!userId) {
        // If no user identifier could be determined, we cannot store the status reliably.
        console.error('[Self Callback] CRITICAL: Could not determine a unique user identifier (userId/nullifier). Verification status cannot be stored.');
        // Still return 200 to Self Protocol as the callback was received, but indicate processing issue.
        return res.status(200).send('Callback processed, but could not identify user. Verification status not saved.');
    }

     console.log(`[Self Callback] Final identifiers - SessionId (cid): ${sessionId}, UserId (sub/nullifier): ${userId}`);


    // --- Status Update Logic ---
    if (result.isValid) {
      // Store verified status under userId key
      app.locals.verificationStatus[userId] = { status: 'verified', details: result.credentialSubject || {} };
      // Store the sessionId -> userId mapping IF sessionId is available
      if (sessionId) {
          app.locals.sessionIdToUserIdMap[sessionId] = userId;
          console.log(`[Self Callback] Stored mapping: Session ${sessionId} -> User ${userId}`);
      } else {
          console.warn(`[Self Callback] Verification successful for user ${userId}, but sessionId was not available/extracted. Mapping not stored.`);
      }
      console.log(`[Self Callback] Verification successful for user: ${userId}`);
      // Return 200 OK to Self Protocol upon successful processing.
      res.status(200).send('Callback verification successful.');
    } else {
      const failureReason = result.isValidDetails || 'No specific reason provided by verifier.';
      console.warn(`[Self Callback] Verification failed for user ${userId}:`, failureReason);
      // Store failed status under userId key
      app.locals.verificationStatus[userId] = { status: 'failed', details: { reason: failureReason } };
      // Store mapping even on failure, so status/:sessionId can report the failure if polled
      if (sessionId) {
          app.locals.sessionIdToUserIdMap[sessionId] = userId;
          console.log(`[Self Callback] Stored mapping (failure): Session ${sessionId} -> User ${userId}`);
      } else {
          console.warn(`[Self Callback] Verification failed for user ${userId}, but sessionId was not available/extracted. Mapping not stored.`);
      }
      // Return 200 OK to Self Protocol even on verification failure, indicating the callback was processed.
      res.status(200).send('Callback received, verification failed.');
    }

  } catch (error) {
    console.error('[Self Callback] !!!!!!!!!! ERROR during Self callback verification process !!!!!!!!!!');
    console.error('[Self Callback] Error Object:', error); // Log the full error object
    console.error('[Self Callback] Error Stack:', error.stack); // Log the stack trace
    // Attempt to store error status if identifiers are available
    userId = userId || result?.nullifier || (await getUserIdentifier(publicSignals).catch(() => null)); // Best effort userId
    sessionId = sessionId || result?.cid || req.body.sessionId; // Best effort sessionId

    if (userId) { // Store error status against userId if possible
        app.locals.verificationStatus[userId] = { status: 'error_verification', details: { message: error.message } };
        console.error(`[Self Callback] Stored verification error status for user: ${userId}`);
        // Store mapping on error too if possible
        if (sessionId) {
            app.locals.sessionIdToUserIdMap[sessionId] = userId;
             console.log(`[Self Callback] Stored mapping (error): Session ${sessionId} -> User ${userId}`);
        }
    } else {
        console.error('[Self Callback] Verification process failed, and no userId could be determined. Cannot store error status reliably.');
    }
    // Return 500 Internal Server Error to the caller (Self Protocol might retry or log)
    // Although Self protocol docs often suggest returning 200 even on error,
    // returning 500 here indicates a server-side processing failure beyond simple verification fail.
    res.status(500).send('Internal server error processing callback.');
  } finally {
      console.log('[Self Callback] DEBUG: Entering finally block.');
      // Log final state regardless of outcome
      console.log('[Self Callback] Final verification statuses map:', JSON.stringify(app.locals.verificationStatus, null, 2)); // Stringify for better readability
      console.log('[Self Callback] Final sessionId->userId map:', JSON.stringify(app.locals.sessionIdToUserIdMap, null, 2)); // Stringify
      console.log('[Self Callback] DEBUG: Exiting finally block.');
  }
});

// GET /self/status/:sessionId
app.get('/self/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  let statusData = { status: 'not_found', details: {} }; // Default

  console.log(`[Self Status] Checking status for Session ID: ${sessionId}`);

  // 1. Look up userId using the sessionId -> userId map
  const userId = app.locals.sessionIdToUserIdMap[sessionId];

  if (userId) {
    console.log(`[Self Status] Found mapping: Session ${sessionId} -> User ${userId}`);
    // 2. Look up status using the found userId
    statusData = app.locals.verificationStatus[userId] || { status: 'processing_error_user_not_found_post_map', details: {} }; // Should not happen if map is correct
  } else {
    console.log(`[Self Status] No mapping found for Session ID: ${sessionId}. Checking direct status (initiation/error)...`);
    // 3. Fallback: Check if status was stored directly under sessionId (e.g., 'pending' or 'error_initiation')
    statusData = app.locals.verificationStatus[sessionId] || { status: 'not_found', details: {} };
    // If still not found, it truly is 'not_found' or pending without callback yet
    if (statusData.status === 'not_found') {
        console.log(`[Self Status] No direct status found for Session ID: ${sessionId}. Reporting 'not_found'.`);
    }
  }

  console.log(`[Self Status] Reporting status for Session ${sessionId}:`, statusData);
  res.status(200).json({ sessionId, status: statusData.status, details: statusData.details });
});

// --- Main API Routes ---
app.use('/api', apiRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Removed MultiBaas connection test as it's handled in a separate service.
});
