import Link from 'next/link';

export const metadata = {
  title: 'Términos y Condiciones | GoPocket',
  description: 'Términos y condiciones de uso de la plataforma GoPocket',
};

export default function TerminosYCondicionesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Términos y Condiciones</div>
            </div>
          </div>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50">
            Volver
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Términos y Condiciones</h1>
          <p className="mt-2 text-sm text-gray-600">Última actualización: {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <div className="mt-8 space-y-6 text-sm text-gray-700">
            <section>
              <h2 className="text-xl font-bold text-gray-900">1. Aceptación de los Términos</h2>
              <p className="mt-2">
                Al acceder y utilizar la plataforma GoPocket, usted acepta cumplir con estos Términos y Condiciones. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar nuestros servicios.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">2. Descripción del Servicio</h2>
              <p className="mt-2">
                GoPocket es una plataforma de marketplace que permite a los usuarios comprar y vender productos. La plataforma actúa como intermediario entre compradores y vendedores, facilitando transacciones seguras.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">3. Registro y Cuenta de Usuario</h2>
              <div className="mt-2 space-y-2">
                <p>3.1. Para utilizar nuestros servicios, debe crear una cuenta proporcionando información precisa y completa.</p>
                <p>3.2. Usted es responsable de mantener la confidencialidad de sus credenciales de acceso.</p>
                <p>3.3. Debe ser mayor de edad o tener el consentimiento de un tutor legal para utilizar la plataforma.</p>
                <p>3.4. Se compromete a notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">4. Publicación de Productos</h2>
              <div className="mt-2 space-y-2">
                <p>4.1. Los vendedores son responsables de la veracidad de la información de sus productos.</p>
                <p>4.2. Está prohibido publicar productos ilegales, falsificados o que infrinjan derechos de terceros.</p>
                <p>4.3. Las imágenes y descripciones deben ser precisas y representar fielmente el producto.</p>
                <p>4.4. Nos reservamos el derecho de eliminar cualquier publicación que no cumpla con nuestras políticas.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">5. Transacciones y Pagos</h2>
              <div className="mt-2 space-y-2">
                <p>5.1. Todas las transacciones se procesan a través de proveedores de pago seguros.</p>
                <p>5.2. Los precios mostrados son responsabilidad del vendedor y deben incluir todos los impuestos aplicables.</p>
                <p>5.3. Los pagos se mantienen en custodia hasta que el comprador confirme la recepción del producto.</p>
                <p>5.4. Las comisiones de la plataforma se deducen automáticamente de las ventas.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">6. Envíos y Entregas</h2>
              <div className="mt-2 space-y-2">
                <p>6.1. El vendedor es responsable del empaque y envío del producto.</p>
                <p>6.2. Los tiempos de entrega son estimaciones y pueden variar según el servicio de envío.</p>
                <p>6.3. El comprador debe verificar el estado del producto al recibirlo.</p>
                <p>6.4. Los costos de envío son responsabilidad del comprador, salvo que se indique lo contrario.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">7. Devoluciones y Reembolsos</h2>
              <div className="mt-2 space-y-2">
                <p>7.1. Las políticas de devolución están sujetas a las condiciones establecidas por cada vendedor.</p>
                <p>7.2. Los reembolsos se procesarán según las políticas de la plataforma y del método de pago utilizado.</p>
                <p>7.3. En caso de disputa, nuestro equipo de soporte evaluará cada caso individualmente.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">8. Conducta del Usuario</h2>
              <div className="mt-2 space-y-2">
                <p>8.1. Los usuarios deben comportarse de manera respetuosa y profesional.</p>
                <p>8.2. Está prohibido realizar actividades fraudulentas, engañosas o ilegales.</p>
                <p>8.3. No se permite el acoso, amenazas o comportamiento abusivo hacia otros usuarios.</p>
                <p>8.4. Nos reservamos el derecho de suspender o eliminar cuentas que violen estas reglas.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">9. Propiedad Intelectual</h2>
              <div className="mt-2 space-y-2">
                <p>9.1. Todo el contenido de la plataforma, incluyendo diseño, logos y textos, es propiedad de GoPocket.</p>
                <p>9.2. Los usuarios conservan los derechos sobre el contenido que publican, pero otorgan licencia para su uso en la plataforma.</p>
                <p>9.3. Está prohibido copiar, modificar o distribuir contenido de la plataforma sin autorización.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">10. Limitación de Responsabilidad</h2>
              <div className="mt-2 space-y-2">
                <p>10.1. GoPocket actúa como intermediario y no se hace responsable por la calidad, seguridad o legalidad de los productos.</p>
                <p>10.2. No garantizamos la disponibilidad continua o ininterrumpida de nuestros servicios.</p>
                <p>10.3. Nuestra responsabilidad se limita al monto de las comisiones recibidas en la transacción específica.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">11. Modificaciones de los Términos</h2>
              <p className="mt-2">
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor al publicarse en la plataforma. El uso continuado de nuestros servicios después de los cambios constituye su aceptación.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">12. Ley Aplicable y Jurisdicción</h2>
              <p className="mt-2">
                Estos términos se rigen por las leyes de México. Cualquier disputa será resuelta en los tribunales competentes de México.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900">13. Contacto</h2>
              <p className="mt-2">
                Para consultas sobre estos términos, puede contactarnos a través del sistema de soporte de la plataforma o visitando la sección de ayuda.
              </p>
            </section>
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6">
            <Link href="/" className="inline-flex rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
