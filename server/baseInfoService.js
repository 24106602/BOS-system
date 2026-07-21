const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLocaleLowerCase("zh-CN");
const nullableText = (value) => text(value) || null;

export const DEPARTMENT_IMMUTABLE_FIELDS = Object.freeze({
  school_name: "学校名称",
  department_name: "院系名称",
  contact_phone: "联系电话",
  login_account: "登录账号",
  sort_order: "排序号",
});

export const COUNSELOR_IMMUTABLE_FIELDS = Object.freeze({
  auth_user_id: "认证用户",
  role: "账号角色",
  college_name: "所属院系",
  phone: "手机号",
  login_email: "登录账号",
  sort_order: "排序号",
});

const DEPARTMENT_EDITABLE_FIELDS = Object.freeze([
  "department_type",
  "contact_person",
  "contact_address",
  "contact_postcode",
  "contact_fax",
]);

const COUNSELOR_EDITABLE_FIELDS = Object.freeze(["display_name"]);

export class BaseInfoError extends Error {
  constructor(message, statusCode = 400, code = "BASE_INFO_ERROR") {
    super(message);
    this.name = "BaseInfoError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const comparableValue = (field, value) => {
  if (field === "sort_order") return Number(value || 0);
  if (field === "contact_phone" || field === "phone") return text(value).replace(/\D/g, "");
  if (field === "login_account" || field === "login_email") return lower(value);
  return text(value);
};

export const assertImmutableFieldsUnchanged = (current, input, immutableFields) => {
  for (const [field, label] of Object.entries(immutableFields)) {
    if (!Object.hasOwn(input || {}, field)) continue;
    if (comparableValue(field, current?.[field]) !== comparableValue(field, input?.[field])) {
      throw new BaseInfoError(
        `字段“${label}”不可修改，请删除后重新导入`,
        400,
        "IMMUTABLE_FIELD"
      );
    }
  }
};

const pickFields = (input, fields) => Object.fromEntries(
  fields
    .filter((field) => Object.hasOwn(input || {}, field))
    .map((field) => [field, nullableText(input[field])])
);

const requireAdmin = (profile) => {
  if (profile?.role !== "admin") {
    throw new BaseInfoError("仅学校管理员可维护院系和辅导员信息", 403, "FORBIDDEN");
  }
};

const translateDatabaseError = (error) => {
  const message = text(error?.message || error);
  if (/不可修改，请删除后重新导入/.test(message)) {
    return new BaseInfoError(message, 400, "IMMUTABLE_FIELD");
  }
  if (error?.code === "23505" || /duplicate key|unique constraint/i.test(message)) {
    return new BaseInfoError("导入数据与现有启用记录冲突，请检查院系、手机号、登录账号或排序号", 409, "DUPLICATE_RECORD");
  }
  if (error?.code === "23514") {
    return new BaseInfoError("导入数据格式不符合要求，请检查手机号和排序号", 400, "INVALID_DATA");
  }
  return error;
};

const ensureDepartment = async (admin, id) => {
  const { data, error } = await admin.from("departments").select("*").eq("id", id).maybeSingle();
  if (error) throw translateDatabaseError(error);
  if (!data) throw new BaseInfoError("院系记录不存在", 404, "NOT_FOUND");
  return data;
};

const ensureCounselor = async (admin, id) => {
  const { data, error } = await admin
    .from("user_profiles")
    .select("id,auth_user_id,role,college_name,display_name,login_email,phone,sort_order,enabled,created_at,updated_at")
    .eq("id", id)
    .eq("role", "college")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  if (!data) throw new BaseInfoError("辅导员账号记录不存在", 404, "NOT_FOUND");
  return data;
};

export const listDepartments = async (admin, profile, { includeDisabled = false } = {}) => {
  requireAdmin(profile);
  let query = admin
    .from("departments")
    .select("*")
    .order("status", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!includeDisabled) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw translateDatabaseError(error);
  return data || [];
};

export const updateDepartment = async (admin, profile, id, input) => {
  requireAdmin(profile);
  const current = await ensureDepartment(admin, id);
  if (current.status === "disabled") {
    throw new BaseInfoError("已禁用院系不可编辑，请先恢复记录", 409, "RECORD_DISABLED");
  }
  assertImmutableFieldsUnchanged(current, input || {}, DEPARTMENT_IMMUTABLE_FIELDS);
  const changes = pickFields(input, DEPARTMENT_EDITABLE_FIELDS);
  if (Object.keys(changes).length === 0) return current;
  const { data, error } = await admin
    .from("departments")
    .update(changes)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  if (!data) throw new BaseInfoError("院系记录不存在", 404, "NOT_FOUND");
  return data;
};

export const disableDepartment = async (admin, profile, id) => {
  requireAdmin(profile);
  const current = await ensureDepartment(admin, id);
  if (current.status === "disabled") return current;
  const { data, error } = await admin
    .from("departments")
    .update({ status: "disabled" })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  return data;
};

export const restoreDepartment = async (admin, profile, id) => {
  requireAdmin(profile);
  const current = await ensureDepartment(admin, id);
  if (current.status === "active") return current;
  const { data, error } = await admin
    .from("departments")
    .update({ status: "active" })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  return data;
};

export const renameDepartment = async (admin, profile, id, input) => {
  requireAdmin(profile);
  const current = await ensureDepartment(admin, id);
  if (current.status === "disabled") {
    throw new BaseInfoError("已禁用院系不能更名，请先恢复记录", 409, "RECORD_DISABLED");
  }
  const departmentName = text(input?.department_name);
  if (!departmentName) {
    throw new BaseInfoError("新院系名称不能为空", 400, "INVALID_REQUEST");
  }
  const { data, error } = await admin.rpc("replace_department_for_rename", {
    p_department_id: id,
    p_payload: {
      ...current,
      ...input,
      department_name: departmentName,
    },
  });
  if (error) throw translateDatabaseError(error);
  const renamed = Array.isArray(data) ? data[0] : data;
  if (!renamed) throw new BaseInfoError("院系更名未返回新记录", 500, "RENAME_FAILED");
  return renamed;
};

export const normalizeDepartmentImportRow = (input, rowNumber = 1) => {
  const phone = text(input?.contact_phone).replace(/\D/g, "");
  const sortOrder = Number.parseInt(text(input?.sort_order), 10);
  const row = {
    school_name: text(input?.school_name) || "上海应用技术大学",
    department_name: text(input?.department_name),
    department_type: text(input?.department_type) || "本专科",
    contact_person: nullableText(input?.contact_person),
    contact_phone: phone || null,
    login_account: lower(input?.login_account),
    contact_address: nullableText(input?.contact_address),
    contact_postcode: nullableText(input?.contact_postcode),
    contact_fax: nullableText(input?.contact_fax),
    sort_order: sortOrder,
    status: "active",
  };
  if (!row.department_name) throw new BaseInfoError(`第 ${rowNumber} 行缺少院系名称`, 400, "INVALID_IMPORT_ROW");
  if (!row.login_account) throw new BaseInfoError(`第 ${rowNumber} 行缺少登录账号`, 400, "INVALID_IMPORT_ROW");
  if (!Number.isInteger(sortOrder) || sortOrder <= 0) {
    throw new BaseInfoError(`第 ${rowNumber} 行排序号必须为正整数`, 400, "INVALID_IMPORT_ROW");
  }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    throw new BaseInfoError(`第 ${rowNumber} 行联系电话必须为有效的 11 位手机号`, 400, "INVALID_IMPORT_ROW");
  }
  return row;
};

const assertDepartmentBatchUnique = (rows) => {
  const seen = {
    department_name: new Map(),
    login_account: new Map(),
    contact_phone: new Map(),
    sort_order: new Map(),
  };
  rows.forEach((row, index) => {
    for (const field of Object.keys(seen)) {
      const value = comparableValue(field, row[field]);
      if (!value && field === "contact_phone") continue;
      const first = seen[field].get(value);
      if (first !== undefined) {
        const label = DEPARTMENT_IMMUTABLE_FIELDS[field];
        throw new BaseInfoError(
          `第 ${first + 1} 行与第 ${index + 1} 行的${label}重复`,
          400,
          "DUPLICATE_IMPORT_ROW"
        );
      }
      seen[field].set(value, index);
    }
  });
};

const findSingleDisabledCandidate = (existingRows, row, usedIds) => {
  const candidates = existingRows.filter((existing) =>
    existing.status === "disabled"
    && !usedIds.has(existing.id)
    && (
      lower(existing.department_name) === lower(row.department_name)
      || lower(existing.login_account) === lower(row.login_account)
      || (row.contact_phone && text(existing.contact_phone) === row.contact_phone)
      || Number(existing.sort_order) === row.sort_order
    )
  );
  return candidates.length === 1 ? candidates[0] : null;
};

export const importDepartments = async (admin, profile, inputRows) => {
  requireAdmin(profile);
  if (!Array.isArray(inputRows) || inputRows.length === 0) {
    throw new BaseInfoError("院系导入数据不能为空", 400, "INVALID_REQUEST");
  }
  const rows = inputRows.map((row, index) => normalizeDepartmentImportRow(row, index + 1));
  assertDepartmentBatchUnique(rows);
  const existingRows = await listDepartments(admin, profile, { includeDisabled: true });
  const activeRows = existingRows.filter((row) => row.status === "active");
  const usedIds = new Set();
  const operations = rows.map((row, index) => {
    const conflict = activeRows.find((existing) =>
      lower(existing.department_name) === lower(row.department_name)
      || lower(existing.login_account) === lower(row.login_account)
      || (row.contact_phone && text(existing.contact_phone) === row.contact_phone)
      || Number(existing.sort_order) === row.sort_order
    );
    if (conflict) {
      throw new BaseInfoError(
        `第 ${index + 1} 行与已启用院系“${conflict.department_name}”冲突，请先删除原记录后重新导入`,
        409,
        "DUPLICATE_RECORD"
      );
    }
    const candidate = findSingleDisabledCandidate(existingRows, row, usedIds);
    if (candidate) usedIds.add(candidate.id);
    return { row, candidate };
  });

  let inserted = 0;
  let reactivated = 0;
  for (const operation of operations) {
    const query = operation.candidate
      ? admin.from("departments").update(operation.row).eq("id", operation.candidate.id)
      : admin.from("departments").insert(operation.row);
    const { error } = await query;
    if (error) throw translateDatabaseError(error);
    if (operation.candidate) reactivated += 1;
    else inserted += 1;
  }
  return { inserted, reactivated, total: rows.length };
};

export const listCounselors = async (admin, profile, { includeDisabled = false } = {}) => {
  requireAdmin(profile);
  let query = admin
    .from("user_profiles")
    .select("id,auth_user_id,role,college_name,display_name,login_email,phone,sort_order,enabled,created_at,updated_at")
    .eq("role", "college")
    .order("enabled", { ascending: false })
    .order("sort_order", { ascending: true });
  if (!includeDisabled) query = query.eq("enabled", true);
  const { data, error } = await query;
  if (error) throw translateDatabaseError(error);
  return data || [];
};

export const updateCounselor = async (admin, profile, id, input) => {
  requireAdmin(profile);
  const current = await ensureCounselor(admin, id);
  if (current.enabled === false) {
    throw new BaseInfoError("已禁用辅导员不可编辑，请先恢复记录", 409, "RECORD_DISABLED");
  }
  assertImmutableFieldsUnchanged(current, input || {}, COUNSELOR_IMMUTABLE_FIELDS);
  const changes = pickFields(input, COUNSELOR_EDITABLE_FIELDS);
  if (Object.keys(changes).length === 0) return current;
  const { data, error } = await admin
    .from("user_profiles")
    .update(changes)
    .eq("id", id)
    .select("id,auth_user_id,role,college_name,display_name,login_email,phone,sort_order,enabled,created_at,updated_at")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  return data;
};

export const disableCounselor = async (admin, profile, id) => {
  requireAdmin(profile);
  const current = await ensureCounselor(admin, id);
  if (current.enabled === false) return current;
  const { data, error } = await admin
    .from("user_profiles")
    .update({ enabled: false })
    .eq("id", id)
    .select("id,enabled")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  return data;
};

export const restoreCounselor = async (admin, profile, id) => {
  requireAdmin(profile);
  const current = await ensureCounselor(admin, id);
  if (current.enabled !== false) return current;
  const { data, error } = await admin
    .from("user_profiles")
    .update({ enabled: true })
    .eq("id", id)
    .select("id,auth_user_id,role,college_name,display_name,login_email,phone,sort_order,enabled,created_at,updated_at")
    .maybeSingle();
  if (error) throw translateDatabaseError(error);
  return data;
};

export const normalizeCounselorImportRow = (input, rowNumber = 1) => {
  const phone = text(input?.phone).replace(/\D/g, "");
  const sortOrder = Number.parseInt(text(input?.sort_order), 10);
  const row = {
    display_name: text(input?.display_name),
    college_name: text(input?.college_name),
    phone,
    login_email: lower(input?.login_email),
    sort_order: sortOrder,
  };
  if (!row.display_name) throw new BaseInfoError(`第 ${rowNumber} 行缺少辅导员姓名`, 400, "INVALID_IMPORT_ROW");
  if (!row.college_name) throw new BaseInfoError(`第 ${rowNumber} 行缺少所属院系`, 400, "INVALID_IMPORT_ROW");
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new BaseInfoError(`第 ${rowNumber} 行手机号必须为有效的 11 位手机号`, 400, "INVALID_IMPORT_ROW");
  }
  if (!row.login_email || !/^[^@\s]+@[^@\s]+$/.test(row.login_email)) {
    throw new BaseInfoError(`第 ${rowNumber} 行登录账号必须为有效邮箱`, 400, "INVALID_IMPORT_ROW");
  }
  if (!Number.isInteger(sortOrder) || sortOrder <= 0) {
    throw new BaseInfoError(`第 ${rowNumber} 行排序号必须为正整数`, 400, "INVALID_IMPORT_ROW");
  }
  return row;
};

const listAuthUsersByEmail = async (admin) => {
  const users = [];
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if ((data?.users || []).length < 1000) break;
    page += 1;
  }
  return new Map(users.map((user) => [lower(user.email), user]));
};

export const importCounselors = async (admin, profile, inputRows) => {
  requireAdmin(profile);
  if (!Array.isArray(inputRows) || inputRows.length === 0) {
    throw new BaseInfoError("辅导员导入数据不能为空", 400, "INVALID_REQUEST");
  }
  const rows = inputRows.map((row, index) => normalizeCounselorImportRow(row, index + 1));
  for (const [field, label] of [["phone", "手机号"], ["login_email", "登录账号"], ["sort_order", "排序号"]]) {
    const seen = new Map();
    rows.forEach((row, index) => {
      const value = comparableValue(field, row[field]);
      if (seen.has(value)) {
        throw new BaseInfoError(`第 ${seen.get(value) + 1} 行与第 ${index + 1} 行的${label}重复`, 400, "DUPLICATE_IMPORT_ROW");
      }
      seen.set(value, index);
    });
  }

  const [existingRows, departments, authUsers] = await Promise.all([
    listCounselors(admin, profile, { includeDisabled: true }),
    listDepartments(admin, profile, { includeDisabled: true }),
    listAuthUsersByEmail(admin),
  ]);
  const activeDepartments = new Set(
    departments.filter((row) => row.status === "active").map((row) => lower(row.department_name))
  );
  const activeRows = existingRows.filter((row) => row.enabled !== false);
  const usedIds = new Set();
  const operations = rows.map((row, index) => {
    if (!activeDepartments.has(lower(row.college_name))) {
      throw new BaseInfoError(`第 ${index + 1} 行所属院系“${row.college_name}”不存在或已禁用`, 400, "INVALID_REFERENCE");
    }
    const authUser = authUsers.get(row.login_email);
    if (!authUser) {
      throw new BaseInfoError(
        `第 ${index + 1} 行登录账号 ${row.login_email} 尚未创建 Supabase Auth 用户，请先创建认证账号后再导入`,
        400,
        "AUTH_USER_NOT_FOUND"
      );
    }
    const conflict = activeRows.find((existing) =>
      lower(existing.login_email) === row.login_email
      || text(existing.phone) === row.phone
      || Number(existing.sort_order) === row.sort_order
    );
    if (conflict) {
      throw new BaseInfoError(
        `第 ${index + 1} 行与已启用辅导员“${text(conflict.display_name) || text(conflict.college_name)}”冲突，请先删除原记录后重新导入`,
        409,
        "DUPLICATE_RECORD"
      );
    }
    const disabledMatches = existingRows.filter((existing) =>
      existing.enabled === false
      && !usedIds.has(existing.id)
      && (
        existing.auth_user_id === authUser.id
        || lower(existing.login_email) === row.login_email
        || text(existing.phone) === row.phone
        || Number(existing.sort_order) === row.sort_order
      )
    );
    const candidate = disabledMatches.length === 1 ? disabledMatches[0] : null;
    if (candidate) usedIds.add(candidate.id);
    return { row, authUser, candidate };
  });

  let inserted = 0;
  let reactivated = 0;
  for (const operation of operations) {
    const payload = {
      auth_user_id: operation.authUser.id,
      role: "college",
      college_name: operation.row.college_name,
      display_name: operation.row.display_name,
      login_email: operation.row.login_email,
      phone: operation.row.phone,
      sort_order: operation.row.sort_order,
      enabled: true,
    };
    const query = operation.candidate
      ? admin.from("user_profiles").update(payload).eq("id", operation.candidate.id)
      : admin.from("user_profiles").insert(payload);
    const { error } = await query;
    if (error) throw translateDatabaseError(error);
    if (operation.candidate) reactivated += 1;
    else inserted += 1;
  }
  return { inserted, reactivated, total: rows.length };
};
