// DIRECT TRANSFER LOGIC - Add this to walletController.js

// Replace the initiateTransferRequest function with this version:

exports.initiateTransferRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        const { receiverId, amount, note, commissionPercentage, type = 'request' } = req.body;
        const senderId = req.user.id;

        if (!receiverId || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid receiver or amount' });
        }

        await client.query('BEGIN');

        const baseAmount = parseFloat(amount);
        const commPercent = parseFloat(commissionPercentage || 0);
        let calculatedCommission = 0;

        if (commPercent > 0) {
            calculatedCommission = (baseAmount * commPercent) / 100;
        }

        // ============================================
        // NEW: DIRECT TRANSFER IF NO COMMISSION
        // ============================================
        if (type === 'sell' && commPercent === 0) {
            // Check sender's balance
            const senderResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1',
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0].wallet_balance);

            if (senderBalance < baseAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }

            // Deduct from sender
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
                [baseAmount, senderId]
            );

            // Add to receiver
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                [baseAmount, receiverId]
            );

            // Record as completed transaction
            const txNote = note || 'Direct Money Transfer';
            const result = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission_percentage, commission)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)
                 RETURNING *`,
                [senderId, receiverId, baseAmount, txNote, type, 0, 0]
            );

            await client.query('COMMIT');

            return res.status(201).json({
                success: true,
                message: `Transfer successful! ${baseAmount} coins sent directly.`,
                transfer: result.rows[0],
                direct: true
            });
        }

        // ============================================
        // ORIGINAL: PENDING REQUEST IF WITH COMMISSION
        // ============================================
        let amountToHold = 0;

        if (type === 'sell') {
            amountToHold = baseAmount;

            const senderResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1',
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0].wallet_balance);

            if (senderBalance < amountToHold) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }

            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = hold_balance + $1 WHERE id = $2',
                [amountToHold, senderId]
            );
        } else {
            amountToHold = baseAmount;
        }

        const txNote = note || (commPercent > 0 ? `Commission Transfer (${commPercent}%)` : 'Money Transfer');

        const result = await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission_percentage, commission)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
             RETURNING *`,
            [senderId, receiverId, amountToHold, txNote, type, commPercent, calculatedCommission]
        );

        await client.query('COMMIT');

        const successMessage = type === 'sell'
            ? `Money transfer initiated. ${amountToHold} coins on hold until receiver accepts.`
            : 'Money request sent successfully.';

        res.status(201).json({
            success: true,
            message: successMessage,
            transfer: result.rows[0],
            direct: false
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Initiate transfer error:', error);
        res.status(500).json({ success: false, message: 'Server error initiating transfer' });
    } finally {
        client.release();
    }
};
