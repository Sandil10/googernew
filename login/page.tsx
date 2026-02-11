"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.push('/');
    }, [router]);

    return (
        <div className="flex items-center justify-center h-screen bg-white dark:bg-slate-900">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
        </div>
    );
}
