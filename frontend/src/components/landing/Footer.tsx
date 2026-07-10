import Link from 'next/link';
import { Github, Twitter, Linkedin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <p className="font-semibold">GraphRAG Knowledge AI</p>
          <p className="mt-2 text-sm text-text-muted">
            Knowledge graphs made simple.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            <li><Link href="#" className="hover:text-text-primary">Features</Link></li>
            <li><Link href="#" className="hover:text-text-primary">Pricing</Link></li>
            <li><Link href="#" className="hover:text-text-primary">Changelog</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Resources</p>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            <li><Link href="#" className="hover:text-text-primary">Documentation</Link></li>
            <li><Link href="#" className="hover:text-text-primary">API Reference</Link></li>
            <li><Link href="#" className="hover:text-text-primary">Status</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Company</p>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary">
            <li><Link href="#" className="hover:text-text-primary">About</Link></li>
            <li><Link href="#" className="hover:text-text-primary">Blog</Link></li>
            <li><Link href="#" className="hover:text-text-primary">Careers</Link></li>
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm text-text-muted">
        <span>© 2026 GraphRAG. All rights reserved.</span>
        <div className="flex gap-3">
          <Github className="h-4 w-4" />
          <Twitter className="h-4 w-4" />
          <Linkedin className="h-4 w-4" />
        </div>
      </div>
    </footer>
  );
}
