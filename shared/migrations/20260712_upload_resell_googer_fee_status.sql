UPDATE wallet_transfers
SET status = 'accepted',
    updated_at = CURRENT_TIMESTAMP
WHERE type = 'resell_googer_fee'
  AND status = 'completed';
