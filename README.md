# Demo de integración web con Telegram y verificación SMS

Este proyecto demuestra cómo integrar una aplicación web construida con **Node.js + Express** y un frontend en **HTML/JS** con un bot de Telegram, añadiendo un flujo de verificación de identidad mediante número telefónico y código SMS.

## Requisitos previos
- Node.js y npm instalados en tu entorno.
- Una cuenta de Telegram.

## 1. Crear un bot en @BotFather
1. Abre Telegram y busca **@BotFather**.
2. Inicia una conversación y envía el comando `/start`.
3. Usa el comando `/newbot` y sigue las instrucciones para asignar un nombre y un nombre de usuario único a tu bot.
4. Al finalizar, BotFather te entregará un **Token HTTP API**; guárdalo, lo necesitarás más adelante.

## 2. Obtener `TELEGRAM_TOKEN` y `TELEGRAM_CHAT_ID`
- **TELEGRAM_TOKEN**: es el token que BotFather te proporcionó al crear el bot.
- **TELEGRAM_CHAT_ID**: inicia una conversación con tu bot y envíale un mensaje cualquiera. Luego utiliza una herramienta como [IDBot](https://t.me/myidbot) (comando `/getid`) o la API de Telegram (`https://api.telegram.org/bot<TELEGRAM_TOKEN>/getUpdates`) para conocer el identificador del chat.

## 3. Configurar el archivo `.env`
1. Copia el archivo de ejemplo `.env.example` si existe, o crea un nuevo archivo llamado `.env` en la raíz del proyecto.
2. Agrega al menos las siguientes variables, reemplazando los valores por los que obtuviste en el paso anterior:
   ```env
   TELEGRAM_TOKEN=tu_token_de_telegram
   TELEGRAM_CHAT_ID=tu_chat_id
   ```
3. Opcionalmente, configura los datos de tu proveedor SMS (Twilio en este ejemplo):
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
   # Puedes usar un número telefónico propio...
   TWILIO_FROM_NUMBER=+5215512345678
   # ...o un Messaging Service SID
   # TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxx

   # Configuración opcional de tiempos (valores por defecto entre paréntesis)
   SMS_CODE_TTL_MS=300000        # 5 minutos
   SMS_RESEND_INTERVAL_MS=60000  # 60 segundos
   SMS_MAX_ATTEMPTS=5
   SSO_TOKEN_TTL_MS=3600000      # 60 minutos
   ```

   > Si no se definen las variables de Twilio, la aplicación funcionará en modo "mock" mostrando los códigos en la terminal del servidor. No uses este modo en producción.

## 4. Ejecutar `npm start`
1. Instala las dependencias con `npm install` si aún no lo hiciste.
2. Inicia la aplicación con:
   ```bash
   npm start
   ```
3. Abre el navegador en `http://localhost:3000` (o el puerto configurado) y sigue estos pasos:
   1. Ingresa tu número telefónico.
   2. Introduce el código SMS de 6 dígitos (en modo mock aparecerá en la consola).
   3. Envía el mensaje verificado al bot de Telegram.

## Flujo de autenticación

1. El usuario ingresa su número de teléfono y recibe un código de seis dígitos por SMS.
2. Una vez validado el código, el servidor emite un token temporal ligado al número telefónico.
3. El frontend almacena el token en `localStorage` y lo envía en cada petición al endpoint `/api/mensaje`.
4. Solo los mensajes asociados a un teléfono verificado se reenvían al bot de Telegram.

## Soporte
Si encuentras algún problema o tienes sugerencias, crea un issue o envía un pull request.
