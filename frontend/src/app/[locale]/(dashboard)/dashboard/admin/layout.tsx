import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale } = await params;

  if (session?.user?.role !== "admin") {
    redirect(`/${locale}/dashboard`);
  }

  return <>{children}</>;
}
