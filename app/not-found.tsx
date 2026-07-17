import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-4 font-mono">
      <h2 className="text-sm font-bold uppercase mb-2">404 // Page Not Found</h2>
      <p className="text-xs text-zinc-500 mb-6 uppercase">The requested resource could not be found.</p>
      <Link href="/" className="px-3.5 py-1.5 border border-black hover:bg-black hover:text-white transition duration-200 text-xs font-bold uppercase">
        Return Home
      </Link>
    </div>
  );
}
