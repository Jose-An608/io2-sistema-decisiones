// =====================================================
// Conexión a SQL Server (pool único compartido)
// Soporta autenticación de Windows (DB_AUTH=windows) y de SQL (DB_AUTH=sql)
// =====================================================
require('dotenv').config();

const modoWindows = (process.env.DB_AUTH || 'windows').toLowerCase() === 'windows';

// La autenticación de Windows necesita el driver nativo msnodesqlv8
let sql;
try {
  sql = modoWindows ? require('mssql/msnodesqlv8') : require('mssql');
} catch (err) {
  console.error('No se pudo cargar el driver de SQL Server:', err.message);
  if (modoWindows) {
    console.error('Instala msnodesqlv8 (npm install msnodesqlv8) o usa DB_AUTH=sql en el .env');
  }
  process.exit(1);
}

const servidor = process.env.DB_SERVER || 'localhost';
const baseDatos = process.env.DB_NAME || 'IO2_Sistema';

let config;
if (modoWindows) {
  const driver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';
  config = {
    connectionString:
      `Driver={${driver}};Server=${servidor};Database=${baseDatos};` +
      'Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  };
} else {
  config = {
    server: servidor,
    database: baseDatos,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    port: Number(process.env.DB_PORT) || 1433,
    // En la nube (Azure SQL) la conexión debe ir cifrada
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'true').toLowerCase() !== 'false',
      trustServerCertificate: (process.env.DB_TRUST_CERT || 'true').toLowerCase() !== 'false',
    },
    // Azure SQL serverless se pausa por inactividad: la primera conexión puede tardar ~1 minuto
    connectionTimeout: 60000,
    requestTimeout: 60000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

let poolPromise = null;

// Devuelve el pool (lo crea la primera vez). Si falla, permite reintentar.
function getPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(config);
    // Un error en el pool (por ejemplo, Azure corta la conexión al pausar la BD)
    // no debe tumbar el servidor: se registra y se vuelve a conectar en la siguiente petición.
    pool.on('error', (err) => {
      console.error('Error del pool de conexiones:', err.message);
      poolPromise = null;
    });
    poolPromise = pool
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
