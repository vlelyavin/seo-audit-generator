import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="mb-1 flex items-center gap-2 text-sm">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-600">/</span>}
          {item.href ? (
            <Link
              href={item.href}
              className="text-gray-400 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-white">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
