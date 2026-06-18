import { awardTypeLabels, awardTypes } from "../../services/awardConfig";
import type { AwardType } from "../../types/award";
import "./awards.css";

const awardPaths: Record<AwardType, string> = {
  national: "/college/awards/national",
  inspirational: "/college/awards/inspirational",
  shanghai: "/college/awards/shanghai",
};

const awardDescriptions: Record<AwardType, string> = {
  national: "处理国家奖学金官方申请档案，执行排名、课程、申请理由、日期和院系意见等校验。",
  inspirational: "处理国家励志奖学金申请数据，保留现有励志奖学金专项规则和模板字段要求。",
  shanghai: "处理上海市奖学金官方申请档案，独立识别模板，避免与国家奖学金混判。",
};

export default function AwardsHomePage() {
  return (
    <section className="bos-table-page award-workspace">
      <div className="bos-page-title-row">
        <div>
          <div className="bos-breadcrumb">三大奖业务 / 学院端</div>
          <h1>选择奖项</h1>
          <p>请选择本次要处理的奖项。三个奖项使用独立模板识别、治理结果和上载数据池。</p>
        </div>
        <span className="bos-layout-active">AI Studio 工作台已接入</span>
      </div>

      <div className="award-selection-grid">
        {awardTypes.map((awardType, index) => (
          <article className="award-selection-card" key={awardType}>
            <div className="award-selection-icon">{["国", "励", "沪"][index]}</div>
            <div>
              <span>AWARD DATA GOVERNANCE</span>
              <h2>{awardTypeLabels[awardType]}</h2>
              <p>{awardDescriptions[awardType]}</p>
            </div>
            <ul>
              <li>Excel 弹窗导入与官方 Sheet 优先识别</li>
              <li>通过 / 不通过 / 问题分析弹窗</li>
              <li>学院确认后上载学校端</li>
            </ul>
            <a href={awardPaths[awardType]}>进入数据处理</a>
          </article>
        ))}
      </div>

      <div className="award-admin-note">
        三大奖数据当前暂存本地 localStorage，后续接入 Supabase；困难生业务数据与页面不受影响。
      </div>
    </section>
  );
}
