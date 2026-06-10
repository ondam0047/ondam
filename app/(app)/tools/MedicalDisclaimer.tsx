// 비의료기기 면책 — 모든 바로툴(음성·학습 모듈) 화면 하단 공통.
export default function MedicalDisclaimer() {
  return (
    <p
      style={{
        marginTop: 28,
        paddingTop: 14,
        borderTop: "1px solid var(--border)",
        fontSize: 12,
        lineHeight: 1.7,
        color: "var(--text-mute)",
        wordBreak: "keep-all",
      }}
    >
      본 도구는 「의료기기법」의 적용을 받지 않는 학습·연습·시각화 보조 도구이며,
      의료 진단·치료를 제공하거나 대체하지 않습니다. 측정·시각화 데이터는 치료사의
      전문 판단을 돕기 위한 자료입니다.
    </p>
  );
}
