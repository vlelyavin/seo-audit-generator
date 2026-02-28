import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="text-center">
            {/* Large 404 text */}
            <h1 className="text-[8rem] font-bold leading-none tracking-tight text-gray-800 sm:text-[10rem]">
              404
            </h1>

            {/* Icon */}
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-gray-800 bg-gray-950">
              <Search className="h-7 w-7 text-gray-500" />
            </div>

            {/* Headline */}
            <h2 className="mb-2 text-xl font-semibold text-white">
              Page not found
            </h2>

            {/* Message */}
            <p className="mb-8 text-sm text-gray-400">
              The page you are looking for does not exist or has been moved.
            </p>

            {/* Button */}
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-copper to-copper-light px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
