"use client";

import { useState } from "react";
import {
  saveVoiceLabRecord,
  type VoiceLabModuleId,
} from "./voiceLabHistory";

interface Props {
  moduleId: VoiceLabModuleId;
  summary: Record<string, number | string>;
  disabled?: boolean;
  /** 기본 환자/대상자 이름 (선택). */
  defaultClientName?: string;
  /** 저장 후 표시할 추가 메시지. */
  saveHint?: string;
}

export default function SaveToHistory({
  moduleId,
  summary,
  disabled,
  defaultClientName = "",
  saveHint,
}: Props) {
  const [client, setClient] = useState(defaultClientName);
  const [notes, setNotes] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const onSave = () => {
    if (disabled) return;
    const rec = saveVoiceLabRecord({
      moduleId,
      clientName: client.trim(),
      notes: notes.trim() || undefined,
      summary,
    });
    setSavedId(rec.id);
    setTimeout(() => setSavedId(null), 4000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">기록 저장</h4>
        <span className="text-xs text-slate-400">이 브라우저에만 저장돼요</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          placeholder="대상자 이름 / ID (선택)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="비고 (선택)"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={disabled}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          기록에 저장
        </button>
        {savedId && (
          <span className="text-xs text-emerald-700">
            ✓ 저장됨 {saveHint ? `· ${saveHint}` : ""}
          </span>
        )}
        {!savedId && saveHint && (
          <span className="text-xs text-slate-500">{saveHint}</span>
        )}
      </div>
    </div>
  );
}
