export type AnnouncementPriority = "normal" | "important" | "urgent";

export type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  publisher: string;
  publishedAt: string;
  status: "active" | "disabled";
  deletedAt?: string;
};

export type AnnouncementQuery = {
  keyword?: string;
  startDate?: string;
  endDate?: string;
  priority?: AnnouncementPriority | "";
};

const STORAGE_KEY = "bos_announcements";

const defaultAnnouncements: Announcement[] = [
  {
    id: "welcome",
    title: "欢迎使用业务工作台",
    content:
      "请各学院经办人及时完成本专科信息和家庭成员信息的上传与治理工作，确保数据准确无误后上载至学校端。",
    priority: "important",
    publisher: "学校资助管理中心",
    publishedAt: new Date().toISOString(),
    status: "active",
  },
];

export function getAnnouncements(options: { includeDisabled?: boolean } = {}): Announcement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultAnnouncements));
      return defaultAnnouncements;
    }
    const parsed = (JSON.parse(raw) as Array<Partial<Announcement>>).map((item) => ({
      ...item,
      status: item.status === "disabled" ? "disabled" as const : "active" as const,
    })) as Announcement[];
    if (!Array.isArray(parsed)) return defaultAnnouncements;
    return parsed
      .filter((item) => options.includeDisabled || item.status !== "disabled")
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  } catch {
    return defaultAnnouncements;
  }
}

export function queryAnnouncements(query: AnnouncementQuery): Announcement[] {
  let list = getAnnouncements();

  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(kw) ||
          a.content.toLowerCase().includes(kw) ||
          a.publisher.toLowerCase().includes(kw)
      );
    }
  }

  if (query.priority) {
    list = list.filter((a) => a.priority === query.priority);
  }

  if (query.startDate) {
    const start = new Date(query.startDate + "T00:00:00").getTime();
    list = list.filter((a) => new Date(a.publishedAt).getTime() >= start);
  }

  if (query.endDate) {
    const end = new Date(query.endDate + "T23:59:59").getTime();
    list = list.filter((a) => new Date(a.publishedAt).getTime() <= end);
  }

  return list;
}

export function saveAnnouncement(
  announcement: Omit<Announcement, "id" | "publishedAt" | "status" | "deletedAt">
): Announcement {
  const list = getAnnouncements();
  const item: Announcement = {
    ...announcement,
    id: `ann_${Date.now()}`,
    publishedAt: new Date().toISOString(),
    status: "active",
  };
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function updateAnnouncement(
  id: string,
  patch: Partial<Omit<Announcement, "id" | "publishedAt" | "status" | "deletedAt">>
): void {
  const list = getAnnouncements({ includeDisabled: true });
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function deleteAnnouncement(id: string): void {
  const list = getAnnouncements({ includeDisabled: true }).map((announcement) =>
    announcement.id === id
      ? { ...announcement, status: "disabled" as const, deletedAt: new Date().toISOString() }
      : announcement
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function restoreAnnouncement(id: string): void {
  const list = getAnnouncements({ includeDisabled: true }).map((announcement) =>
    announcement.id === id
      ? { ...announcement, status: "active" as const, deletedAt: undefined }
      : announcement
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getAnnouncementById(id: string): Announcement | null {
  return getAnnouncements().find((a) => a.id === id) || null;
}

export function formatAnnouncementTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatAnnouncementDate(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

export const priorityLabel: Record<AnnouncementPriority, string> = {
  normal: "通知",
  important: "重要",
  urgent: "紧急",
};
