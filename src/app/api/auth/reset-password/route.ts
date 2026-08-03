import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

const resetSchema = z.object({
    token: z.string().min(1, "Token requerido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const validation = resetSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const { token, password } = validation.data

        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: {
                    gt: new Date(),
                },
            },
        })

        if (!user) {
            return NextResponse.json(
                { error: "El enlace de recuperación es inválido o expiró" },
                { status: 400 }
            )
        }

        const hashedPassword = await bcrypt.hash(password, 12)

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null,
            },
        })

        return NextResponse.json(
            { message: "Contraseña actualizada exitosamente" },
            { status: 200 }
        )
    } catch (error) {
        console.error("Reset password error:", error)
        return NextResponse.json(
            { error: "Error interno del servidor" },
            { status: 500 }
        )
    }
}
