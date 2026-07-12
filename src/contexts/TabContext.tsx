import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
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

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const addTab = useCallback((tab: Omit<TabItem, "id">) => {
    const existing = tabsRef.current.find((t) => t.path === tab.path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab = { ...tab, id: generateTabId() };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const removeTab = useCallback((tabId: string) => {
    const current = tabsRef.current;
    const newTabs = current.filter((t) => t.id !== tabId);
    if (newTabs.length === 0) {
      return;
    }
    const removedIndex = current.findIndex((t) => t.id === tabId);
    const newIndex = removedIndex > 0 ? removedIndex - 1 : 0;
    setTabs(newTabs);
    setActiveTabId((prevActive) => {
      if (prevActive === tabId) {
        return newTabs[newIndex].id;
      }
      return prevActive;
    });
  }, []);

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