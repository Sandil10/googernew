enum P2pMarketMode { buyCoins, sellCoins }

class P2pTradeStartPayload {
  final double amount;
  final double receiveAmount;
  final String? receiveCurrency;
  final double reservedRupieer;

  const P2pTradeStartPayload({
    required this.amount,
    required this.receiveAmount,
    required this.receiveCurrency,
    required this.reservedRupieer,
  });

  factory P2pTradeStartPayload.fromEntry({
    required P2pMarketMode mode,
    required double enteredAmount,
    required double rate,
    required String adCurrency,
  }) {
    final safeRate = rate <= 0 ? 0.0001 : rate;
    if (mode == P2pMarketMode.buyCoins) {
      final rupieerAmount = enteredAmount * safeRate;
      return P2pTradeStartPayload(
        amount: enteredAmount,
        receiveAmount: rupieerAmount,
        receiveCurrency: null,
        reservedRupieer: rupieerAmount,
      );
    }

    return P2pTradeStartPayload(
      amount: enteredAmount,
      receiveAmount: enteredAmount / safeRate,
      receiveCurrency: adCurrency.trim().isEmpty ? 'LKR' : adCurrency.trim(),
      reservedRupieer: enteredAmount,
    );
  }

  Map<String, dynamic> toJson({List<Map<String, dynamic>>? buyerFields}) {
    return {
      'amount': amount,
      'receive_amount': receiveAmount,
      if (receiveCurrency != null) 'receive_currency': receiveCurrency,
      if (buyerFields != null) 'buyer_fields': buyerFields,
    };
  }
}

class P2pTransactionSummary {
  final String leftLabel;
  final double leftAmount;
  final String leftCurrency;
  final String rightLabel;
  final double rightAmount;
  final String rightCurrency;

  const P2pTransactionSummary({
    required this.leftLabel,
    required this.leftAmount,
    required this.leftCurrency,
    required this.rightLabel,
    required this.rightAmount,
    required this.rightCurrency,
  });

  factory P2pTransactionSummary.forTransaction({
    required P2pMarketMode mode,
    required bool isBuyer,
    required String status,
    required double amount,
    required double receiveAmount,
    required String adCurrency,
    required String receiveCurrency,
  }) {
    final normalizedStatus = status.toLowerCase().trim();
    final normalizedAdCurrency = adCurrency.trim().isEmpty
        ? 'LKR'
        : adCurrency.trim();

    if (mode == P2pMarketMode.buyCoins) {
      final sellerPending = normalizedStatus == 'pending' && !isBuyer;
      return P2pTransactionSummary(
        leftLabel: normalizedStatus == 'pending' && isBuyer
            ? 'Enter Amount'
            : 'Amount',
        leftAmount: amount,
        leftCurrency: sellerPending ? 'R' : normalizedAdCurrency,
        rightLabel: normalizedStatus == 'completed'
            ? 'Received'
            : normalizedStatus == 'pending' && isBuyer
            ? 'You Receive'
            : 'Receive',
        rightAmount: receiveAmount,
        rightCurrency: sellerPending ? '' : 'R',
      );
    }

    final normalizedReceiveCurrency = receiveCurrency.trim().isEmpty
        ? normalizedAdCurrency
        : receiveCurrency.trim();
    if (isBuyer) {
      return P2pTransactionSummary(
        leftLabel: 'You Pay',
        leftAmount: amount,
        leftCurrency: 'Rupieer',
        rightLabel: 'You Receive',
        rightAmount: receiveAmount,
        rightCurrency: normalizedReceiveCurrency,
      );
    }

    return P2pTransactionSummary(
      leftLabel: 'You Pay',
      leftAmount: receiveAmount,
      leftCurrency: normalizedReceiveCurrency,
      rightLabel: 'You Receive',
      rightAmount: amount,
      rightCurrency: 'Rupieer',
    );
  }
}

class P2pTransactionDisplayValues {
  final double amount;
  final double receiveAmount;
  final String amountCurrency;
  final String receiveCurrency;

  const P2pTransactionDisplayValues({
    required this.amount,
    required this.receiveAmount,
    required this.amountCurrency,
    required this.receiveCurrency,
  });

  factory P2pTransactionDisplayValues.fromApi({
    required P2pMarketMode mode,
    required double apiAmount,
    required double apiReceiveAmount,
    required String adCurrency,
    required String apiReceiveCurrency,
  }) {
    final normalizedAdCurrency = adCurrency.trim().isEmpty
        ? 'LKR'
        : adCurrency.trim();
    return P2pTransactionDisplayValues(
      amount: apiAmount,
      receiveAmount: apiReceiveAmount,
      amountCurrency: normalizedAdCurrency,
      receiveCurrency: apiReceiveCurrency.trim(),
    );
  }
}
