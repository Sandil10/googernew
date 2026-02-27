import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateTransactionReceipt = (transaction: any, currentUser: any) => {
    const doc = new jsPDF();
    const isSent = transaction.sender_id === currentUser?.id;
    const date = new Date(transaction.created_at).toLocaleDateString('en-GB');
    const time = new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFillColor(22, 32, 51); // #162033
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('GOOGER WALLET', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Official Transaction Receipt', 105, 30, { align: 'center' });

    // Transaction Summary
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.text('Receipt Details', 14, 55);

    let yPos = 65;
    const lineHeight = 10;

    const details = [
        ['Transaction ID', `#TXN-${transaction.id}`],
        ['Date', date],
        ['Time', time],
        ['Type', transaction.type === 'transfer' ? 'Direct Transfer' : transaction.type.toUpperCase()],
        ['Sender', `${transaction.sender_username} (ID: ${transaction.sender_id})`],
        ['Recipient', `${transaction.receiver_username} (ID: ${transaction.receiver_id})`],
        ['Status', transaction.status.toUpperCase()],
    ];

    autoTable(doc, {
        startY: 60,
        head: [['Field', 'Description']],
        body: details,
        theme: 'striped',
        headStyles: { fillColor: [66, 133, 244] },
        styles: { fontSize: 10, cellPadding: 5 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Amount Section
    doc.setFillColor(245, 245, 245);
    doc.rect(14, finalY, 182, 30, 'F');

    doc.setFontSize(12);
    doc.text('Transaction Amount:', 20, finalY + 12);
    doc.setFontSize(18);
    doc.setTextColor(isSent ? 220 : 34, isSent ? 53 : 139, isSent ? 69 : 34); // Red or Green
    doc.text(`${isSent ? '-' : '+'} R ${parseFloat(transaction.amount).toFixed(2)}`, 140, finalY + 13);

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    if (transaction.commission_percentage > 0) {
        doc.text(`* Includes ${transaction.commission_percentage}% discount`, 20, finalY + 22);
    }
    if (transaction.note) {
        doc.text(`Note: ${transaction.note}`, 20, finalY + 26);
    }

    // Footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('This is a computer-generated receipt and does not require a signature.', 105, pageHeight - 20, { align: 'center' });
    doc.text('Thank you for using Googer Wallet!', 105, pageHeight - 15, { align: 'center' });

    // Save
    doc.save(`Googer_Receipt_${transaction.id}.pdf`);
};
