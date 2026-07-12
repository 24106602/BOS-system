import type { CSSProperties } from "react";
import PageHeader from "../../components/ui/PageHeader";

type AdminDifficultyGuidePageProps = {
  onNavigate?: (to: string) => void;
};

export default function AdminDifficultyGuidePage({ onNavigate }: AdminDifficultyGuidePageProps) {
  return (
    <section className="bos-page-stack">
      <PageHeader
        breadcrumb="困难生业务 / 业务手册"
        title="困难生业务操作手册"
        description="详细说明困难生业务的完整流程、操作步骤和注意事项"
        actions={<span className="bos-status-badge">帮助文档</span>}
      />

      <div style={styles.container}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>一、业务概述</h2>
          <div style={styles.card}>
            <p style={styles.paragraph}>
              困难生业务是学校资助工作的重要组成部分，用于收集、审核和汇总全校困难生的本专科信息和家庭成员信息，为助学金评定、困难认定等工作提供数据支撑。
            </p>
            <div style={styles.featureList}>
              <div style={styles.featureItem}>
                <span style={styles.featureIcon}>📋</span>
                <div>
                  <strong>本专科信息</strong>
                  <p>包含学生基本信息、困难等级认定、特殊困难类型等</p>
                </div>
              </div>
              <div style={styles.featureItem}>
                <span style={styles.featureIcon}>👨‍👩‍👧‍👦</span>
                <div>
                  <strong>家庭成员信息</strong>
                  <p>包含家庭成员姓名、关系、职业、收入等</p>
                </div>
              </div>
              <div style={styles.featureItem}>
                <span style={styles.featureIcon}>🔗</span>
                <div>
                  <strong>数据关联</strong>
                  <p>按身份证号自动关联本专科信息与家庭成员信息</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>二、业务流程</h2>
          <div style={styles.flowChart}>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>1</div>
              <div style={styles.flowContent}>
                <strong>配置在校生数据库</strong>
                <p>学校管理员在「在校生数据库」中导入全校在校生基础信息，用于后续数据校验。</p>
              </div>
            </div>
            <div style={styles.flowArrow}>→</div>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>2</div>
              <div style={styles.flowContent}>
                <strong>学院端导入数据</strong>
                <p>各学院登录学院端，分别上传「本专科信息」和「家庭成员信息」Excel文件。</p>
              </div>
            </div>
            <div style={styles.flowArrow}>→</div>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>3</div>
              <div style={styles.flowContent}>
                <strong>数据校验与治理</strong>
                <p>系统自动校验数据格式、在校身份、必填字段等，标记异常数据供学院修正。</p>
              </div>
            </div>
            <div style={styles.flowArrow}>→</div>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>4</div>
              <div style={styles.flowContent}>
                <strong>学院确认审核</strong>
                <p>学院核对校验结果，确认无误后提交审核。</p>
              </div>
            </div>
            <div style={styles.flowArrow}>→</div>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>5</div>
              <div style={styles.flowContent}>
                <strong>上载学校端</strong>
                <p>审核通过后，数据自动上载至学校端数据库。</p>
              </div>
            </div>
            <div style={styles.flowArrow}>→</div>
            <div style={styles.flowStep}>
              <div style={styles.flowNumber}>6</div>
              <div style={styles.flowContent}>
                <strong>学校端汇总统计</strong>
                <p>学校管理员查看各学院上传情况，导出汇总数据。</p>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>三、页面功能说明</h2>
          <div style={styles.pageCards}>
            <div style={styles.pageCard} onClick={() => onNavigate?.("/admin/difficulty/student")}>
              <div style={styles.pageIcon}>本</div>
              <div>
                <strong>本专科信息管理</strong>
                <p>查看各学院上传的本专科信息，支持筛选、导出</p>
              </div>
              <span style={styles.pageLink}>进入 →</span>
            </div>
            <div style={styles.pageCard} onClick={() => onNavigate?.("/admin/difficulty/family")}>
              <div style={styles.pageIcon}>家</div>
              <div>
                <strong>家庭成员信息管理</strong>
                <p>查看各学院上传的家庭成员信息，支持筛选、导出</p>
              </div>
              <span style={styles.pageLink}>进入 →</span>
            </div>
            <div style={styles.pageCard} onClick={() => onNavigate?.("/admin/difficulty/database")}>
              <div style={styles.pageIcon}>库</div>
              <div>
                <strong>困难生数据库</strong>
                <p>查看合并后的困难生明细，包含个人信息和家庭成员关联</p>
              </div>
              <span style={styles.pageLink}>进入 →</span>
            </div>
            <div style={styles.pageCard} onClick={() => onNavigate?.("/admin/enrolled")}>
              <div style={styles.pageIcon}>在</div>
              <div>
                <strong>在校生数据库</strong>
                <p>维护全校在校生基础信息，用于数据校验</p>
              </div>
              <span style={styles.pageLink}>进入 →</span>
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>四、数据模板说明</h2>
          <div style={styles.card}>
            <h3 style={styles.subTitle}>本专科信息模板字段</h3>
            <table style={styles.templateTable}>
              <thead>
                <tr>
                  <th style={styles.templateTh}>字段名称</th>
                  <th style={styles.templateTh}>是否必填</th>
                  <th style={styles.templateTh}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={styles.templateTd}>学号</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>学生学号</td></tr>
                <tr><td style={styles.templateTd}>姓名</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>学生姓名</td></tr>
                <tr><td style={styles.templateTd}>身份证号</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>18位身份证号</td></tr>
                <tr><td style={styles.templateTd}>年级</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>学生年级</td></tr>
                <tr><td style={styles.templateTd}>性别</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>男/女</td></tr>
                <tr><td style={styles.templateTd}>学院</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>所属学院</td></tr>
                <tr><td style={styles.templateTd}>专业</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>专业名称</td></tr>
                <tr><td style={styles.templateTd}>班级</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>行政班</td></tr>
                <tr><td style={styles.templateTd}>困难等级</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>一般困难/困难/特殊困难</td></tr>
                <tr><td style={styles.templateTd}>特殊困难类型</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>低保、孤儿、残疾等</td></tr>
              </tbody>
            </table>
          </div>
          <div style={styles.card}>
            <h3 style={styles.subTitle}>家庭成员信息模板字段</h3>
            <table style={styles.templateTable}>
              <thead>
                <tr>
                  <th style={styles.templateTh}>字段名称</th>
                  <th style={styles.templateTh}>是否必填</th>
                  <th style={styles.templateTh}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={styles.templateTd}>学生身份证号</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>用于关联本专科信息</td></tr>
                <tr><td style={styles.templateTd}>家庭成员姓名</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>家庭成员姓名</td></tr>
                <tr><td style={styles.templateTd}>与学生关系</td><td style={styles.templateTd}>是</td><td style={styles.templateTd}>父亲、母亲、兄弟姐妹等</td></tr>
                <tr><td style={styles.templateTd}>年龄</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>家庭成员年龄</td></tr>
                <tr><td style={styles.templateTd}>职业</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>职业名称</td></tr>
                <tr><td style={styles.templateTd}>年收入</td><td style={styles.templateTd}>否</td><td style={styles.templateTd}>年总收入（元）</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>五、注意事项</h2>
          <div style={styles.card}>
            <ul style={styles.noteList}>
              <li><strong>在校身份校验</strong>：上传数据时系统会自动校验学生是否在「在校生数据库」中，不在库中的学生将标记为异常。</li>
              <li><strong>身份证号关联</strong>：家庭成员信息通过学生身份证号与本专科信息关联，请确保身份证号准确无误。</li>
              <li><strong>数据防重</strong>：同一学院同一学年的相同数据不会重复上载，如需更新请修改后重新上传。</li>
              <li><strong>导出格式</strong>：支持导出为Excel格式，便于后续数据分析和打印。</li>
              <li><strong>权限控制</strong>：学校管理员可查看全校数据，学院管理员仅能查看本学院数据。</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  section: {
    background: "#fff",
    border: "1px solid #d7e1ed",
    borderRadius: 8,
    padding: 20,
  },
  sectionTitle: {
    margin: "0 0 16px",
    color: "#172033",
    fontSize: 18,
    fontWeight: 600,
    borderBottom: "2px solid #0077d4",
    paddingBottom: 8,
  },
  card: {
    background: "#f8fafc",
    borderRadius: 6,
    padding: 16,
  },
  paragraph: {
    color: "#63738a",
    fontSize: 14,
    lineHeight: 1.7,
    margin: "0 0 16px",
  },
  featureList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  featureItem: {
    display: "flex",
    gap: 10,
    padding: 12,
    background: "#fff",
    borderRadius: 6,
    border: "1px solid #e2e8f0",
  },
  featureIcon: {
    fontSize: 24,
    flexShrink: 0,
  },
  flowChart: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  flowStep: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  flowNumber: {
    width: 32,
    height: 32,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 50,
    background: "#0077d4",
    color: "#fff",
    fontWeight: 800,
    flexShrink: 0,
  },
  flowContent: {
    flex: 1,
  },
  flowArrow: {
    textAlign: "center",
    color: "#909399",
    fontSize: 20,
  },
  pageCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 12,
  },
  pageCard: {
    display: "flex",
    gap: 12,
    padding: 16,
    background: "#f8fafc",
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  pageIcon: {
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    background: "#0077d4",
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    flexShrink: 0,
  },
  pageLink: {
    color: "#0077d4",
    fontWeight: 600,
    marginLeft: "auto",
  },
  subTitle: {
    margin: "0 0 12px",
    color: "#374151",
    fontSize: 16,
    fontWeight: 600,
  },
  templateTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  templateTh: {
    background: "#edf4fa",
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  templateTd: {
    border: "1px solid #cbd5e1",
    padding: "8px 12px",
    textAlign: "left",
  },
  noteList: {
    margin: 0,
    paddingLeft: 20,
    color: "#63738a",
    fontSize: 14,
    lineHeight: 2,
  },
};
