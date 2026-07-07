export interface TabItem {
  id: string;
  path: string;
  title: string;
  icon?: string;
}

export interface TabState {
  tabs: TabItem[];
  activeTabId: string;
}

export interface TabActions {
  addTab: (tab: Omit<TabItem, "id">) => void;
  removeTab: (tabId: string) => void;
  activateTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  clearAllTabs: () => void;
}