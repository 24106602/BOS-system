import { useCallback, useEffect, useState } from "react";
import {
  getDifficultyRecognitionWindow,
  type DifficultyRecognitionWindow,
} from "../services/difficultyStudentApi";

export type DifficultyRecognitionWindowState = DifficultyRecognitionWindow & {
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const makeInitialState = (academicYear: string): DifficultyRecognitionWindow => ({
  academicYear,
  startDate: "",
  endDate: "",
  currentDate: "",
  configured: false,
  isOpen: false,
  message: "正在读取困难生认定时间配置",
});

export const useDifficultyRecognitionWindow = (
  academicYear: string
): DifficultyRecognitionWindowState => {
  const [windowInfo, setWindowInfo] = useState<DifficultyRecognitionWindow>(
    () => makeInitialState(academicYear)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getDifficultyRecognitionWindow(academicYear);
      setWindowInfo(result.data);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "困难生认定时间配置读取失败";
      setWindowInfo({
        ...makeInitialState(academicYear),
        message: `无法读取认定时间配置，相关操作暂不可用：${message}`,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const isStaleAcademicYear = windowInfo.academicYear !== academicYear;
  return {
    ...(isStaleAcademicYear ? makeInitialState(academicYear) : windowInfo),
    loading: loading || isStaleAcademicYear,
    error,
    refresh,
  };
};
