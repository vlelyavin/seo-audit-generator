import { NextResponse } from "next/server";
// import { hash } from "bcryptjs";
// import { prisma } from "@/lib/prisma";

// Registration disabled — Google auth only
export async function POST() {
  return NextResponse.json(
    { error: "Registration disabled" },
    { status: 410 }
  );
}

// Original registration logic (commented out for future use):
// export async function POST(req: Request) {
//   try {
//     const { name, email, password } = await req.json();
//     if (!email || !password) {
//       return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
//     }
//     if (password.length < 8) {
//       return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
//     }
//     const existing = await prisma.user.findUnique({ where: { email } });
//     if (existing) {
//       return NextResponse.json({ error: "Email already registered" }, { status: 409 });
//     }
//     const hashedPassword = await hash(password, 12);
//     const user = await prisma.user.create({
//       data: { name: name || null, email, password: hashedPassword, planId: "agency" },
//     });
//     return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
//   } catch (error) {
//     console.error("[Register] Error:", error);
//     return NextResponse.json({ error: "Internal server error" }, { status: 500 });
//   }
// }
