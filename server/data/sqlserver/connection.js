/**
 * SQL Server 连接池
 * 使用 mssql 驱动，支持连接池管理
 * 认证方式：Windows 身份认证（默认）或 SQL Server 认证
 */
import sql from "mssql";

const AUTH_MODE = process.env.SQL_SERVER_AUTH || "windows";
const SERVER_HOST = process.env.SQL_SERVER_HOST || "localhost";
const SERVER_PORT = Number.parseInt(process.env.SQL_SERVER_PORT || "1433", 10);
const DATABASE = process.env.SQL_SERVER_DATABASE || "BOS_System";
const INSTANCE_NAME = process.env.SQL_SERVER_INSTANCE || "";

const baseOptions = {
  encrypt: process.env.SQL_SERVER_ENCRYPT === "true",
  trustServerCertificate: process.env.SQL_SERVER_TRUST_CERT !== "false",
  enableArithAbort: true,
};

const config = {
  server: SERVER_HOST,
  port: SERVER_PORT,
  database: DATABASE,
  options: INSTANCE_NAME
    ? { ...baseOptions, instanceName: INSTANCE_NAME }
    : baseOptions,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

if (AUTH_MODE === "windows") {
  config.options.trustedConnection = true;
} else {
  config.user = process.env.SQL_SERVER_USER || "sa";
  config.password = process.env.SQL_SERVER_PASSWORD || "";
}

let poolPromise = null;
let poolInitialized = false;

export const isSqlServerConfigured = Boolean(
  process.env.SQL_SERVER_HOST &&
    process.env.SQL_SERVER_DATABASE &&
    (AUTH_MODE === "windows" || (process.env.SQL_SERVER_USER && process.env.SQL_SERVER_PASSWORD))
);

export async function getPool() {
  if (!isSqlServerConfigured) {
    throw new Error("SQL Server 未配置，请检查环境变量");
  }

  if (poolPromise && poolInitialized) {
    return poolPromise;
  }

  try {
    poolPromise = await sql.connect(config);
    poolInitialized = true;
    console.log("[SQL Server] 连接池初始化成功");
    return poolPromise;
  } catch (error) {
    poolInitialized = false;
    poolPromise = null;
    console.error("[SQL Server] 连接池初始化失败:", error.message);
    throw error;
  }
}

export async function closePool() {
  if (poolPromise) {
    await poolPromise.close();
    poolPromise = null;
    poolInitialized = false;
    console.log("[SQL Server] 连接池已关闭");
  }
}

export async function query(sqlText, params = {}) {
  const pool = await getPool();
  const request = pool.request();

  // 添加参数
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
