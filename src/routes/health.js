const express = require('express');
const router = express.Router();
const { relayerAddress, getRelayerBalance, getRelayerResources } = require('../utils/tron');
const { logger } = require('../utils/logger');

router.get('/health', async (req, res) => {
  try {
    const [balance, resources] = await Promise.all([
      getRelayerBalance(),
      getRelayerResources()
    ]);

    const minBalance = parseFloat(process.env.MIN_TRX_BALANCE_ALERT) || 100;
    const healthy = balance >= minBalance;

    res.json({
      status: healthy ? 'healthy' : 'low_balance',
      relayer: {
        address: relayerAddress,
        balance: `${balance.toFixed(2)} TRX`,
        energy: resources.energy,
        bandwidth: resources.bandwidth
      },
      network: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
      timestamp: new Date().toISOString()
    });

    if (!healthy) {
      logger.warn(`Relayer balance low: ${balance} TRX`);
    }
  } catch (e) {
    logger.error('Health check failed:', e);
    res.status(500).json({ status: 'error', message: e.message });
  }
});

module.exports = router;
