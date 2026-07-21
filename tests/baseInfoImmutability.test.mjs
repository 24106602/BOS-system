import test from "node:test";
import assert from "node:assert/strict";
import {
  COUNSELOR_IMMUTABLE_FIELDS,
  DEPARTMENT_IMMUTABLE_FIELDS,
  assertImmutableFieldsUnchanged,
  disableDepartment,
  normalizeCounselorImportRow,
  normalizeDepartmentImportRow,
  renameDepartment,
  restoreDepartment,
} from "../server/baseInfoService.js";

test("院系不可变字段在普通编辑中被明确拒绝", () => {
  const current = {
    department_name: "理学院",
    contact_phone: "13800138000",
    login_account: "science@bos.local",
    sort_order: 2,
    school_name: "上海应用技术大学",
  };
  assert.throws(
    () => assertImmutableFieldsUnchanged(current, { sort_order: 3 }, DEPARTMENT_IMMUTABLE_FIELDS),
    (error) => error.code === "IMMUTABLE_FIELD" && error.message === "字段“排序号”不可修改，请删除后重新导入"
  );
  assert.doesNotThrow(() => assertImmutableFieldsUnchanged(
    current,
    { login_account: "SCIENCE@BOS.LOCAL" },
    DEPARTMENT_IMMUTABLE_FIELDS
  ));
});

test("辅导员手机号和登录账号不能通过 update 修改", () => {
  const current = {
    auth_user_id: "auth-1",
    role: "college",
    college_name: "理学院",
    phone: "13800138000",
    login_email: "teacher@bos.local",
    sort_order: 1,
  };
  assert.throws(
    () => assertImmutableFieldsUnchanged(current, { phone: "13900139000" }, COUNSELOR_IMMUTABLE_FIELDS),
    /字段“手机号”不可修改，请删除后重新导入/
  );
});

test("院系与辅导员导入规则规范化关联字段", () => {
  const department = normalizeDepartmentImportRow({
    department_name: " 理学院 ",
    contact_phone: "138-0013-8000",
    login_account: "SCIENCE@BOS.LOCAL",
    sort_order: "2",
  });
  assert.equal(department.department_name, "理学院");
  assert.equal(department.contact_phone, "13800138000");
  assert.equal(department.login_account, "science@bos.local");
  assert.equal(department.status, "active");

  const counselor = normalizeCounselorImportRow({
    display_name: "张老师",
    college_name: "理学院",
    phone: "139 0013 9000",
    login_email: "TEACHER@BOS.LOCAL",
    sort_order: "3",
  });
  assert.equal(counselor.phone, "13900139000");
  assert.equal(counselor.login_email, "teacher@bos.local");
});

test("院系删除仅写入 disabled 状态，不调用物理 delete", async () => {
  const updates = [];
  let deleteCalled = false;
  const current = {
    id: "department-1",
    department_name: "理学院",
    status: "active",
  };
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: current, error: null }) };
            },
          };
        },
        update(payload) {
          updates.push(payload);
          return {
            eq() {
              return {
                select() {
                  return { maybeSingle: async () => ({ data: { ...current, ...payload }, error: null }) };
                },
              };
            },
          };
        },
        delete() {
          deleteCalled = true;
        },
      };
    },
  };

  await disableDepartment(admin, { role: "admin" }, current.id);
  assert.deepEqual(updates, [{ status: "disabled" }]);
  assert.equal(deleteCalled, false);
});

test("院系恢复只将 disabled 改回 active", async () => {
  const updates = [];
  const current = { id: "department-2", department_name: "材料学院", status: "disabled" };
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: current, error: null }) };
            },
          };
        },
        update(payload) {
          updates.push(payload);
          return {
            eq() {
              return {
                select() {
                  return { maybeSingle: async () => ({ data: { ...current, ...payload }, error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
  const restored = await restoreDepartment(admin, { role: "admin" }, current.id);
  assert.deepEqual(updates, [{ status: "active" }]);
  assert.equal(restored.status, "active");
});

test("院系更名调用禁用旧记录并新建记录的事务 RPC", async () => {
  const current = {
    id: "department-3",
    department_name: "原学院",
    school_name: "上海应用技术大学",
    department_type: "本科",
    login_account: "old@bos.local",
    sort_order: 8,
    status: "active",
  };
  const rpcCalls = [];
  const admin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: current, error: null }) };
            },
          };
        },
      };
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return {
        data: [{ ...current, id: "department-new", department_name: "新学院" }],
        error: null,
      };
    },
  };
  const renamed = await renameDepartment(
    admin,
    { role: "admin" },
    current.id,
    { department_name: "新学院" }
  );
  assert.equal(renamed.department_name, "新学院");
  assert.equal(rpcCalls[0].name, "replace_department_for_rename");
  assert.equal(rpcCalls[0].params.p_department_id, current.id);
});
