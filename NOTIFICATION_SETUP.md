# Configuración de Servicios de Notificación

Este documento describe cómo configurar cada servicio de notificación integrado en Tezcapanel.

## Variables de Entorno

Copia estas variables a tu archivo `.env.local`:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=tu_token_de_bot_aqui

# Slack
# (El webhook URL se proporciona en la interfaz de usuario)

# WhatsApp con Twilio
TWILIO_ACCOUNT_SID=tu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_WHATSAPP_NUMBER=+1234567890

# Email con SendGrid
SENDGRID_API_KEY=tu_api_key
SENDGRID_FROM_EMAIL=noreply@tezcapanel.com
```

---

## Telegram

### Paso 1: Crear un Bot en Telegram

1. Abre Telegram y busca `@BotFather`
2. Escribe `/start` y luego `/newbot`
3. Sigue las instrucciones (nombre del bot, username, etc.)
4. BotFather te dará un token: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

### Paso 2: Obtener tu Chat ID

1. Abre Telegram y busca `@userinfobot`
2. Escribe `/start`
3. Te mostrará tu Chat ID

### Paso 3: Configurar en Tezcapanel

1. Ve a **Configuración → Canales de notificación**
2. Haz clic en el ícono de edición de **Telegram**
3. Habilita el canal
4. Ingresa tu **Chat ID**
5. Haz clic en **Probar** para verificar la conexión

---

## Slack

### Paso 1: Crear un Webhook de Slack

1. Ve a https://api.slack.com/apps
2. Crea una nueva app o usa una existente
3. Ve a **Incoming Webhooks** y actívalo
4. Haz clic en **Add New Webhook to Workspace**
5. Selecciona el canal y autoriza
6. Copia la URL del webhook: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`

### Paso 2: Configurar en Tezcapanel

1. Ve a **Configuración → Canales de notificación**
2. Haz clic en el ícono de edición de **Slack**
3. Habilita el canal
4. Pega la **URL del Webhook**
5. Haz clic en **Probar** para verificar la conexión

---

## WhatsApp (Twilio)

### Paso 1: Crear cuenta en Twilio

1. Ve a https://www.twilio.com y crea una cuenta
2. Verifica tu teléfono
3. Ve al **Dashboard** y copia:
   - **Account SID**
   - **Auth Token**

### Paso 2: Configurar WhatsApp Sandbox

1. En Twilio, ve a **Messaging → Try it out → Send an SMS**
2. Ve a **Messaging → Settings → WhatsApp Sandbox**
3. Copia el número de WhatsApp de Twilio (ej: +1415-555-1212)
4. En WhatsApp, envía un mensaje al número con el código proporcionado

### Paso 3: Configurar en Tezcapanel

1. Ve a **Configuración → Canales de notificación**
2. Haz clic en el ícono de edición de **WhatsApp**
3. Habilita el canal
4. Ingresa tu **número de teléfono** (incluye código de país, ej: +34123456789)
5. Haz clic en **Probar** para verificar la conexión

### Variables de Entorno

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=auth_token_aqui
TWILIO_WHATSAPP_NUMBER=+1415555121
```

---

## Email (SendGrid)

### Paso 1: Crear cuenta en SendGrid

1. Ve a https://sendgrid.com y crea una cuenta
2. Verifica tu dirección de email
3. Ve a **Settings → API Keys**
4. Crea una nueva API Key (copia el contenido)

### Paso 2: Verificar dominio (Recomendado)

1. Ve a **Settings → Sender Authentication**
2. Sigue los pasos para verificar tu dominio
3. Esto mejora la entrega de emails

### Paso 3: Configurar en Tezcapanel

1. Ve a **Configuración → Canales de notificación**
2. Haz clic en el ícono de edición de **Email**
3. Habilita el canal
4. Ingresa tu **email**
5. Haz clic en **Probar** para verificar la conexión

### Variables de Entorno

```env
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=notificaciones@tudominio.com
```

---

## Pruebas

Después de configurar cada servicio:

1. Ve a **Configuración → Canales de notificación**
2. Haz clic en el botón **Probar** del canal
3. Deberías recibir un mensaje de prueba en el canal configurado

Si recibe un error:
- Verifica que el token/webhook/número sean correctos
- Revisa los logs del panel para más detalles
- Asegúrate de que las credenciales en `.env.local` estén configuradas

---

## Notas Importantes

- **Seguridad:** Las credenciales se encriptan y se almacenan de forma segura en la base de datos
- **Rate Limiting:** Algunos servicios tienen límites de envío. Consulta su documentación
- **Costos:** 
  - Telegram: Gratuito
  - Slack: Gratuito (webhooks limitados)
  - WhatsApp: Twilio cobra por mensaje
  - Email: SendGrid tiene plan gratuito (100 emails/día)
