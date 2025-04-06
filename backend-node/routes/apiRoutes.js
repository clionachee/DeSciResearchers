const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises'); // For async file operations
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
console.log(process.env);
// const multibaasClient = require('../multibaasClient'); // REMOVED THIS LINE
// const { mintNFT } = multibaasClient; // REMOVED THIS LINE
// We will use dynamic import inside an async function for ipfs-http-client
// const { create } = require('ipfs-http-client'); // Remove this line

// const { verificationStatus } = require('../server'); // No longer require server directly

// --- IPFS Client Setup (Async) ---
let ipfsClient = null; // Initialize as null

async function setupIpfsClient() {
    try {
        const ipfsApiUrl = process.env.IPFS_API_URL;
        if (!ipfsApiUrl) {
            console.warn('[IPFS Setup] IPFS_API_URL not found in .env. IPFS upload will fail.');
            return; // Exit setup if URL is missing
        }
        // Use dynamic import() for ES Module
        const { create } = await import('ipfs-http-client');
        ipfsClient = create({ url: ipfsApiUrl });
        console.log(`[IPFS Setup] IPFS client configured for URL: ${ipfsApiUrl}`);
    } catch (error) {
        console.error('[IPFS Setup] Failed to create IPFS client:', error);
        // Keep ipfsClient as null
    }
}
// We'll call setupIpfsClient later, perhaps before the server starts or on first use
// For simplicity during init, let's call it here, but be aware it's async
setupIpfsClient();
// ------------------------

const router = express.Router();
const tmpDir = path.join(__dirname, '../tmp'); // Define tmp directory path relative to this file's location

// Ensure tmp directory exists
const ensureTmpDir = async () => {
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    console.log(`[API Routes] Ensured tmp directory exists at: ${tmpDir}`);
  } catch (error) {
    console.error('[API Routes] Error creating tmp directory:', error);
    // Handle error appropriately, maybe prevent startup?
  }
};
ensureTmpDir(); // Call on module load

// POST /api/mint-neuroart - RENAME this endpoint
router.post('/prepare-nft-data', async (req, res) => { // Renamed endpoint
  // userAddress is NO LONGER needed directly here, but keep recipientAddress variable for clarity
  // It will be passed to the new execute-mint endpoint later
  const { userAddress, artParams, backgroundChoice, sessionId } = req.body;
  const verificationStatusMap = req.app.locals.verificationStatus; // Access verification status store
  const sessionIdMap = req.app.locals.sessionIdToUserIdMap; // Access sessionId -> userId map

  // Basic validation (artParams might represent Curvegrid AI data now)
  if (!artParams || !backgroundChoice || !sessionId) {
    return res.status(400).json({ error: 'Missing required fields: artParams, backgroundChoice, sessionId' });
  }

 // 1. Check verification status (with mock override for testing)
 // ... (Existing verification logic remains the same, assuming userDID is correctly assigned now) ...
 // It should set 'isVerified' and 'userDID' correctly if verification passes
  let isVerified = false;
  const MOCK_TEST_SESSION_ID = "test-session-123";
  let userDID = null;
  let status = 'not_found';

  if (sessionId === MOCK_TEST_SESSION_ID) {
      console.log(`[API Prepare] Using MOCK verification override for session: ${sessionId}`);
      isVerified = true;
      userDID = "mock:did:placeholder";
      status = 'verified';
  } else {
       const userId = sessionIdMap[sessionId];
       if (userId) {
         const userStatus = verificationStatusMap[userId];
         if (userStatus) {
             status = userStatus.status;
             console.log(`[API Prepare] Found status for userId ${userId} (mapped from session ${sessionId}): ${status}`);
             if (status === 'verified') {
                 userDID = userId; // ASSUMING MANUAL FIX IS DONE
                 isVerified = true;
                 console.log(`[API Prepare] Assigning userDID from verified userId: ${userDID}`);
             }
         } else {
             console.log(`[API Prepare] Mapping found for session ${sessionId} to userId ${userId}, but no status entry for userId.`);
             status = 'error_missing_user_status';
         }
       } else {
          const sessionStatus = verificationStatusMap[sessionId];
          if (sessionStatus) {
              status = sessionStatus.status;
          }
          console.log(`[API Prepare] No userId mapping found for session ${sessionId}. Current status (under sessionId): ${status}`);
       }

       if (status !== 'verified') {
         console.log(`[API Prepare] Verification check failed for session ${sessionId}. Status: ${status}`);
         return res.status(403).json({ error: 'User identity not verified or verification failed for this session.', status: status });
       }
  }

  if (!isVerified) {
      console.log(`[API Prepare] Verification check ultimately failed for session ${sessionId}. Final Status: ${status}`);
      return res.status(403).json({ error: 'User identity not verified for this session.', status: status });
  }

  if (!userDID) {
       console.error(`[API Prepare] Critical: User is considered verified for session ${sessionId} but userDID is missing.`);
       return res.status(500).json({ error: 'Internal server error: Verified user DID not found.'});
  }
   console.log(`[API Prepare] Verification successful for session ${sessionId}, User DID: ${userDID}. Proceeding to prepare metadata.`);

  // REMOVED: AI Simulation Call
  // No longer calling the Python script here

  // --- Metadata Preparation & Upload ---
  let tokenURI;
  try {
    console.log('[API Prepare] Preparing metadata JSON...');
    // Use artParams directly (assuming it's the data from Curvegrid AI)
    const curvegridAIData = artParams; // Rename for clarity

    const metadata = {
      name: `NeuroArt #${Date.now()}`,
      description: "AI-generated art on the NeuroArt Nexus platform, linked to a verified user identity.",
      image: "ipfs://bafybeibhdemvxnm7o3mt6jcamsfsmwmfzkid7cyxlm6fellgtl7zoingxy", // Specific placeholder CID
      attributes: [
        { trait_type: "Background", value: backgroundChoice },
        // Integrate Curvegrid AI data into attributes (Example Structure - Adjust as needed)
        ...(curvegridAIData ? Object.entries(curvegridAIData).map(([key, value]) => ({
          trait_type: `AI ${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          value: typeof value === 'object' ? JSON.stringify(value) : value // Handle nested objects if any
        })) : []),
         { trait_type: "Verified User DID", value: userDID },
        // Add other relevant traits if needed
      ]
    };
    console.log('[API Prepare] Metadata prepared:', metadata);

    // Use the MOCK upload function for now
    tokenURI = await uploadMetadataMock(metadata);
    console.log(`[API Prepare] Mock metadata uploaded. Token URI: ${tokenURI}`);

    // Respond with the tokenURI (and recipient address for convenience)
    res.status(200).json({ tokenURI: tokenURI, recipientAddress: userAddress }); // Send URI back to Unity

  } catch (error) {
    console.error('[API Prepare] Error preparing or uploading metadata:', error);
    res.status(500).json({ error: 'Failed to prepare or upload NFT metadata.', details: error.message });
  }
});

// NEW Endpoint: POST /api/execute-mint
router.post('/execute-mint', async (req, res) => {
    console.log("Received request for /api/execute-mint");
    const { recipientAddress, tokenURI } = req.body;

    if (!recipientAddress || !tokenURI) {
        console.log("Missing recipientAddress or tokenURI");
        return res.status(400).json({ success: false, message: 'Recipient address and token URI are required.' });
    }

    console.log(`Attempting to mint NFT for ${recipientAddress} with URI ${tokenURI}`);

    try {
        // TEMPORARY RESPONSE SINCE MULTIBAAS IS REMOVED FROM THIS SERVICE
        console.warn("[/api/execute-mint] Endpoint logic is disabled as MultiBaas client was removed.");
        res.status(501).json({ success: false, message: 'Minting endpoint currently disabled in this service.' });

    } catch (error) {
        console.error('Error during disabled /api/execute-mint:', error.message); // Log generic error
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to execute minting (endpoint disabled).', 
            error: error.message // Return generic error message
        });
    }
});

// --- Helper function for calling Python AI script --- (Keep for now, but unused by prepare endpoint)
async function callAiSimulator(params) {
  const scriptPath = path.join(__dirname, '../../ai_simulator.py');
  // Pass params as JSON string via command line argument
  // Ensure params does not contain characters problematic for shell (like single quotes within string)
  // A safer way might be base64 encoding/decoding if params are complex
  const paramsString = JSON.stringify(params);

  console.log(`[AI Sim Caller] Running: python "${scriptPath}"`);

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath], { shell: process.platform === 'win32' });
    let output = '';
    let errorOutput = '';

    // Send paramsString to python script's stdin
    pythonProcess.stdin.write(paramsString);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[AI Sim stdout]: ${data.toString()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(`[AI Sim stderr]: ${data.toString()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[AI Sim Caller] Python script exited with code ${code}`);
      if (code !== 0) {
        reject(new Error(`AI simulator script exited with code ${code}. Error: ${errorOutput}`));
      } else {
        // Find JSON in potentially mixed output
        const jsonMatch = output.match(/\{.*\}/s);
        if (jsonMatch) {
             try {
                JSON.parse(jsonMatch[0]);
                resolve(jsonMatch[0]);
            } catch (parseError) {
                 console.error("[AI Sim Caller] Output wasn't valid JSON.", parseError);
                 reject(new Error(`AI simulator script output could not be parsed as JSON. Output: ${output}`));
            }
        } else {
            console.error("[AI Sim Caller] No JSON object found in script output.");
            reject(new Error(`AI simulator script did not produce valid JSON output. Output: ${output}`));
        }
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[AI Sim Caller] Failed to start Python process:', err);
      reject(new Error(`Failed to start AI simulator script: ${err.message}`));
    });
  });
}

// --- Helper function for mocking metadata upload --- (Keep for now)
async function uploadMetadataMock(metadata) {
  const timestamp = Date.now();
  const filename = `metadata-${timestamp}.json`;
  const filePath = path.join(tmpDir, filename);

  try {
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
    console.log(`[Metadata Mock] Metadata successfully written to ${filePath}`);
    // Return a simple placeholder URI for mock
    return `mock://metadata/${filename}`;

  } catch (error) {
    console.error(`[Metadata Mock] Error writing metadata file to ${filePath}:`, error);
    throw new Error(`Failed to mock metadata upload: ${error.message}`);
  }
}

module.exports = router;