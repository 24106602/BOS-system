/**
 * 数据服务层 - 通过后端 API
 *
 * Supabase 已移除，此文件现在重新导出 apiDataService 的所有接口，
 * 保持向后兼容。
 */
export {
  isApiDataSource,
  fetchEnrolledStudents,
  saveEnrolledStudentsToCloud,
  addEnrolledStudentsToCloud,
  clearEnrolledStudentsFromCloud,
  verifyEnrolledStudentFromCloud,
  fetchHardshipStudents,
  saveHardshipStudentsToCloud,
  mergeHardshipStudentsToCloud,
  clearHardshipStudentsFromCloud,
  findHardshipStudentFromCloud,
  fetchCollegeBatches,
  saveCollegeBatchToCloud,
  deleteCollegeBatchFromCloud,
  clearCollegeBatchesFromCloud,
  restoreCollegeBatchFromCloud,
} from "./apiDataService";
