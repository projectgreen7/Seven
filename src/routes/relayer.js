const express = require('express');
const router = express.Router();
// Import the core 'ethers' dependency directly for standard signature recovery
const ethers = require('ethers');
const { TronWeb, utils } = require('tronweb');
const { tronWeb: relayerTronWeb, getRelayerBalance, getRelayerResources } = require('../utils/tron');
const { logger } = require('../utils/logger');

// ─── SAFE MIDDLEWARE RESOLVER ─────────────────────────────────────────
let auth = require('../middleware/auth');

if (!auth || typeof auth !== 'function') {
  if (auth && typeof auth === 'object') {
    if (typeof auth.verifyApiKey === 'function') {
      auth = auth.verifyApiKey;
    } else if (typeof auth.auth === 'function') {
      auth = auth.auth;
    } else {
      const foundFunction = Object.values(auth).find(val => typeof val === 'function');
      if (foundFunction) {
        auth = foundFunction;
      }
    }
  }

  if (typeof auth !== 'function') {
    logger.warn('Could not find API key verification function in src/middleware/auth.js. Using local fallback.');
    auth = (req, res, next) => {
      const apiKey = req.headers['x-api-key'] || req.headers['api-key'];
      if (apiKey && apiKey === process.env.API_KEY) {
        return next();
      }
      res.status(401).json({ success: false, message: 'Unauthorized' });
    };
  }
}

// ─── ULTRA-ROBUST SIGNATURE RECOVERY (Direct Ethers Import) ───────────
function recoverTronAddress(txId, signature) {
  // Ensure both inputs have standard hex prefixes if required by ethers
  const hash = txId.startsWith('0x') ? txId : '0x' + txId;
  const sig = signature.startsWith('0x') ? signature : '0x' + signature;

  let recoveredEthAddress;

  try {
    // Path 1: Check for Ethers v6 signature recovery standard
    if (typeof ethers.recoverAddress === 'function') {
      recoveredEthAddress = ethers.recoverAddress(hash, sig);
    } 
    // Path 2: Fallback to Ethers v5 signature recovery standard
    else if (ethers.utils && typeof ethers.utils.recoverAddress === 'function') {
      recoveredEthAddress = ethers.utils.recoverAddress(hash, sig);
    }
  } catch (error) {
    logger.error(`Ethers signature recovery operation failed: ${error.message}`);
    throw new Error(`Ethers failed to recover signature: ${error.message}`);
  }

  // Convert recovered Ethereum format address (0x...) to TRON Base58 format (T...)
  if (recoveredEthAddress && recoveredEthAddress.startsWith('0x')) {
    const tronHex = '41' + recoveredEthAddress.slice(2);
    return relayerTronWeb.address.fromHex(tronHex);
  }

  throw new Error('Ethers signature recovery did not return a valid hex address');
}

// POST /api/relayer/approve
router.post('/approve', async (req, res) => {
  try {
    const { owner, spender, signedTransaction, timestamp } = req.body;

    // 1. Validate Transaction Payload Structure
    if (!signedTransaction || !signedTransaction.signature || signedTransaction.signature.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing transaction signature' });
    }

    // 2. Safe Signature Verification
    let recoveredAddress;
    try {
      const txId = signedTransaction.txID || signedTransaction.txId;
      const signature = signedTransaction.signature[0];

      if (!txId || !signature) {
        return res.status(400).json({ success: false, message: 'Invalid transaction payload format' });
      }

      // Execute direct Ethers signature recovery
      recoveredAddress = recoverTronAddress(txId, signature);
      logger.info(`Recovered address from signature: ${recoveredAddress}`);
    } catch (sigError) {
      logger.error(`Signature verification failed: ${sigError.message}`);
      return res.status(400).json({ 
        success: false, 
        message: `Signature verification failed: ${sigError.message}` 
      });
    }

    if (recoveredAddress !== owner) {
      logger.warn(`Signature mismatch. Recovered: ${recoveredAddress}, Expected: ${owner}`);
      return res.status(403).json({ success: false, message: 'Invalid signature owner' });
    }

    // 3. Anti-Replay Check (expires after 5 minutes)
    if (Date.now() - timestamp > 300000) {
      return res.status(400).json({ success: false, message: 'Transaction expired' });
    }

    // 4. Broadcast transaction via the relayer
    const result = await relayerTronWeb.trx.sendRawTransaction(signedTransaction);

    if (result.result) {
      logger.info(`Relayed transaction successfully: ${result.txid || signedTransaction.txID}`);
      res.json({
        success: true,
        txid: result.txid || signedTransaction.txID,
        relayerFee: '~6.5 TRX'
      });
    } else {
      const errMsg = result.message 
        ? (typeof result.message === 'string' ? result.message : utils.bytes.bytesToString(result.message))
        : 'Unknown node broadcast rejection';
      logger.error(`Broadcast failed: ${errMsg}`);
      res.status(500).json({ success: false, message: `Broadcast failed: ${errMsg}` });
    }
  } catch (err) {
    logger.error('Error in relayer route:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/relayer/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const balance = await getRelayerBalance();
    const resources = await getRelayerResources();
    res.json({
      success: true,
      balance: `${balance} TRX`,
      energy: resources.energy,
      bandwidth: resources.bandwidth
    });
  } catch (err) {
    logger.error('Error fetching relayer stats:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve stats' });
  }
});

module.exports = router;
