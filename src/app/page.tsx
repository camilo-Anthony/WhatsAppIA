import Link from "next/link"
import Logo from "@/components/Logo"
import styles from "./landing.module.css"

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* 3D Fixed Background */}
      <div className={styles.pageGrid} />

      {/* Navbar */}
      <nav className={styles.navbar}>
        <div className={`container ${styles.navContent}`}>
          <Link href="/" className={styles.navLogo}>
            <Logo size={32} />
            <span>WhatsApp<span style={{ color: "var(--color-primary)" }}>Agent</span></span>
          </Link>
          <div className={styles.navActions}>
            <Link href="/login" className="btn btn-ghost">Iniciar sesión</Link>
            <Link href="/register" className="btn btn-primary">crear cuenta</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <Logo size={180} />
          <h1 className={styles.heroTitle}>
            Automatiza tu
            <br />
            <span style={{ color: "var(--color-primary)" }}>WhatsApp con IA</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Responde automáticamente a tus clientes con inteligencia artificial personalizada.
            Configura el comportamiento, carga tu información y deja que la IA trabaje por ti.
          </p>
          <div className={styles.heroCTA}>
            <Link href="/register" className="btn btn-primary btn-lg">
              Comenzar gratis
            </Link>
            <Link href="#features" className="btn btn-secondary btn-lg">
              Ver características
            </Link>
          </div>
          <br />
          <Link href="/login" className={styles.heroLoginLink}>
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <div className="container">
          <h2 className={styles.sectionTitle}>Todo lo que necesitas</h2>
          <p className={styles.sectionSubtitle}>
            Una plataforma completa para automatizar tu atención por WhatsApp
          </p>

          <div className={styles.featureGrid}>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
              </div>
              <h3>Respuestas automáticas</h3>
              <p>La IA responde instantáneamente usando la información de tu negocio</p>
            </div>

            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                </svg>
              </div>
              <h3>IA personalizada</h3>
              <p>Define el tono, personalidad y límites de tu asistente virtual</p>
            </div>

            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" />
                  <path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" />
                  <path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" />
                </svg>
              </div>
              <h3>Datos en tiempo real</h3>
              <p>Conecta bases de datos y APIs para consultas dinámicas</p>
            </div>


            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <h3>Configuración total</h3>
              <p>Modo simple o avanzado para definir la información de tu negocio</p>
            </div>

            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon} style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h3>Historial completo</h3>
              <p>Revisa todas las conversaciones y mensajes en tu panel</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howItWorks}>
        <div className="container">
          <h2 className={styles.sectionTitle}>¿Cómo funciona?</h2>
          <p className={styles.sectionSubtitle}>En 3 simples pasos</p>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Conecta tu WhatsApp</h3>
              <p>Vincula tu número escaneando un código QR desde tu teléfono</p>
            </div>
            <div className={styles.stepDivider} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Configura tu asistente</h3>
              <p>Define el tono, la personalidad y carga la información de tu negocio</p>
            </div>
            <div className={styles.stepDivider} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>¡Listo!</h3>
              <p>Tu asistente responde automáticamente a tus clientes 24/7</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.cta}>
        <div className="container">
          <div className={`${styles.ctaCard} card`}>
            <h2>Empieza a automatizar hoy</h2>
            <p>Configura tu asistente en minutos. Sin tarjeta de crédito, sin compromisos.</p>
            <Link href="/register" className={`btn btn-primary btn-lg ${styles.ctaButton}`}>
              Crear cuenta gratis
            </Link>
          </div>
        </div>
      </section>

      {/* Transparencia y Privacidad */}
      <section className={styles.howItWorks} id="privacy-section">
        <div className="container">
          <h2 className={styles.sectionTitle}>Tu privacidad es importante</h2>
          <p className={styles.sectionSubtitle}>
            WhatsAppAgent utiliza datos de usuario exclusivamente para proporcionar el servicio de automatización de WhatsApp.
            Accedemos a tu cuenta de Google (Calendar, Sheets) solo cuando tú lo autorizas, para integrar funcionalidades
            como agendar citas o consultar información. Nunca vendemos ni compartimos tus datos con terceros.
          </p>
          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <a
              href="https://whatsappia-av8c.onrender.com/privacy"
              className="btn btn-secondary btn-lg"
              style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              Leer nuestra Política de Privacidad
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerContent}`}>
          <span className={styles.footerLogo}>WhatsApp<span style={{ color: "var(--color-primary)" }}>Agent</span></span>
          <div className={styles.footerLinks}>
            <a href="https://whatsappia-av8c.onrender.com/privacy">Política de Privacidad</a>
            <a href="#">Términos</a>
            <a href="#">Contacto</a>
          </div>
          <span className={styles.footerText}>
            © 2026 WhatsAppAgent · Desarrollado por Camilo Anthony
          </span>
        </div>
      </footer>
    </div>
  )
}
