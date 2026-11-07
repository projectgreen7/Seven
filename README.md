# TRON Smart Relayer Backend



## Deploy to Railway

1. Fork/push this repo
2. Create project on [Railway](https://railway.app)
3. Add environment variables (see `.env.example`)
4. Deploy

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RELAYER_PRIVATE_KEY` | Yes | Relayer wallet private key (must hold TRX) |
| `TRON_FULL_NODE` | No | Default: `https://api.trongrid.io` |
| `API_KEY` | Yes | Secret key for frontend authentication |
| `REDIS_URL` | No | Redis for rate limiting (falls back to memory) |
| `MAX_DAILY_RELAYS_PER_ADDRESS` | No | Default: 10 |

## API Endpoints

### `POST /api/relayer/approve`
Relays a signed USDT approval transaction.

```json
{
  "owner": "TNHhgV...VAW7",
  "spender": "T...",
  "contract": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "signedTransaction": { /* signed tx object */ },
  "timestamp": 1704067200000
}
```

Response:
```json
{
  "success": true,
  "txid": "56acdcb9...",
  "relayerFee": "~6.5 TRX",
  "path": "relayer"
}
```

### `GET /health`
Health check + relayer wallet status.

### `GET /api/relayer/stats`
Relay statistics (protected by API key).

## Funding the Relayer

Send TRX to the relayer address. Each approval burns ~6.5–13 TRX.
Monitor `/health` for balance alerts.
