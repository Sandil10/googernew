export default function Loading() {
    return (
        <div className="flex flex-col h-screen justify-center items-center bg-white dark:bg-dark2">
            {/* Loading Indicator */}
            <div className="flex flex-col gap-3 items-center justify-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div>
                <div className="text-gray-500 font-medium tracking-wide text-sm">Loading...</div>
            </div>
            <div className="max-w-sm mx-auto md:px-10 p-4 w-full">
                <div className="space-y-6">
                    {/* Logo Skeleton */}
                    <div className="flex justify-center mb-12">
                        <div className="w-32 h-32 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
                    </div>

                    {/* Form Skeleton */}
                    <div className="space-y-4">
                        <div className="w-full h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                        <div className="w-full h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                        <div className="w-full h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                        <div className="w-full h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                        <div className="w-full h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>

                        {/* Login Link Skeleton */}
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-56 mx-auto animate-pulse"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
