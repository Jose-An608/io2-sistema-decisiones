# Despliegue en Render

Render aloja la aplicación Node.js, pero **no ofrece SQL Server**. La base de datos debe estar en un SQL Server accesible desde internet; la opción gratuita recomendada es **Azure SQL Database** (oferta gratuita de base serverless, o créditos de *Azure for Students*).

## 1. Crear la base de datos en Azure SQL

1. En el [portal de Azure](https://portal.azure.com) crear un recurso **SQL Database**.
2. Crear un **servidor nuevo** con autenticación **SQL** (anotar usuario administrador y contraseña) y nombrar la base **`IO2_Sistema`**.
3. Si aparece la oferta gratuita (*Apply free offer*), activarla; usar el nivel *serverless* con pausa automática.
4. En **Networking** del servidor:
   - Permitir el acceso a servicios de Azure (*Allow Azure services and resources to access this server*).
   - Agregar una regla de firewall para que Render pueda conectarse. Render usa IP de salida variables en el plan gratuito, por lo que lo práctico es permitir el rango `0.0.0.0 – 255.255.255.255` **solo para este proyecto académico** y proteger el acceso con una contraseña fuerte. Para algo más serio, usar el plan de pago de Render con IP de salida fijas.
5. Conectarse con SSMS (servidor `NOMBRE.database.windows.net`, autenticación de SQL Server, base `IO2_Sistema`) y ejecutar **`database/cloud_todo_en_uno.sql`**. Equivale a los scripts 01, 02, 03 y 99 sin las instrucciones `USE`, que Azure no admite entre bases.

## 2. Subir el código a GitHub

El repositorio debe tener `render.yaml`, `package.json` y la carpeta `backend/`. El archivo `.env` **no** se sube (está en `.gitignore`).

## 3. Crear el servicio en Render

**Opción A — Blueprint (recomendada):**
1. En Render: **New → Blueprint** y elegir el repositorio.
2. Render lee `render.yaml`. Completar las variables que pide: `DB_SERVER`, `DB_USER`, `DB_PASS`.

**Opción B — manual:** **New → Web Service**, repositorio, y configurar:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm ci --omit=optional` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Variables de entorno:

| Variable | Valor |
|---|---|
| `DB_AUTH` | `sql` |
| `DB_SERVER` | `NOMBRE.database.windows.net` |
| `DB_NAME` | `IO2_Sistema` |
| `DB_USER` / `DB_PASS` | credenciales del paso 1 |
| `DB_PORT` | `1433` |
| `DB_ENCRYPT` | `true` |
| `NODE_VERSION` | `22` |

`PORT` lo asigna Render automáticamente.

## 4. Comprobar

Abrir `https://TU-SERVICIO.onrender.com/api/health`; debe responder `{"ok":true,...}`. Luego abrir la raíz del sitio.

## Notas

- **Primera carga lenta:** el plan gratuito de Render se suspende tras 15 minutos sin tráfico y Azure serverless también se pausa; la primera petición puede tardar hasta 1–2 minutos. El sistema usa un tiempo de espera de 60 s para ello.
- **Autenticación de Windows:** solo aplica en local. En la nube se usa siempre `DB_AUTH=sql`; por eso se instala con `--omit=optional` (evita compilar `msnodesqlv8`).
- **Seguridad:** la aplicación no tiene inicio de sesión; cualquiera con el enlace puede modificar los datos. Para la exposición basta; para uso real agregar autenticación.
- **Gráficos:** usan Chart.js desde cdnjs; el navegador necesita internet.
