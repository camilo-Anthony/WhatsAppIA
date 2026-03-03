import Image from "next/image"

interface LogoProps {
    size?: number
}

export default function Logo({ size = 32 }: LogoProps) {
    return (
        <Image
            src="/logo.png"
            alt="WhatsApp IA"
            width={size}
            height={size}
            style={{ objectFit: "contain" }}
            priority
        />
    )
}
