import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { TabItem, TabState, TabActions } from "../types/tab";

interface TabContextType extends TabState, TabActions {}

const TabContext = createContext<TabContextType | null>(null);

let tabIdCounter = 0;

function generateTabId(): string {
  return `tab-${Date.now()}-${++tabIdCounter}`;
}

export function TabProvider({ children, initialPath, initialTitle }: { children: ReactNode; initialPath: string; initialTitle: string }) {
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      id: generateTabId(),
      path: initialPath,
      title: initialTitle,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || "");

  const addTab = useCallback((tab: Omit<TabItem, "id">) => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === tab.path);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      const newTab = { ...tab, id: generateTabId() };
      setActiveTabId(newTab.id);
      return [...prev, newTab];
    });
  }, []);

  const removeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);
      if (newTabs.length === 0) {
        return prev;
      }
      if (prev.find((t) => t.id === tabId)?.id === activeTabId) {
        const currentIndex = prev.findIndex((t) => t.id === tabId);
        const newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        setActiveTabId(newTabs[newIndex].id);
      }
      return newTabs;
    });
  }, [activeTabId]);

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const updateTabTitle = useCallback((tabId: string, title: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, title } : t))
    );
  }, []);

  const clearAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId("");
  }, []);

  return (
    <TabContext.Provider
      value={{
        tabs,
        activeTabId,
        addTab,
        removeTab,
        activateTab,
        updateTabTitle,
        clearAllTabs,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}

export function useTabs(): TabContextType {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error("useTabs must be used within a TabProvider");
  }
  return context;
}