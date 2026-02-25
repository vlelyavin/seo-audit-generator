import { redirect } from "next/navigation";

// Registration disabled — redirect to login
export default async function RegisterPage() {
  redirect("/login");
}
