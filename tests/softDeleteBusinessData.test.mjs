import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Supabase 业务服务不再调用物理 delete", async () => {
  const sources = await Promise.all([
    read("src/services/supabaseDataService.ts"),
    read("src/services/supabaseAwardService.ts"),
    read("server/difficultyReviewWorkflow.js"),
  ]);
  sources.forEach((source) => {
    assert.doesNotMatch(source, /\.from\([^\n]+\)[\s\S]{0,120}?\.delete\s*\(/);
  });
});

test("IndexedDB 和 localStorage 业务降级层使用禁用标记", async () => {
  const sources = await Promise.all([
    read("src/db/localStudentDb.ts"),
    read("src/db/localEnrolledStudentDb.ts"),
    read("src/db/localMergeDb.ts"),
    read("src/db/localAwardDb.ts"),
    read("src/services/announcementService.ts"),
  ]);
  sources.forEach((source) => {
    assert.doesNotMatch(source, /objectStore\([^)]*\)\.delete\s*\(/);
    assert.doesNotMatch(source, /objectStore\([^)]*\)\.clear\s*\(/);
    assert.doesNotMatch(source, /localStorage\.removeItem\s*\(/);
    assert.match(source, /isDeleted|is_deleted|status:\s*"disabled"/);
  });
});

test("迁移为业务表增加软删除并在数据库层阻止物理删除", async () => {
  const migration = await read(
    "supabase/migrations/20260721122609_soft_delete_business_records.sql"
  );
  assert.match(migration, /add column if not exists is_deleted boolean not null default false/);
  assert.match(migration, /prevent_business_hard_delete/);
  assert.match(migration, /set\s+is_deleted\s*=\s*true/i);
  assert.match(migration, /replace_department_for_rename/);
  assert.doesNotMatch(
    migration,
    /create or replace function public\.delete_difficulty_student_with_log[\s\S]*?delete\s+from\s+public\.students/i
  );
});
