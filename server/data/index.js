/**
 * 数据源工厂
 * 支持在 Supabase 和 SQL Server 之间切换
 * 通过 DATA_SOURCE 环境变量控制：'supabase' | 'sqlserver'
 */
import { isSqlServerConfigured } from "./sqlserver/connection.js";
import { userRepository } from "./sqlserver/userRepository.js";
import { enrolledStudentRepository } from "./sqlserver/enrolledStudentRepository.js";
import { hardshipStudentRepository } from "./sqlserver/hardshipStudentRepository.js";
import { collegeBatchRepository } from "./sqlserver/collegeBatchRepository.js";
import { awardBatchRepository } from "./sqlserver/awardBatchRepository.js";

const dataSourceType = process.env.DATA_SOURCE || "supabase";

const sqlServerRepos = {
  type: "sqlserver",
  user: userRepository,
  enrolledStudent: enrolledStudentRepository,
  hardshipStudent: hardshipStudentRepository,
  collegeBatch: collegeBatchRepository,
  awardBatch: awardBatchRepository,
};

// Supabase Repository 占位（实际项目中接入现有 supabaseDataService）
const supabaseRepos = {
  type: "supabase",
  // 这里可以包装现有的 supabaseDataService 函数
  // 保持与 sqlserver 相同的接口签名
};

export function getDataRepository() {
  if (dataSourceType === "sqlserver" && isSqlServerConfigured) {
    console.log(`[DataSource] 使用 SQL Server 数据源`);
    return sqlServerRepos;
  }

  console.log(`[DataSource] 使用 Supabase 数据源`);
  return supabaseRepos;
}

export const currentDataSource = dataSourceType;
export { isSqlServerConfigured };
