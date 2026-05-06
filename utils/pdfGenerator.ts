import jsPDF from 'jspdf';
import { formatDisplayTransactionId, getRawTransactionId } from './transactionReceipt';

const formatDateTime = (value: string) => {
    const date = new Date(value);
    return `${date.toLocaleDateString('en-GB')} ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
};

const formatAccount = (id: string | number | undefined, username: string | undefined) => {
    return `ID ${id ?? 'N/A'} (${username || 'Unknown'})`;
};

const formatTransactionStatus = (transaction: any) => {
    const type = String(transaction?.type || '').toLowerCase();
    const status = String(transaction?.status || 'pending').toLowerCase();
    const note = String(transaction?.note || '').toLowerCase();
    const isRequestBased = type === 'request' || type === 'sell';
    const isManualOrderHold = type === 'order_hold' && /manual payment/.test(note);

    if (isRequestBased) {
        if (status === 'accepted' || status === 'completed') return 'Accepted';
        return 'Pending';
    }

    if (isManualOrderHold) {
        if (status === 'completed') return 'Paid';
        if (status === 'pending') return 'Pending';
    }

    if (status === 'accepted') return 'Accepted';
    if (status === 'completed') return 'Completed';
    if (status === 'rejected') return 'Rejected';
    if (status === 'cancelled') return 'Cancelled';
    return status.charAt(0).toUpperCase() + status.slice(1);
};

const getReceiptData = (transaction: any) => {
    const transactionId = formatDisplayTransactionId(getRawTransactionId(transaction), transaction);
    const commission = Number(transaction.commission_percentage || 0);
    const type = String(transaction.type || '').toLowerCase();
    const statusLabel = formatTransactionStatus(transaction);

    let title = 'Wallet Transaction';
    let amountLabel = 'Amount';
    let typeLabel = type || 'Wallet';

    if (type === 'sell') {
        title = commission > 0 ? 'Send Coins & Discount Request' : 'Send Coins';
        amountLabel = 'Send Coins';
        typeLabel = 'Sell';
    } else if (type === 'request') {
        title = commission > 0 ? 'Buy Coins & Discount Request' : 'Buy Coins';
        amountLabel = 'Buy Coins';
        typeLabel = 'Buy';
    } else if (type === 'transfer') {
        title = commission > 0 ? 'Send Coins & Discount Request' : 'Send Coins';
        amountLabel = 'Send Coins';
        typeLabel = 'Send';
    } else if (type === 'order_hold') {
        title = 'Order Payment Hold';
        amountLabel = 'Amount';
        typeLabel = 'Order Hold';
    }

    const details = [
        { label: 'Transaction ID', value: transactionId },
        { label: amountLabel, value: Number(transaction.amount || 0).toFixed(2) },
    ];

    if (commission > 0) {
        details.push({ label: 'Discount Requested', value: `${commission}%` });
    }

    if (type === 'order_hold' && /manual payment/i.test(String(transaction.note || ''))) {
        details.push(
            {
                label: 'Buyer ID',
                value: formatAccount(transaction.sender_readable_id || transaction.sender_id, transaction.sender_username),
            },
            {
                label: 'Seller ID',
                value: formatAccount(transaction.receiver_readable_id || transaction.receiver_id, transaction.receiver_username),
            }
        );
    } else {
        details.push(
            {
                label: 'From Account',
                value: formatAccount(transaction.sender_readable_id || transaction.sender_id, transaction.sender_username),
            },
            {
                label: type === 'request' ? 'Requested From' : 'Send To',
                value: formatAccount(transaction.receiver_readable_id || transaction.receiver_id, transaction.receiver_username),
            }
        );
    }

    details.push(
        { label: 'Date & Time', value: formatDateTime(transaction.created_at) },
        { label: 'Type', value: typeLabel },
        { label: 'Status', value: statusLabel }
    );

    return {
        title,
        status: statusLabel,
        amount: Number(transaction.amount || 0).toFixed(2),
        details,
    };
};

const loadImageAsDataUrl = (src: string) =>
    new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
        const image = new window.Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');

            if (!context) {
                reject(new Error('Canvas not supported'));
                return;
            }

            context.drawImage(image, 0, 0);
            resolve({
                dataUrl: canvas.toDataURL('image/png'),
                width: image.width,
                height: image.height,
            });
        };
        image.onerror = () => reject(new Error('Failed to load logo'));
        image.src = src;
    });

export const generateTransactionReceipt = async (transaction: any, currentUser: any) => {
    const receipt = getReceiptData(transaction);
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [88, 180],
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 7;
    let y = 9;

    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    try {
        const logo = await loadImageAsDataUrl('/assets/images/googer.png');
        const maxLogoWidth = 34;
        const maxLogoHeight = 12;
        const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height);
        const drawWidth = logo.width * scale;
        const drawHeight = logo.height * scale;
        doc.addImage(logo.dataUrl, 'PNG', (pageWidth - drawWidth) / 2, y, drawWidth, drawHeight);
        y += drawHeight + 5;
    } catch {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.text('GOOGER', pageWidth / 2, y + 4, { align: 'center' });
        y += 10;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('GOOGER WALLET TRANSACTION RECEIPT', pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(148, 163, 184);
    doc.text('Verified and Confirmed by System', pageWidth / 2, y, { align: 'center' });
    y += 6.5;

    doc.setFillColor(10, 10, 10);
    doc.roundedRect(marginX, y, pageWidth - marginX * 2, pageHeight - y - 9, 3, 3, 'F');
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.text(`${receipt.title} - ${receipt.status}`, pageWidth / 2, y, {
        align: 'center',
        maxWidth: pageWidth - marginX * 2 - 8,
    });
    y += 6;

    receipt.details.forEach((detail) => {
        doc.setDrawColor(38, 38, 38);
        doc.line(marginX + 4, y + 5.5, pageWidth - marginX - 4, y + 5.5);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(5.2);
        doc.text(detail.label.toUpperCase(), marginX + 4, y);

        const valueLines = doc.splitTextToSize(String(detail.value), 34);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(6.7);
        doc.text(valueLines, pageWidth - marginX - 4, y + 3.7, { align: 'right' });

        y += 8 + ((valueLines.length - 1) * 3);
    });

    doc.setFillColor(20, 20, 20);
    doc.roundedRect(marginX + 4, y + 1, pageWidth - marginX * 2 - 8, 12, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(4.8);
    doc.text('TOTAL AMOUNT', pageWidth / 2, y + 5, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9.5);
    doc.text(`R ${receipt.amount}`, pageWidth / 2, y + 10, { align: 'center' });

    doc.save(`Googer_Receipt_${transaction.id}.pdf`);
};
