# Current Tasks: NeuroArt Nexus MVP (Polygon + Self Protocol - Direct Mint)

## Phase 1: Foundations (Day 1)
- [ ] Setup: Polygon Dev Env (Hardhat)
- [x] Setup: Node.js Backend Env (Express) for Self Protocol (`backend-node`)
- [ ] Setup: Self Protocol Dev Account/SDK
- [ ] Setup: Unity Dev Env (Partner)
- [x] Develop: ERC-721 NeuroArt Contract (Solidity) - Initial Version
- [x] Deploy: ERC-721 Contract (No Owner) to Polygon Testnet (Amoy) at 0x2F81fFcD282CED88E29a2924885125282d22844d
- [x] Develop: Basic Shared Backend Service (`backend-node`) - Initial Setup
- [ ] Implement: Backend (`backend-node`) Self Protocol Endpoints (Task 4a - Verification Logic Needs Debugging - **CURRENT BLOCKER**)
- [ ] Confirm: Self Protocol Request Generation SDK/API Usage (Task 4b)
- [x] Implement: Backend (`backend-node`) Prepare NFT Data Endpoint (`/api/prepare-nft-data`) - Receives data, checks Self status, calls AI service.
- [ ] Develop/Simulate: Python AI Component (EEG/EMG -> JSON)
- [x] Develop/Simulate: Python AI Component (Task 7 - Reads from stdin)

## Phase 2: AI/Data Service & Integration (Day 2)
- [ ] **Develop: Create Separate AI/Data Processing Service**
  - [ ] Initialize Node.js/Python project (Choose tech stack)
  - [ ] Define API endpoint(s) for Unity to send raw data
  - [ ] Implement AI analysis/processing logic (or integrate Python component)
  - [ ] Define API endpoint(s) to return processed data/metadata parts to Unity
  - [ ] Configure environment variables (.env) if needed
- [x] Define: API/Method for Unity to send data to AI service & receive results - Documented
- [ ] Implement: (Partner) Unity Self Verification Flow (Call /initiate, Show QR, Poll /status)
- [x] Implement: Backend (`backend-node`) Self Protocol Verification Logic (Task 4a - Based on SDK)
- [ ] Implement: Backend (`backend-node`) Real IPFS Upload (Task 6c - TODO) - **Location Decision:** Should IPFS upload happen in `backend-node` after getting AI results, or in the new AI service?
- [x] Implement: Backend (`backend-node`) AI Simulator Invocation (Task 7) - **Refactor:** This should now call the new AI/Data service API endpoint.
- [ ] Implement: (Partner) Unity Core Flow (Self Verify -> Get AI Data -> Send to AI Service -> Receive Results -> Prepare Metadata -> **Directly Call Contract safeMint**)

## Phase 3: Testing, Polish & Docs (Day 3)
- [ ] Test: Full End-to-End Flow (Self Verify -> AI Service -> Prepare Metadata -> **Frontend Mint**)
- [ ] Test: Metadata Content (BW Choice, AI Params/Results)
- [ ] Debug & Fix Issues
- [ ] Verify: Polygon Award Compliance
- [ ] Verify: Self Protocol Award Compliance (Based on requirements) - BLOCKED by `/self/callback` error
- [ ] Refine: Unity UI/UX (Partner)
- [ ] Create: GitHub Repo & README
- [ ] Prepare: Demo Video/Slides
