'use client';

export default function StreamMessage({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
      {content}
      {streaming && (
        <span className="inline-block w-2 h-4 ml-0.5 align-middle bg-cyan-500 animate-pulse" />
      )}
    </div>
  );
}
