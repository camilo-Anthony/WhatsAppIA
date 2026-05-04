import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function PUT(request: Request) {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "No autorizado" }, { status: 401 })
        }

        const body = await request.json()
        const { currentPassword, newPassword } = body

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: "Ambas contraseñas son obligatorias" }, { status: 400 })
        }

        if (newPassword.length < 6) {
            return NextResponse.json({ error: "La nueva contraseña debe tener al menos 6 caracteres" }, { status: 400 })
        }

        // Fetch user with current password hash
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, password: true },
        })

        if (!user) {
            return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password)
        if (!isValid) {
            return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 403 })
        }

        // Hash new password and update
        const hashedPassword = await bcrypt.hash(newPassword, 12)
        await prisma.user.update({
            where: { id: session.user.id },
            data: { password: hashedPassword },
        })

        return NextResponse.json({ message: "Contraseña actualizada" })
    } catch (error) {
        console.error("Update password error:", error)
        return NextResponse.json({ error: "Error interno" }, { status: 500 })
    }
}
