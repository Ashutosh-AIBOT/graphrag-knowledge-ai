import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-base px-6 text-center">
      <p className="text-6xl font-bold text-accent-violet">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-accent-violet px-4 py-2 text-sm font-medium text-white hover:bg-accent-violet/90"
      >
        Back to home
      </Link>
    </div>
  );
}
