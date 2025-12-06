// =========================================
// TEST DE RED PARA WHATSAPP / BAILEYS
// =========================================

const https = require("https");
const dns = require("dns");
const WebSocket = require("ws");

function log(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(result);
}

// -------------------------------------------------------
// 1) TEST DNS
// -------------------------------------------------------
dns.resolve("web.whatsapp.com", (err, addresses) => {
  if (err) {
    log("DNS WHATSAPP", `❌ Error: ${err.message}`);
  } else {
    log("DNS WHATSAPP", `✅ Resuelto: ${addresses.join(", ")}`);
  }
});

// -------------------------------------------------------
// 2) TEST HTTPS (TLS)
// -------------------------------------------------------
https
  .get("https://web.whatsapp.com", (res) => {
    log("HTTPS WHATSAPP", `Status: ${res.statusCode}`);
  })
  .on("error", (err) => {
    log("HTTPS WHATSAPP", `❌ Error: ${err.message}`);
  });

// -------------------------------------------------------
// 3) TEST WEBSOCKET TLS DIRECTO (LA CLAVE!!!)
// -------------------------------------------------------

function testWebSocketTLS() {
  return new Promise((resolve) => {
    const ws = new WebSocket("wss://web.whatsapp.com/ws/chat", {
      rejectUnauthorized: false,
      handshakeTimeout: 5000
    });

    ws.on("open", () => {
      resolve("✅ WebSocket TLS FUNCIONA (WhatsApp permitirá QR)");
      ws.close();
    });

    ws.on("error", (err) => {
      resolve("❌ WebSocket TLS FALLA → Firewall/Antivirus/ISP está bloqueando: " + err.message);
    });

    ws.on("close", () => {});
  });
}

(async () => {
  const wsResult = await testWebSocketTLS();
  log("WEBSOCKET TLS", wsResult);
})();

// -------------------------------------------------------
// 4) TEST WEBSOCKET SIN TLS (detecta inspección TLS/AVAST/ESET)
// -------------------------------------------------------

function testWebSocketNoTLS() {
  return new Promise((resolve) => {
    const ws = new WebSocket("ws://web.whatsapp.com/ws/chat", {
      handshakeTimeout: 5000
    });

    ws.on("open", () => {
      resolve("⚠️ WebSocket sin TLS abrió → tu red está reescribiendo HTTPS (MITM posible)");
      ws.close();
    });

    ws.on("error", (err) => {
      resolve("✔ WebSocket sin TLS está bloqueado (esto es correcto): " + err.message);
    });
  });
}

(async () => {
  const wsResult2 = await testWebSocketNoTLS();
  log("WEBSOCKET SIN TLS", wsResult2);
})();

// -------------------------------------------------------
// 5) DETECCIÓN DE INSPECCIÓN TLS
// -------------------------------------------------------
https
  .get(
    {
      hostname: "web.whatsapp.com",
      port: 443,
      method: "GET",
      rejectUnauthorized: true
    },
    (res) => {
      log("TLS INSPECTION", "✅ Certificado íntegro (no hay antivirus interceptando TLS)");
    }
  )
  .on("error", (err) => {
    log(
      "TLS INSPECTION",
      "❌ Certificado alterado → Antivirus/Firewall inspecciona HTTPS (MITM)\n" +
        err.message
    );
  });

// -------------------------------------------------------
// 6) DETECTAR PROXY TRANSPARENTE
// -------------------------------------------------------
https
  .get("https://ipinfo.io/ip", (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      log("IP PÚBLICA", `Detectada: ${data.trim()}`);
    });
  })
  .on("error", () => {
    log("IP PÚBLICA", "❌ No se pudo consultar IP pública. ISP o Proxy bloqueando.");
  });
