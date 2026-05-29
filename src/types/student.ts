// 困难生基础库数据类型：定义本地数据库中每个学生记录的字段。
export type StudentRecord = {
  key: string;
  studentId: string;
  name: string;
  idCard: string;
  college: string;
  major: string;
  className: string;
  hardshipLevel: string;
  year: string;
  specialType: string;
  remark: string;
  sourceFile: string;
  importedAt: string;
};
