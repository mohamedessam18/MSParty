import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  // Already signed in: there is nothing to register.
  if ((session?.user as { id?: string } | undefined)?.id) redirect("/dashboard");
  return <RegisterForm />;
}
