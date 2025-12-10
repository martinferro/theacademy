/**
 * Integración placeholder para sesiones múltiples de WhatsApp.
 *
 * Este módulo actúa como punto de extensión para conectar `whatsappCentral`
 * con implementaciones basadas en `whatsapp-web.js` u otros adaptadores.
 * En este entorno se limita a mantener las líneas como "conectadas" y a
 * registrar los mensajes salientes para depuración.
 */

function log(...args) {
  if (process.env.NODE_ENV !== 'test') {
    console.log('[multi_whatsapp]', ...args);
  }
}

module.exports = function integrateMultiWhatsapp(central) {
  if (!central) {
    log('Servicio de WhatsApp central no disponible.');
    return;
  }

  central.on('salida:enviar', ({ linea, to, body }) => {
    log(`Mensaje saliente desde ${linea} hacia ${to || 'destino desconocido'}: ${body}`);
  });

  central.on('new_qr', ({ linea }) => {
    log(`QR generado para la línea ${linea}. Esperando escaneo...`);
  });
};
