import { motion, AnimatePresence } from "framer-motion";
import { useTabs } from "../../contexts/TabContext";

export default function TabBar() {
  const { tabs, activeTabId, activateTab, removeTab } = useTabs();

  if (tabs.length === 0) return null;

  return (
    <div className="bos-tab-bar">
      <div className="bos-tab-bar-scroll">
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <motion.div
              key={tab.id}
              initial={{ opacity: 0, y: -10, width: 0 }}
              animate={{ opacity: 1, y: 0, width: "auto" }}
              exit={{ opacity: 0, x: -20, width: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={`bos-tab-item${activeTabId === tab.id ? " is-active" : ""}`}
            >
              <motion.button
                onClick={() => activateTab(tab.id)}
                className="bos-tab-button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.1 }}
              >
                {tab.icon && <span className="bos-tab-icon">{tab.icon}</span>}
                <span className="bos-tab-label">{tab.title}</span>
              </motion.button>
              {tabs.length > 1 && (
                <motion.button
                  onClick={() => removeTab(tab.id)}
                  className="bos-tab-close"
                  whileHover={{ scale: 1.1, opacity: 1 }}
                  whileTap={{ scale: 0.9 }}
                  initial={{ opacity: 0.5 }}
                >
                  ×
                </motion.button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}