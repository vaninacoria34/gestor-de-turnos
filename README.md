# 🌿 Gestor de Turnos

Aplicación web para la **gestión de turnos de trabajo** con generación automática,
solicitudes de cambio, descansos, notificaciones y reportes.

## 🏗️ Arquitectura

- **Backend**: Node.js + Express + SQLite (`better-sqlite3`)
- **Frontend**: HTML + CSS + JavaScript (Vanilla, sin frameworks)
- **Auth**: JWT en cookie `httpOnly` (SameSite=Lax)
- **Notificaciones**: Email (Nodemailer) + WhatsApp (Meta Cloud API o CallMeBot)

## 🚀 Instalación

```bash
# Clonar e instalar dependencias del backend
cd backend
npm install
cp .env.example .env  # ajustar según necesidad

# Iniciar el servidor
npm start
```

El servidor corre en `http://localhost:3000` y sirve el frontend estático desde `../gestor-turnos`.

## 🔑 Credenciales por defecto

| Usuario  | Email                | Password   |
|----------|----------------------|------------|
| Admin    | admin@empresa.com    | admin123   |

## 📋 Características

### Backend (API en `/api/*`)
| Endpoint | Descripción |
|---|---|
| `/api/auth/login` | Inicia sesión y fija cookie httpOnly |
| `/api/auth/logout` | Cierra sesión |
| `/api/auth/me` | Devuelve los datos del usuario autenticado |
| `/api/auth/usuarios` | CRUD de empleados (GET, POST, PUT, DELETE) |
| `/api/turnos` | CRUD de turnos + generación automática (`/generar`) |
| `/api/reglas` | Configuración del sistema (cupos, horarios, rotación) |
| `/api/historial` | Historial de cambios |
| `/api/solicitudes` | Solicitudes de cambio (crear, aprobar, rechazar) |
| `/api/descansos` | Días de descanso por empleado |
| `/api/notificaciones` | Notificaciones (GET, count, DELETE) |
| `/api/reportes/*` | Reportes con exportación CSV |

### Frontend
- **Dashboard**: Resumen de empleados, turnos de hoy, notificaciones
- **Calendario**: Vista semanal y mensual con generación automática
- **Empleados**: CRUD de empleados y horarios fijos
- **Reglas**: Configuración de cupos, horarios y rotación de domingos
- **Solicitudes**: Empleados solicitan cambios, admin aprob-rechaza
- **Mis turnos**: Vista de la semana actual con solicitud de cambios
- **Historial**: Registro de todas las acciones del sistema
- **Reportes**: Cobertura, empleados, áreas, solicitudes (con CSV)

## ⚙️ Configuración

Para preparar avisos manuales, activar WhatsApp en **Configuración**, elegir
**Mensaje preparado (envío manual)** y guardar. Se puede editar la plantilla
con `{nombre}`, `{fecha}`, `{horario}`, `{turno}` y `{empresa}`.
El teléfono del empleado debe incluir el código de país.

En Calendario, el botón de WhatsApp muestra el mensaje y un enlace para abrir
el chat. **Notificar turnos a todos** prepara los turnos del período visible,
incluyendo empleados fuera del filtro de búsqueda, e identifica contactos
faltantes. El administrador presiona Enviar en cada chat. El historial registra
la preparación, sin afirmar que el mensaje fue enviado o entregado.

El modo simple no envía WhatsApp desde la cola automática. La integración
automática existente queda disponible como modo separado, conservando su
configuración. Las respuestas por WhatsApp y el calendario por correo todavía
requieren las siguientes etapas de implementación.

Pruebas aisladas, sin mensajes reales:

```bash
node backend/scripts/whatsapp-simple-check.js
node backend/scripts/notifications-check.js
node backend/scripts/integration-check.js
node backend/scripts/ui-check.js
```

Las reglas de negocio se guardan en la tabla `reglas` de SQLite y se editan desde
la página **Reglas** (sin tocar código):

- Horarios de mañana y tarde
- Cupos mínimos y máximos por turno
- Mínimo de domingos al mes por empleado
- Rotación equitativa de domingos

## 🧪 Tests

```bash
# Smoke test (requiere el servidor corriendo en localhost:3000)
cd backend
node scripts/smoke.js
cat backend/_smoke.txt  # ver resultados
```

## 📁 Estructura del proyecto

```
gestor-de-turnos/
├── .gitignore
├── .env.example
├── README.md
├── gestor-turnos/                  # Frontend
│   ├── css/styles.css
│   ├── index.html                  # Dashboard
│   ├── js/
│   │   ├── api.js                  # Cliente REST + cookie httpOnly
│   │   ├── config.js               # Configuración del cliente
│   │   ├── dashboard.js
│   │   ├── calendario.js
│   │   ├── empleados.js
│   │   ├── reglas.js
│   │   ├── solicitudes.js
│   │   ├── mis-turnos.js
│   │   ├── historial.js
│   │   └── reportes.js             # Reportes + exportación CSV
│   └── pages/
│       ├── login.html
│       ├── calendario.html
│       ├── empleados.html
│       ├── reglas.html
│       ├── solicitudes.html
│       ├── mis-turnos.html
│       ├── historial.html
│       └── reportes.html
└── backend/                        # Backend
    ├── .env
    ├── server.js
    ├── db.js                       # SQLite + migraciones + seed
    ├── auth.js                     # JWT + cookies
    ├── routes/
    │   ├── auth.js
    │   ├── turnos.js
    │   ├── reglas.js
    │   ├── historial.js
    │   ├── solicitudes.js
    │   ├── descansos.js
    │   ├── notificaciones.js
    │   └── reportes.js
    ├── services/
    │   ├── config.js
    │   ├── generador.js            # Generación automática de turnos
    │   ├── email.js
    │   └── whatsapp.js
    ├── scripts/
    │   ├── smoke.js                # Smoke test
    │   ├── respaldo.js             # Backup de la BD
    │   └── clean_final.js          # Limpieza de temporales
    ├── gestor.db                   # Base de datos SQLite
    └── package.json
```

## 📝 Notas de desarrollo

- El sistema maneja **dos turnos**: mañana y tarde (no existe turno noche)
- Los empleados pueden tener **horario fijo** (siempre cubren su turno) o ser **flexibles**
- La generación automática respeta: horarios fijos, días de descanso, cupos mínimos/máximos y rotación de domingos
- Cada asignación de turno registra su **motivo** en el historial
- Las notificaciones se envían por email y/o WhatsApp (modo log sin configuración)
