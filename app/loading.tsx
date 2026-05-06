export default function Loading() {
    return (
        <div className="flex flex-col gap-3 justify-center items-center h-screen bg-black">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
            <div className="text-gray-500 font-medium tracking-wide">Loading...</div>
        </div>
    );
}
