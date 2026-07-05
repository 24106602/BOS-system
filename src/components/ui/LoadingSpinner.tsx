export default function LoadingSpinner({ text = "加载中..." }: { text?: string }) {
  return (
    <div className="bos-loading">
      <span className="bos-loading-spinner" />
      <span>{text}</span>
    </div>
  );
}
