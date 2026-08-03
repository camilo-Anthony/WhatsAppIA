import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { z } from "zod"
import crypto from "crypto"

const forgotSchema = z.object({
    email: z.string().email("Email inválido"),
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const validation = forgotSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const { email } = validation.data

        const user = await prisma.user.findUnique({
            where: { email },
        })

        // Siempre responder lo mismo para no revelar si el email existe
        if (!user) {
            return NextResponse.json(
                { message: "Si el email existe, recibirás un enlace de recuperación" },
                { status: 200 }
            )
        }

        // Generar token
        const token = crypto.randomBytes(32).toString("hex")
        const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetToken: token,
                resetTokenExpiry: expiry,
            },
        })

        // Construir el link de reset
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_URL || ""
        const resetLink = `${baseUrl}/reset-password?token=${token}`

        // TODO: Enviar email cuando este configurado SMTP/Resend
        // Por ahora devolvemos el link en la respuesta (modo demo)
        if (process.env.NODE_ENV === "production" && baseUrl) {
            // En produccion, no devolver el link directamente
            // Aqui se enviaria el email con nodemailer/resend
            return NextResponse.json(
                { message: "Si el email existe, recibirás un enlace de recuperación" },
                { status: 200 }
            )
        }

        return NextResponse.json(
            { message: "Enlace generado", resetLink },
            { status: 200 }
        )
    } catch (error) {
        console.error("Forgot password error:", error)
        return NextResponse.json(
            { error: "Error interno del servidor" },
            { status: 500 }
        )
    }
}
