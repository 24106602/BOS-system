export type AnnouncementPriority = "normal" | "important" | "urgent";

export type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  publisher: string;
  publishedAt: string;
};

const STORAGE_KEY = "bos_announcements";

const defaultAnnouncements: Announcement[] = [
  {
    id: "welcome",
    title: "欢迎使用学部（院）业务工作台",
    content:
      "请各学院经办人及时完成本专科信息和家庭成员信息的上传与治理工作，确保数据准确无误后上载至学校端。",
    priority: "important",
    publisher: "学校资助管理中心",
    publishedAt: new Date().toISOString(),
  },
];

export function getAnnouncements(): Announcement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultAnnouncements));
      return defaultAnnouncements;
    }
    const parsed = JSON.parse(raw) as Announcement[];
    if (!Array.isArray(parsed)) return defaultAnnouncements;
    return parsed.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  } catch {
    return defaultAnnouncements;
  }
}

export function saveAnnouncement(announcement: Omit<Announcement, "id" | "publishedAt">): Announcement {
  const list = getAnnouncements();
  const item: Announcement = {
    ...announcement,
    id: `ann_${Date.now()}`,
    publishedAt: new Date().toISOString(),
  };
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return item;
}

export function deleteAnnouncement(id: string): void {
  const list = getAnnouncements().filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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
