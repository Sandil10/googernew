import '../api/api.dart';
import '../models/wallet_dashboard.dart';

abstract class WalletDashboardRepository {
  const WalletDashboardRepository();

  Future<WalletDashboardSnapshot> load();
}

class ApiWalletDashboardRepository extends WalletDashboardRepository {
  const ApiWalletDashboardRepository();

  @override
  Future<WalletDashboardSnapshot> load() async {
    final payload = await Api.loadWalletDashboardRaw();
    return WalletDashboardSnapshot.fromApi(payload);
  }
}
