# Demo de integración web con Telegram

Este proyecto es una demostración sencilla de cómo integrar una aplicación web con un bot de Telegram.

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
2. Agrega las siguientes variables, reemplazando los valores por los que obtuviste en el paso anterior:
   ```env
   TELEGRAM_TOKEN=tu_token_de_telegram
   TELEGRAM_CHAT_ID=tu_chat_id
   ```

## 4. Ejecutar `npm start`
1. Instala las dependencias con `npm install` si aún no lo hiciste.
2. Inicia la aplicación con:
   ```bash
   npm start
   ```
3. La aplicación debería estar disponible según la configuración del proyecto y lista para interactuar con el bot de Telegram.

## Soporte
Si encuentras algún problema o tienes sugerencias, crea un issue o envía un pull request.
