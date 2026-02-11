"use client";

import Link from "next/link";
import IonIcon from "../app/components/IonIcon";

export default function Wallet() {

    return (
        <div className="main__inner">
            <h3 className="font-extrabold text-2xl text-black dark:text-white mb-6"> Wallet </h3>

            <div className="grid grid-cols-1 gap-6 md:max-w-2xl mb-[5px]">
                {/* My Wallet Card */}
                <div className="bg-white rounded-xl shadow-sm p-8 border border-slate-200 dark:border-slate-700 dark:bg-dark2 flex flex-col items-center justify-center hover:shadow-md transition-shadow cursor-pointer min-h-[250px]">
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-slate-700/60 flex items-center justify-center text-blue-600 text-4xl mb-4">
                        <IonIcon name="wallet-outline" />
                    </div>
                    <h4 className="text-xl font-bold text-black dark:text-white text-center"> My Wallet </h4>
                    <p className="text-sm text-gray-500 mt-2 dark:text-white/70 text-center"> Manage your balance and earnings </p>
                    <Link href="/wallet/my-wallet" className="mt-6 w-full max-w-[200px] text-center py-3 bg-white text-black border border-slate-200 rounded-full font-medium hover:bg-gray-50 transition-colors shadow-sm"> Open Wallet </Link>
                </div>

                {/* Withdrawal Card */}
                <div className="bg-white rounded-xl shadow-sm p-8 border border-slate-200 dark:border-slate-700 dark:bg-dark2 flex flex-col items-center justify-center hover:shadow-md transition-shadow cursor-pointer min-h-[250px]">
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-slate-700/60 flex items-center justify-center text-blue-600 text-4xl mb-4">
                        <IonIcon name="cash-outline" />
                    </div>
                    <h4 className="text-xl font-bold text-black dark:text-white text-center"> Withdrawal </h4>
                    <p className="text-sm text-gray-500 mt-2 dark:text-white/70 text-center"> Cash out your earnings to your account </p>
                    <Link href="/wallet/withdrawal" className="mt-6 w-full max-w-[200px] text-center py-3 bg-white text-black border border-slate-200 rounded-full font-medium hover:bg-gray-50 transition-colors shadow-sm"> Withdraw </Link>
                </div>

                {/* Topup Card */}
                <div className="bg-white rounded-xl shadow-sm p-8 border border-slate-200 dark:border-slate-700 dark:bg-dark2 flex flex-col items-center justify-center hover:shadow-md transition-shadow cursor-pointer min-h-[250px]">
                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-slate-700/60 flex items-center justify-center text-blue-600 text-4xl mb-4">
                        <IonIcon name="add-circle-outline" />
                    </div>
                    <h4 className="text-xl font-bold text-black dark:text-white text-center"> Topup </h4>
                    <p className="text-sm text-gray-500 mt-2 dark:text-white/70 text-center"> Add funds to your wallet instantly </p>
                    <Link href="/wallet/topup" className="mt-6 w-full max-w-[200px] text-center py-3 bg-white text-black border border-slate-200 rounded-full font-medium hover:bg-gray-50 transition-colors shadow-sm"> Top Up </Link>
                </div>

                {/* Transactions Card */}
                <div className="bg-white rounded-xl shadow-sm p-8 border border-slate-200 dark:border-slate-700 dark:bg-dark2 flex flex-col items-center justify-center hover:shadow-md transition-shadow cursor-pointer min-h-[250px]">
                    <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-slate-700/60 flex items-center justify-center text-orange-600 text-4xl mb-4">
                        <IonIcon name="receipt-outline" />
                    </div>
                    <h4 className="text-xl font-bold text-black dark:text-white text-center"> History </h4>
                    <p className="text-sm text-gray-500 mt-2 dark:text-white/70 text-center"> View your full transaction history </p>
                    <Link href="/dashboard/wallet/transactions" className="mt-6 w-full max-w-[200px] text-center py-3 bg-white text-black border border-slate-200 rounded-full font-medium hover:bg-gray-50 transition-colors shadow-sm"> View History </Link>
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>        </div>
    );
}
