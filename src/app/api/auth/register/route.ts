import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

const registerSchema = z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    company: z.string().optional(),
})

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const validation = registerSchema.safeParse(body)

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.error.issues[0].message },
                { status: 400 }
            )
        }

        const { email, password, name, company } = validation.data

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email },
        })

        if (existingUser) {
            return NextResponse.json(
                { error: "Ya existe una cuenta con este email" },
                { status: 409 }
            )
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12)

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
                company,
            },
        })

        // Create default assistant config
        await prisma.assistantConfig.create({
            data: {
                userId: user.id,
                behaviorPrompt: `Eres un asistente virtual amigable y profesional. Responde de manera clara y concisa. Si no tienes información sobre algo, indica amablemente que no puedes ayudar con eso y sugiere contactar directamente.`,
                infoMode: "SIMPLE",
                simpleInfo: "",
                isActive: false,
            },
        })

        return NextResponse.json(
            { message: "Cuenta creada exitosamente", userId: user.id },
            { status: 201 }
        )
    } catch (error) {
        console.error("Registration error:", error)
        return NextResponse.json(
            { error: "Error interno del servidor" },
            { status: 500 }
        )
    }
}
