/**
 * SQL Server 连接池（生产环境优化版）
 * 使用 mssql 驱动，支持连接池管理、自动重试、健康检查
 * 认证方式：Windows 身份认证 或 SQL Server 认证
 */
import sql from "mssql";

// ---------------------------------------------------------
// 基础配置
// ---------------------------------------------------------
const AUTH_MODE = process.env.SQL_SERVER_AUTH || "windows";
const SERVER_HOST = process.env.SQL_SERVER_HOST || "localhost";
const SERVER_PORT = Number.parseInt(process.env.SQL_SERVER_PORT || "1433", 10);
const DATABASE = process.env.SQL_SERVER_DATABASE || "BOS_System";
const INSTANCE_NAME = process.env.SQL_SERVER_INSTANCE || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ---------------------------------------------------------
// 连接池配置（生产环境调优）
// ---------------------------------------------------------
const POOL_MAX = Number.parseInt(process.env.DB_POOL_MAX || (IS_PRODUCTION ? "20" : "10"), 10);
const POOL_MIN = Number.parseInt(process.env.DB_POOL_MIN || (IS_PRODUCTION ? "2" : "0"), 10);
const POOL_IDLE_TIMEOUT = Number.parseInt(
  process.env.DB_POOL_IDLE_TIMEOUT || (IS_PRODUCTION ? "60000" : "30000"),
  10
);
const CONNECTION_TIMEOUT = Number.parseInt(
  process.env.DB_CONNECTION_TIMEOUT || (IS_PRODUCTION ? "15000" : "30000"),
  10
);
const REQUEST_TIMEOUT = Number.parseInt(
  process.env.DB_REQUEST_TIMEOUT || (IS_PRODUCTION ? "30000" : "60000"),
  10
);
const MAX_RETRIES = Number.parseInt(process.env.DB_MAX_RETRIES || "3", 10);
const RETRY_DELAY = Number.parseInt(process.env.DB_RETRY_DELAY || "1000", 10);

const baseOptions = {
  encrypt: process.env.SQL_SERVER_ENCRYPT === "true",
  trustServerCertificate: process.env.SQL_SERVER_TRUST_CERT !== "false",
  enableArithAbort: true,
  connectTimeout: CONNECTION_TIMEOUT,
  requestTimeout: REQUEST_TIMEOUT,
  cancelTimeout: REQUEST_TIMEOUT,
};

const config = {
  server: SERVER_HOST,
  port: SERVER_PORT,
  database: DATABASE,
  options: INSTANCE_NAME
    ? { ...baseOptions, instanceName: INSTANCE_NAME }
    : baseOptions,
  pool: {
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT,
    acquireTimeoutMillis: CONNECTION_TIMEOUT,
    createTimeoutMillis: CONNECTION_TIMEOUT,
    destroyTimeoutMillis: 5000,
    createRetryIntervalMillis: 500,
  },
};

if (AUTH_MODE === "windows") {
  config.options.trustedConnection = true;
} else {
  config.user = process.env.SQL_SERVER_USER || "sa";
  config.password = process.env.SQL_SERVER_PASSWORD || "";
}

// ---------------------------------------------------------
// 连接池管理 + 自动重试
// ---------------------------------------------------------
let poolPromise = null;
let poolInitialized = false;
let initializing = false;

export const isSqlServerConfigured = Boolean(
  process.env.SQL_SERVER_HOST &&
    process.env.SQL_SERVER_DATABASE &&
    (AUTH_MODE === "windows" || (process.env.SQL_SERVER_USER && process.env.SQL_SERVER_PASSWORD))
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPoolWithRetry() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const pool = await sql.connect(config);
      // 验证连接
      await pool.request().query("SELECT 1 as test");
      console.log(
        `[SQL Server] 连接池初始化成功 (pool: ${POOL_MIN}-${POOL_MAX}, 第 ${attempt} 次尝试)`
      );
      return pool;
    } catch (error) {
      lastError = error;
      console.warn(
        `[SQL Server] 连接失败 (第 ${attempt}/${MAX_RETRIES} 次): ${error.message}`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * attempt); // 指数退避
      }
    }
  }

  console.error("[SQL Server] 连接池初始化失败，已达到最大重试次数");
  throw lastError;
}

export async function getPool() {
  if (!isSqlServerConfigured) {
    throw new Error("SQL Server 未配置，请检查环境变量");
  }

  if (poolPromise && poolInitialized) {
    return poolPromise;
  }

  if (initializing) {
    // 另一个请求正在初始化，等待它完成
    while (initializing) {
      await sleep(100);
      if (poolPromise && poolInitialized) return poolPromise;
    }
  }

  initializing = true;
  try {
    poolPromise = await createPoolWithRetry();
    poolInitialized = true;
    return poolPromise;
  } catch (error) {
    poolInitialized = false;
    poolPromise = null;
    throw error;
  } finally {
    initializing = false;
  }
}

// ---------------------------------------------------------
// 健康检查
// ---------------------------------------------------------
export async function checkHealth() {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        @@VERSION as version,
        DB_NAME() as databaseName,
        (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE database_id = DB_ID()) as activeConnections,
        GETDATE() as serverTime
    `);
    return {
      status: "healthy",
      version: result.recordset[0].version,
      database: result.recordset[0].databaseName,
      activeConnections: result.recordset[0].activeConnections,
      serverTime: result.recordset[0].serverTime,
      poolSize: { min: POOL_MIN, max: POOL_MAX },
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
}

// ---------------------------------------------------------
// 连接池管理
// ---------------------------------------------------------
export async function closePool() {
  if (poolPromise) {
    try {
      await poolPromise.close();
    } catch (e) {
      console.warn("[SQL Server] 关闭连接池时出错:", e.message);
    }
    poolPromise = null;
    poolInitialized = false;
    console.log("[SQL Server] 连接池已关闭");
  }
}

// 进程退出时关闭连接池
process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closePool();
  process.exit(0);
});

// ---------------------------------------------------------
// 便捷查询方法（带自动重试）
// ---------------------------------------------------------
export async function query(sqlText, params = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const pool = await getPool();
      const request = pool.request();

      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          request.input(key, sql.NVarChar, null);
        } else if (typeof value === "number") {
          request.input(key, sql.Int, value);
        } else if (typeof value === "boolean") {
          request.input(key, sql.Bit, value);
        } else if (value instanceof Date) {
          request.input(key, sql.DateTimeOffset, value);
        } else {
          request.input(key, sql.NVarChar, String(value));
        }
      });

      const result = await request.query(sqlText);
      return result.recordset;
    } catch (error) {
      lastError = error;
      // 连接错误时重试
      const isConnectionError =
        error.code === "ETIMEOUT" ||
        error.code === "ECONNRESET" ||
        error.code === "ESOCKET" ||
        (error.message && /connection/i.test(error.message)) ||
        (error.message && /socket/i.test(error.message));

      if (isConnectionError && attempt < MAX_RETRIES) {
        console.warn(`[SQL Server] 查询失败，第 ${attempt} 次重试: ${error.message}`);
        // 重置连接池
        poolInitialized = false;
        poolPromise = null;
        await sleep(RETRY_DELAY * attempt);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

export async function executeStoredProcedure(procName, params = {}) {
  const pool = await getPool();
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });

  const result = await request.execute(procName);
  return result.recordset;
}

export { sql };
